#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import {
  assertCommandAllowedForJob,
  buildApprovalCommandPlan,
  buildCancelJobPlan,
  buildLearningCommandPlan,
  buildRetryJobPlan,
  buildUnsupportedCommandPlan,
  classifyCommand,
} from './app-factory-command-loop.mjs';
import {
  approvalDecisionPlan,
  artifactPlan,
  commandAcknowledgementPlan,
  createStaticJobPlan,
  finalUrlPlan,
  milestonePlan,
  resourcePlan,
} from './app-factory-state.mjs';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      index += 1;
    }
  }

  return { command, flags };
}

function boolFlag(flags, name) {
  return flags[name] === true || flags[name] === 'true';
}

function jsonFlag(flags, name) {
  if (!flags[name] || flags[name] === true) return {};
  return JSON.parse(String(flags[name]));
}

function requireCredentials(dryRun) {
  if (!dryRun && (!supabaseUrl || !serviceRoleKey)) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required without --dry-run');
  }
}

async function supabaseFetch(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase ${path} failed: ${response.status} ${body}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function insert(table, row) {
  return supabaseFetch(table, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
}

async function patchById(table, id, patch) {
  return supabaseFetch(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
}

async function read(path) {
  return supabaseFetch(path, { method: 'GET' });
}

async function nextSequence(buildJobId, dryRun) {
  if (dryRun) return 99;
  const rows = await read(`job_step_events?select=sequence&build_job_id=eq.${encodeURIComponent(buildJobId)}&order=sequence.desc&limit=1`);
  return (rows?.[0]?.sequence || 0) + 1;
}

async function readCommand(commandId) {
  return (await read(`command_requests?select=*&id=eq.${encodeURIComponent(commandId)}&limit=1`))?.[0] || null;
}

async function readBuildJob(buildJobId) {
  if (!buildJobId) return null;
  return (await read(`build_jobs?select=id,status&id=eq.${encodeURIComponent(buildJobId)}&limit=1`))?.[0] || null;
}

async function readApprovalForCommand(command) {
  if (command.target_type === 'approval' && command.target_id) {
    return (await read(`job_approvals?select=id,build_job_id,approval_type,status&id=eq.${encodeURIComponent(command.target_id)}&limit=1`))?.[0] || null;
  }

  const approvalType = ['approve_deploy', 'reject_deploy'].includes(command.command_type) ? 'deploy' : 'build';
  if (!command.build_job_id) return null;

  return (await read([
    'job_approvals?select=id,build_job_id,approval_type,status',
    `build_job_id=eq.${encodeURIComponent(command.build_job_id)}`,
    `approval_type=eq.${encodeURIComponent(approvalType)}`,
    'status=eq.pending',
    'order=requested_at.asc',
    'limit=1',
  ].join('&')))?.[0] || null;
}

function dryRunResult(command, plan, operations = []) {
  return {
    dryRun: true,
    command,
    telegram: plan.telegram,
    plan,
    operations,
  };
}

async function createStaticJob(flags, dryRun) {
  const plan = createStaticJobPlan({
    title: flags.title,
    goal: flags.goal,
    slug: flags.slug,
    features: flags.features,
    accessMode: flags['access-mode'],
    templateId: flags.template,
    proposedStack: flags.stack,
    requestMessageRef: flags['request-ref'],
    externalKey: flags['external-key'],
    metadata: jsonFlag(flags, 'metadata'),
  });

  if (dryRun) {
    return dryRunResult('create-static-job', plan, [
      { table: 'build_jobs', row: plan.buildJob },
      { table: 'job_step_events', row: { ...plan.initialStep, build_job_id: '<created-build-job-id>' } },
      { table: 'job_approvals', row: { ...plan.buildApproval, build_job_id: '<created-build-job-id>' } },
    ]);
  }

  const [job] = await insert('build_jobs', plan.buildJob);
  await insert('job_step_events', { ...plan.initialStep, build_job_id: job.id });
  await insert('job_approvals', { ...plan.buildApproval, build_job_id: job.id });

  return { telegram: plan.telegram, buildJobId: job.id, slug: job.slug };
}

async function recordMilestone(flags, dryRun) {
  const plan = milestonePlan({
    buildJobId: flags['job-id'],
    sequence: flags.sequence,
    stage: flags.stage,
    status: flags.status,
    title: flags.title,
    detail: flags.detail,
    jobStatus: flags['job-status'],
    metadata: jsonFlag(flags, 'metadata'),
  });

  if (dryRun) {
    return dryRunResult('record-milestone', plan, [
      { table: 'job_step_events', row: plan.event },
      ...(plan.jobStatus ? [{ table: 'build_jobs', id: flags['job-id'], patch: { status: plan.jobStatus } }] : []),
    ]);
  }

  await insert('job_step_events', plan.event);
  if (plan.jobStatus) await patchById('build_jobs', flags['job-id'], { status: plan.jobStatus });
  return { telegram: plan.telegram };
}

async function recordApproval(flags, dryRun) {
  const sequence = flags.sequence || await nextSequence(flags['job-id'], dryRun);
  const currentApproval = dryRun
    ? { status: 'pending' }
    : (await read(`job_approvals?select=status&id=eq.${encodeURIComponent(flags['approval-id'])}&limit=1`))?.[0];
  if (!currentApproval) throw new Error(`Approval not found: ${flags['approval-id']}`);

  const plan = approvalDecisionPlan({
    approvalId: flags['approval-id'],
    buildJobId: flags['job-id'],
    approvalType: flags.type,
    decision: flags.decision,
    note: flags.note,
    sequence,
    currentStatus: currentApproval.status,
  });

  if (dryRun) {
    return dryRunResult('record-approval', plan, [
      { table: 'job_approvals', id: flags['approval-id'], patch: plan.approvalPatch },
      { table: 'build_jobs', id: flags['job-id'], patch: plan.jobPatch },
      { table: 'job_step_events', row: plan.event },
    ]);
  }

  await patchById('job_approvals', flags['approval-id'], plan.approvalPatch);
  await patchById('build_jobs', flags['job-id'], plan.jobPatch);
  await insert('job_step_events', plan.event);
  return { telegram: plan.telegram };
}

async function recordResource(flags, dryRun) {
  const plan = resourcePlan({
    buildJobId: flags['job-id'],
    appId: flags['app-id'],
    resourceType: flags.type,
    provider: flags.provider,
    name: flags.name,
    externalId: flags['external-id'],
    url: flags.url,
    environment: flags.environment,
    status: flags.status,
    secretNames: flags['secret-names'] ? String(flags['secret-names']).split(',').map((item) => item.trim()).filter(Boolean) : [],
    metadata: jsonFlag(flags, 'metadata'),
  });

  if (dryRun) return dryRunResult('record-resource', plan, [{ table: 'app_resources', row: plan.resource }]);
  await insert('app_resources', plan.resource);
  return { telegram: plan.telegram };
}

async function recordArtifact(flags, dryRun) {
  const plan = artifactPlan({
    buildJobId: flags['job-id'],
    deploymentId: flags['deployment-id'],
    artifactType: flags.type,
    title: flags.title,
    url: flags.url,
    storagePath: flags['storage-path'],
    summary: flags.summary,
    metadata: jsonFlag(flags, 'metadata'),
  });

  if (dryRun) return dryRunResult('record-artifact', plan, [{ table: 'proof_artifacts', row: plan.artifact }]);
  await insert('proof_artifacts', plan.artifact);
  return { telegram: plan.telegram };
}

async function recordFinalUrl(flags, dryRun) {
  const sequence = flags.sequence || await nextSequence(flags['job-id'], dryRun);
  const plan = finalUrlPlan({
    buildJobId: flags['job-id'],
    appId: flags['app-id'],
    url: flags.url,
    name: flags.name,
    sequence,
  });

  if (dryRun) {
    return dryRunResult('record-final-url', plan, [
      { table: 'build_jobs', id: flags['job-id'], patch: plan.jobPatch },
      { table: 'app_resources', row: plan.resource },
      { table: 'job_step_events', row: plan.event },
    ]);
  }

  await patchById('build_jobs', flags['job-id'], plan.jobPatch);
  await insert('app_resources', plan.resource);
  await insert('job_step_events', plan.event);
  return { telegram: plan.telegram };
}

async function pollCommands(flags, dryRun) {
  if (dryRun) {
    return {
      dryRun: true,
      command: 'poll-commands',
      query: 'command_requests?status=eq.pending&order=requested_at.asc',
    };
  }

  const limit = Number(flags.limit || 10);
  const rows = await read(`command_requests?select=*&status=eq.pending&order=requested_at.asc&limit=${limit}`);
  return {
    telegram: rows.length ? `${rows.length} pending Mission Control command request(s).` : 'No pending Mission Control command requests.',
    commandRequests: rows,
  };
}

async function acknowledgeCommand(flags, dryRun) {
  const plan = commandAcknowledgementPlan({
    commandId: flags['command-id'],
    status: flags.status,
    message: flags.message,
  });

  if (dryRun) {
    return dryRunResult('ack-command', plan, [
      { table: 'command_requests', id: flags['command-id'], patch: plan.commandPatch },
    ]);
  }

  await patchById('command_requests', flags['command-id'], plan.commandPatch);
  return { telegram: plan.telegram };
}

async function applyCommandAcknowledgement(commandId, status, message) {
  const plan = commandAcknowledgementPlan({ commandId, status, message });
  await patchById('command_requests', commandId, plan.commandPatch);
  return plan;
}

async function processCommandRecord(command, dryRun) {
  const commandKind = classifyCommand(command.command_type);

  if (dryRun) {
    return dryRunResult('process-command', { telegram: `Would process ${command.command_type}` }, [
      { table: 'command_requests', id: command.id, patch: { status: 'acknowledged' } },
      { kind: commandKind, command },
      { table: 'command_requests', id: command.id, patch: { status: 'completed' } },
    ]);
  }

  if (command.status !== 'pending') throw new Error(`Command is not pending: ${command.status}`);

  await applyCommandAcknowledgement(command.id, 'acknowledged', 'OpenClaw accepted this request.');

  try {
    let telegram;

    if (commandKind === 'approval') {
      const approval = await readApprovalForCommand(command);
      if (!approval) throw new Error(`Approval target not found for ${command.command_type}`);
      const buildJobId = command.build_job_id || approval.build_job_id;
      assertCommandAllowedForJob(command, await readBuildJob(buildJobId));
      const sequence = await nextSequence(buildJobId, false);
      const plan = buildApprovalCommandPlan(command, approval, sequence);
      await patchById('job_approvals', approval.id, plan.approvalPatch);
      await patchById('build_jobs', buildJobId, plan.jobPatch);
      await insert('job_step_events', plan.event);
      telegram = plan.telegram;
    } else if (commandKind === 'cancel') {
      assertCommandAllowedForJob(command, await readBuildJob(command.build_job_id));
      const sequence = await nextSequence(command.build_job_id, false);
      const plan = buildCancelJobPlan(command, sequence);
      await patchById('build_jobs', command.build_job_id, plan.jobPatch);
      await insert('job_step_events', plan.event);
      telegram = plan.telegram;
    } else if (commandKind === 'retry') {
      const jobForRetry = await readBuildJob(command.build_job_id);
      assertCommandAllowedForJob(command, jobForRetry);
      if (!jobForRetry || !['failed', 'blocked'].includes(jobForRetry.status)) {
        const sequence = await nextSequence(command.build_job_id, false);
        await insert('job_step_events', {
          build_job_id: command.build_job_id,
          sequence,
          stage: 'retry',
          status: 'rejected',
          title: 'retry rejected: job is not in a retryable state',
          detail: `Job status is '${jobForRetry?.status || 'unknown'}'. Only 'failed' or 'blocked' jobs can be retried.`,
          actor_label: 'OpenClaw',
        });
        telegram = `Retry rejected for job ${command.build_job_id}: job is not in a retryable state (status: ${jobForRetry?.status || 'unknown'}).`;
      } else {
        await patchById('build_jobs', command.build_job_id, { status: 'build_approved' });
        const sequence = await nextSequence(command.build_job_id, false);
        await insert('job_step_events', {
          build_job_id: command.build_job_id,
          sequence,
          stage: 'retry',
          status: 'initiated',
          title: 'retry initiated: job reset to build_approved',
          detail: `Job reset from '${jobForRetry.status}' to 'build_approved' for retry.`,
          actor_label: 'OpenClaw',
        });
        await insert('command_requests', {
          build_job_id: command.build_job_id,
          command_type: 'retry_build',
          status: 'pending',
          requested_by_label: 'OpenClaw',
          target_type: 'build_job',
          target_id: command.build_job_id,
          result_summary: `Retry queued from command ${command.id}`,
        });
        console.log(`[retry] Job ${command.build_job_id} reset to build_approved. New retry_build command queued.`);
        telegram = `Retry initiated for job ${command.build_job_id}. Job reset to build_approved and queued for next OpenClaw poll.`;
      }
    } else if (commandKind === 'learning') {
      const plan = buildLearningCommandPlan(command);
      await patchById('learning_proposals', command.target_id, plan.proposalPatch);
      telegram = plan.telegram;
    } else {
      const plan = buildUnsupportedCommandPlan(command);
      await patchById('command_requests', command.id, plan.commandPatch);
      return { telegram: plan.telegram, commandId: command.id, status: 'rejected' };
    }

    await applyCommandAcknowledgement(command.id, 'completed', telegram);
    return { telegram, commandId: command.id, status: 'completed' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await applyCommandAcknowledgement(command.id, 'failed', message);
    throw error;
  }
}

async function processCommand(flags, dryRun) {
  if (dryRun) {
    const command = jsonFlag(flags, 'command-json');
    if (!command.id) throw new Error('--command-json with an id is required for process-command --dry-run');
    return processCommandRecord(command, true);
  }

  const commandId = flags['command-id'];
  if (!commandId) throw new Error('--command-id is required');
  const command = await readCommand(commandId);
  if (!command) throw new Error(`Command request not found: ${commandId}`);
  return processCommandRecord(command, false);
}

async function cleanStaleCommands(flags, dryRun) {
  const hours = Number(flags['older-than-hours'] || 24);
  if (Number.isNaN(hours) || hours <= 0) throw new Error('--older-than-hours must be a positive number');

  if (dryRun) {
    if (supabaseUrl && serviceRoleKey) {
      const rows = await read(
        `command_requests?select=id,command_type,created_at&status=eq.pending&created_at=lt.${encodeURIComponent(new Date(Date.now() - hours * 60 * 60 * 1000).toISOString())}&order=created_at.asc`
      );
      console.log(`[dry-run] Would expire ${rows.length} stale pending command(s) older than ${hours}h:`);
      for (const row of rows) console.log(`  - ${row.id} (${row.command_type}) created ${row.created_at}`);
      return { dryRun: true, wouldExpire: rows.length, rows };
    }
    const cutoffIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    console.log(`[dry-run] Would query: command_requests where status=pending AND created_at < ${cutoffIso}`);
    console.log(`[dry-run] Would set: status=expired, decided_at=now(), decision_note='auto-expired: stale pending command'`);
    return { dryRun: true, olderThanHours: hours, cutoff: cutoffIso };
  }

  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const rows = await read(
    `command_requests?select=id,command_type,created_at&status=eq.pending&created_at=lt.${encodeURIComponent(cutoff)}&order=created_at.asc`
  );

  for (const row of rows) {
    await patchById('command_requests', row.id, {
      status: 'expired',
      decided_at: new Date().toISOString(),
      decision_note: 'auto-expired: stale pending command',
    });
    console.log(`[expire] ${row.id} (${row.command_type}) created ${row.created_at}`);
  }

  console.log(`[clean-stale-commands] Expired ${rows.length} stale pending command(s) older than ${hours}h.`);
  return {
    telegram: rows.length
      ? `Expired ${rows.length} stale pending Mission Control command(s) older than ${hours}h.`
      : `No stale pending Mission Control commands found (threshold: ${hours}h).`,
    expired: rows.length,
  };
}

async function processCommands(flags, dryRun) {
  if (dryRun) {
    return {
      dryRun: true,
      command: 'process-commands',
      query: 'command_requests?status=eq.pending&order=requested_at.asc',
    };
  }

  const limit = Number(flags.limit || 10);
  const rows = await read(`command_requests?select=*&status=eq.pending&order=requested_at.asc&limit=${limit}`);
  const results = [];

  for (const command of rows) {
    try {
      results.push(await processCommandRecord(command, false));
    } catch (error) {
      results.push({
        commandId: command.id,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    telegram: results.length ? `Processed ${results.length} Mission Control command request(s).` : 'No pending Mission Control command requests.',
    results,
  };
}

export async function run(argv = process.argv.slice(2)) {
  const { command, flags } = parseArgs(argv);
  const dryRun = boolFlag(flags, 'dry-run');
  requireCredentials(dryRun);

  const handlers = {
    'create-static-job': createStaticJob,
    'record-milestone': recordMilestone,
    'record-approval': recordApproval,
    'record-resource': recordResource,
    'record-artifact': recordArtifact,
    'record-final-url': recordFinalUrl,
    'poll-commands': pollCommands,
    'ack-command': acknowledgeCommand,
    'process-command': processCommand,
    'process-commands': processCommands,
    'clean-stale-commands': cleanStaleCommands,
  };

  const handler = handlers[command];
  if (!handler) throw new Error(`Unsupported App Factory command: ${command || '(missing)'}`);

  return handler(flags, dryRun);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
