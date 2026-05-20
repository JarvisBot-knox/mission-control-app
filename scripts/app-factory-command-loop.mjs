import { approvalDecisionPlan, commandAcknowledgementPlan } from './app-factory-state.mjs';

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
