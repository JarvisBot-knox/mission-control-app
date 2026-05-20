#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
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
