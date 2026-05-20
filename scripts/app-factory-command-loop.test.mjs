import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCommandAllowedForJob,
  buildApprovalCommandPlan,
  buildCancelJobPlan,
  buildLearningCommandPlan,
  buildRetryJobPlan,
  classifyCommand,
} from './app-factory-command-loop.mjs';

const pendingCommand = {
  id: 'command-1',
  command_type: 'approve_build',
  status: 'pending',
  build_job_id: 'job-1',
  target_type: 'approval',
  target_id: 'approval-1',
  requested_by_label: 'Trevor',
  payload: { note: 'Looks good.', requested_from: '/approvals' },
};

test('classifyCommand maps supported command families', () => {
  assert.equal(classifyCommand('approve_build'), 'approval');
  assert.equal(classifyCommand('approve_learning'), 'learning');
  assert.equal(classifyCommand('cancel_job'), 'cancel');
  assert.equal(classifyCommand('retry_job'), 'retry');
  assert.equal(classifyCommand('run_shell'), 'unsupported');
});

test('buildApprovalCommandPlan converts command request into approval decision', () => {
  const plan = buildApprovalCommandPlan(pendingCommand, {
    id: 'approval-1',
    build_job_id: 'job-1',
    approval_type: 'build',
    status: 'pending',
  }, 2);

  assert.equal(plan.approvalPatch.status, 'approved');
  assert.equal(plan.jobPatch.status, 'build_approved');
  assert.equal(plan.event.channel, 'mission_control');
  assert.equal(plan.event.detail, 'Looks good.');
});

test('buildApprovalCommandPlan rejects duplicate approval decisions', () => {
  assert.throws(() => buildApprovalCommandPlan(pendingCommand, {
    id: 'approval-1',
    build_job_id: 'job-1',
    approval_type: 'build',
    status: 'approved',
  }, 2), /Approval already decided/);
});

test('buildApprovalCommandPlan rejects mismatched approval type', () => {
  assert.throws(() => buildApprovalCommandPlan(pendingCommand, {
    id: 'approval-1',
    build_job_id: 'job-1',
    approval_type: 'deploy',
    status: 'pending',
  }, 2), /cannot decide deploy approval/);
});

test('assertCommandAllowedForJob gates approval commands by job state', () => {
  assert.doesNotThrow(() => assertCommandAllowedForJob(pendingCommand, {
    id: 'job-1',
    status: 'awaiting_build_approval',
  }));

  assert.throws(() => assertCommandAllowedForJob(pendingCommand, {
    id: 'job-1',
    status: 'canceled',
  }), /Cannot process approve_build for canceled job/);

  assert.throws(() => assertCommandAllowedForJob(pendingCommand, {
    id: 'job-1',
    status: 'building',
  }), /requires job status awaiting_build_approval/);
});

test('assertCommandAllowedForJob allows retries only from failed or blocked jobs', () => {
  const retry = { ...pendingCommand, command_type: 'retry_job' };

  assert.doesNotThrow(() => assertCommandAllowedForJob(retry, {
    id: 'job-1',
    status: 'failed',
  }));

  assert.throws(() => assertCommandAllowedForJob(retry, {
    id: 'job-1',
    status: 'awaiting_build_approval',
  }), /retry_job requires blocked or failed/);
});

test('buildCancelJobPlan records cancellation without deleting state', () => {
  const plan = buildCancelJobPlan({
    ...pendingCommand,
    command_type: 'cancel_job',
    target_type: 'build_job',
    target_id: 'job-1',
  }, 5);

  assert.equal(plan.jobPatch.status, 'canceled');
  assert.equal(plan.event.stage, 'control');
  assert.equal(plan.event.status, 'canceled');
});

test('buildRetryJobPlan records a surgical repair request only', () => {
  const plan = buildRetryJobPlan({
    ...pendingCommand,
    command_type: 'retry_job',
    target_type: 'build_job',
    target_id: 'job-1',
  }, 6);

  assert.equal(plan.event.stage, 'repair');
  assert.equal(plan.event.status, 'planned');
});

test('buildLearningCommandPlan updates proposal status without writing memory', () => {
  const plan = buildLearningCommandPlan({
    id: 'command-2',
    command_type: 'approve_learning',
    status: 'pending',
    target_type: 'learning_proposal',
    target_id: 'learning-1',
  });

  assert.equal(plan.proposalPatch.status, 'approved');
  assert.equal(plan.proposalPatch.approved_by_label, 'Trevor');
  assert.ok(plan.proposalPatch.decided_at);
});
