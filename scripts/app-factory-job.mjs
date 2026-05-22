#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import {
  ACCESS_MODES,
  APPROVAL_DECISIONS,
  COMMAND_ACK_STATUSES,
  STATIC_TEMPLATE_IDS,
  artifactPlan,
  assertNoRawSecrets,
  compactList,
  finalUrlPlan,
  milestonePlan,
  resourcePlan,
  slugify,
} from './app-factory-contract.mjs';

export {
  artifactPlan,
  assertNoRawSecrets,
  compactList,
  finalUrlPlan,
  milestonePlan,
  resourcePlan,
  slugify,
};

export function createStaticJobPlan(input) {
  const title = String(input.title || '').trim();
  const goal = String(input.goal || input.description || '').trim();
  if (!title) throw new Error('Static job title is required');
  if (!goal) throw new Error('Static job goal is required');

  const templateId = input.templateId || 'premium_static_app';
  if (!STATIC_TEMPLATE_IDS.has(templateId)) {
    throw new Error(`Unsupported static template: ${templateId}`);
  }

  const accessMode = input.accessMode || 'public';
  if (!ACCESS_MODES.has(accessMode)) {
    throw new Error(`Unsupported access mode: ${accessMode}`);
  }

  const features = compactList(input.features);
  const slug = slugify(input.slug || title);
  const proposedStack = input.proposedStack || (templateId === 'operator_dashboard' ? 'Next.js App Router + Vercel' : 'Next.js static app + Vercel');
  const compactSummary = {
    appName: title,
    goal,
    templateId,
    features,
    dataNeeds: 'none',
    accessMode,
    proposedStack,
    risks: accessMode === 'public' ? ['public_preview'] : ['private_preview_access'],
    estimatedSteps: [
      'create private repo',
      'apply template',
      'customize app',
      'run checks',
      'deploy preview',
      'request production approval',
    ],
  };

  assertNoRawSecrets(input.metadata || {});

  return {
    telegram: [
      `Build proposal: ${title}`,
      `Goal: ${goal}`,
      `Template: ${templateId}`,
      `Stack: ${proposedStack}`,
      `Access: ${accessMode}`,
      `Features: ${features.length ? features.join(', ') : 'to be refined during build'}`,
      'Approval needed: build',
    ].join('\n'),
    buildJob: {
      external_key: input.externalKey || null,
      title,
      slug,
      request_channel: input.requestChannel || 'telegram',
      request_message_ref: input.requestMessageRef || null,
      requested_by_label: input.requestedByLabel || 'Trevor',
      status: 'awaiting_build_approval',
      app_goal: goal,
      app_type: 'static',
      proposed_stack: proposedStack,
      access_mode: accessMode,
      data_needs: 'none',
      risk_summary: compactSummary.risks.join(', '),
      compact_summary: compactSummary,
      metadata: {
        templateId,
        features,
        source: 'app-factory-job',
        ...(input.metadata || {}),
      },
    },
    initialStep: {
      sequence: 1,
      stage: 'request',
      status: 'completed',
      title: 'Telegram request structured',
      detail: goal,
      actor_label: 'OpenClaw',
      channel: 'telegram',
      metadata: { templateId, features },
    },
    buildApproval: {
      approval_type: 'build',
      status: 'pending',
      risk_category: 'implementation',
      requested_action: `Build preview for ${title}`,
      requested_channel: 'telegram',
      requested_by_label: 'OpenClaw',
      summary: `Approve implementation of ${title} using ${templateId}.`,
      metadata: { templateId, accessMode },
    },
  };
}

export function approvalDecisionPlan(input) {
  if (!input.approvalId) throw new Error('approvalId is required');
  if (!input.buildJobId) throw new Error('buildJobId is required');
  if (!APPROVAL_DECISIONS.has(input.decision)) throw new Error(`Unsupported approval decision: ${input.decision}`);
  if ((input.currentStatus || 'pending') !== 'pending') {
    throw new Error(`Approval already decided: ${input.currentStatus}`);
  }

  const approvalType = input.approvalType || 'build';
  const approved = input.decision === 'approved';
  const nextStatus = approved
    ? (approvalType === 'deploy' ? 'deploy_approved' : 'build_approved')
    : 'blocked';
  const sequence = Number(input.sequence);
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error('sequence must be a positive integer');

  return {
    telegram: `${approvalType} approval ${input.decision}${input.note ? `: ${input.note}` : ''}`,
    approvalPatch: {
      status: input.decision,
      decided_by_label: input.decidedByLabel || 'Trevor',
      decision_note: input.note || null,
      decided_at: new Date().toISOString(),
    },
    jobPatch: { status: nextStatus },
    event: {
      build_job_id: input.buildJobId,
      sequence,
      stage: 'approval',
      status: input.decision,
      title: `${approvalType} approval ${input.decision}`,
      detail: input.note || null,
      actor_label: input.decidedByLabel || 'Trevor',
      channel: input.channel || 'telegram',
      metadata: { approvalId: input.approvalId, approvalType },
    },
  };
}

export function commandAcknowledgementPlan(input) {
  if (!input.commandId) throw new Error('commandId is required');
  if (!COMMAND_ACK_STATUSES.has(input.status)) throw new Error(`Unsupported command status: ${input.status}`);

  const now = new Date().toISOString();
  return {
    telegram: `Command ${input.commandId} ${input.status}${input.message ? `: ${input.message}` : ''}`,
    commandPatch: {
      status: input.status,
      acknowledgement: input.status === 'acknowledged' ? input.message || 'Acknowledged by OpenClaw' : null,
      result_summary: ['completed'].includes(input.status) ? input.message || null : null,
      error_message: ['rejected', 'failed', 'canceled'].includes(input.status) ? input.message || null : null,
      acknowledged_at: ['acknowledged', 'completed'].includes(input.status) ? now : null,
      completed_at: ['completed', 'failed', 'canceled'].includes(input.status) ? now : null,
    },
  };
}

// ─── Command-loop helpers ─────────────────────────────────────────────────────

const APPROVAL_COMMANDS = new Map([
  ['approve_build', { approvalType: 'build', decision: 'approved' }],
  ['reject_build', { approvalType: 'build', decision: 'rejected' }],
  ['approve_deploy', { approvalType: 'deploy', decision: 'approved' }],
  ['reject_deploy', { approvalType: 'deploy', decision: 'rejected' }],
]);

const LEARNING_COMMANDS = new Map([
  ['approve_learning', 'approved'],
  ['reject_learning', 'rejected'],
  ['review_learning', 'proposed'],
]);

const TERMINAL_JOB_STATUSES = new Set(['live', 'canceled', 'archived']);

export function requireCommandTarget(command) {
  if (!command?.id) throw new Error('command id is required');
  if (!command.command_type) throw new Error('command type is required');
  if (command.status && command.status !== 'pending') {
    throw new Error(`Command is not pending: ${command.status}`);
  }
}

export function commandNote(command) {
  return command?.payload?.note || command?.payload?.message || null;
}

export function assertCommandAllowedForJob(command, job) {
  if (!job?.id) throw new Error(`Build job not found for ${command.command_type}`);

  if (TERMINAL_JOB_STATUSES.has(job.status)) {
    throw new Error(`Cannot process ${command.command_type} for ${job.status} job`);
  }

  if (['approve_build', 'reject_build'].includes(command.command_type) && job.status !== 'awaiting_build_approval') {
    throw new Error(`${command.command_type} requires job status awaiting_build_approval, found ${job.status}`);
  }

  if (['approve_deploy', 'reject_deploy'].includes(command.command_type) && job.status !== 'awaiting_deploy_approval') {
    throw new Error(`${command.command_type} requires job status awaiting_deploy_approval, found ${job.status}`);
  }

  if (command.command_type === 'retry_job' && !['blocked', 'failed'].includes(job.status)) {
    throw new Error(`retry_job requires blocked or failed job status, found ${job.status}`);
  }
}

export function buildCancelJobPlan(command, sequence) {
  requireCommandTarget(command);
  if (!command.build_job_id) throw new Error('cancel_job requires build_job_id');
  if (!Number.isInteger(Number(sequence)) || Number(sequence) < 1) throw new Error('sequence must be a positive integer');

  return {
    telegram: `Job canceled: ${command.build_job_id}`,
    jobPatch: { status: 'canceled' },
    event: {
      build_job_id: command.build_job_id,
      sequence: Number(sequence),
      stage: 'control',
      status: 'canceled',
      title: 'Job cancellation requested',
      detail: commandNote(command),
      actor_label: 'OpenClaw',
      channel: 'mission_control',
      metadata: { commandRequestId: command.id, commandType: command.command_type },
    },
  };
}

export function buildRetryJobPlan(command, sequence) {
  requireCommandTarget(command);
  if (!command.build_job_id) throw new Error('retry_job requires build_job_id');
  if (!Number.isInteger(Number(sequence)) || Number(sequence) < 1) throw new Error('sequence must be a positive integer');

  return {
    telegram: `Surgical retry queued: ${command.build_job_id}`,
    event: {
      build_job_id: command.build_job_id,
      sequence: Number(sequence),
      stage: 'repair',
      status: 'planned',
      title: 'Surgical retry requested',
      detail: commandNote(command) || 'OpenClaw should inspect the failed stage before applying a narrow repair.',
      actor_label: 'OpenClaw',
      channel: 'mission_control',
      metadata: { commandRequestId: command.id, commandType: command.command_type },
    },
  };
}

export function buildLearningCommandPlan(command) {
  requireCommandTarget(command);
  const status = LEARNING_COMMANDS.get(command.command_type);
  if (!status) throw new Error(`Unsupported learning command: ${command.command_type}`);
  if (command.target_type !== 'learning_proposal' || !command.target_id) {
    throw new Error(`${command.command_type} requires target_type learning_proposal and target_id`);
  }

  const terminal = status === 'approved' || status === 'rejected';
  return {
    telegram: `Learning proposal ${status}: ${command.target_id}`,
    proposalPatch: {
      status,
      decided_at: terminal ? new Date().toISOString() : null,
      approved_by_label: status === 'approved' ? 'Trevor' : null,
    },
  };
}

export function buildApprovalCommandPlan(command, approval, sequence) {
  requireCommandTarget(command);
  const mapping = APPROVAL_COMMANDS.get(command.command_type);
  if (!mapping) throw new Error(`Unsupported approval command: ${command.command_type}`);
  if (!approval?.id) throw new Error(`Approval target not found for ${command.command_type}`);
  if (!command.build_job_id && !approval.build_job_id) throw new Error(`${command.command_type} requires build_job_id`);
  if (approval.approval_type && approval.approval_type !== mapping.approvalType) {
    throw new Error(`${command.command_type} cannot decide ${approval.approval_type} approval`);
  }

  return approvalDecisionPlan({
    approvalId: approval.id,
    buildJobId: command.build_job_id || approval.build_job_id,
    approvalType: approval.approval_type || mapping.approvalType,
    decision: mapping.decision,
    note: commandNote(command),
    sequence,
    currentStatus: approval.status,
    decidedByLabel: command.requested_by_label || 'Trevor',
    channel: 'mission_control',
  });
}

export function buildUnsupportedCommandPlan(command) {
  requireCommandTarget(command);
  return commandAcknowledgementPlan({
    commandId: command.id,
    status: 'rejected',
    message: `Unsupported command request: ${command.command_type}`,
  });
}

export function classifyCommand(commandType) {
  if (APPROVAL_COMMANDS.has(commandType)) return 'approval';
  if (LEARNING_COMMANDS.has(commandType)) return 'learning';
  if (commandType === 'cancel_job') return 'cancel';
  if (commandType === 'retry_job') return 'retry';
  return 'unsupported';
}

// ─── Supabase client ──────────────────────────────────────────────────────────

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

// ─── Command handlers ─────────────────────────────────────────────────────────

async function createStaticJob(flags, dryRun) {
  const plan = createStaticJobPlan({
    title: flags.title,
    goal: flags.goal,
    description: flags.description,
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
        console.log(`[retry] Job ${command.build_job_id} reset to build_approved for the next controlled build run.`);
        telegram = `Retry initiated for job ${command.build_job_id}. Job reset to build_approved for the next controlled build run.`;
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
  const cutoffIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  if (dryRun) {
    if (supabaseUrl && serviceRoleKey) {
      const rows = await read(
        `command_requests?select=id,command_type,requested_at&status=eq.pending&requested_at=lt.${encodeURIComponent(cutoffIso)}&order=requested_at.asc`
      );
      console.log(`[dry-run] Would expire ${rows.length} stale pending command(s) older than ${hours}h:`);
      for (const row of rows) console.log(`  - ${row.id} (${row.command_type}) requested ${row.requested_at}`);
      return { dryRun: true, wouldExpire: rows.length, rows };
    }
    console.log(`[dry-run] Would query: command_requests where status=pending AND requested_at < ${cutoffIso}`);
    console.log(`[dry-run] Would set: status=canceled, completed_at=now(), error_message='auto-canceled: stale pending command'`);
    return {
      dryRun: true,
      olderThanHours: hours,
      cutoff: cutoffIso,
      queryField: 'requested_at',
      patch: {
        status: 'canceled',
        completed_at: '<now>',
        error_message: 'auto-canceled: stale pending command',
      },
    };
  }

  const rows = await read(
    `command_requests?select=id,command_type,requested_at&status=eq.pending&requested_at=lt.${encodeURIComponent(cutoffIso)}&order=requested_at.asc`
  );

  for (const row of rows) {
    await patchById('command_requests', row.id, {
      status: 'canceled',
      completed_at: new Date().toISOString(),
      error_message: 'auto-canceled: stale pending command',
    });
    console.log(`[cancel] ${row.id} (${row.command_type}) requested ${row.requested_at}`);
  }

  console.log(`[clean-stale-commands] Canceled ${rows.length} stale pending command(s) older than ${hours}h.`);
  return {
    telegram: rows.length
      ? `Canceled ${rows.length} stale pending Mission Control command(s) older than ${hours}h.`
      : `No stale pending Mission Control commands found (threshold: ${hours}h).`,
    canceled: rows.length,
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
