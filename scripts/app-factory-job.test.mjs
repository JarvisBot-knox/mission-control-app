import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approvalDecisionPlan,
  buildApprovalCommandPlan,
  buildCancelJobPlan,
  buildLearningCommandPlan,
  buildRetryJobPlan,
  classifyCommand,
  createStaticJobPlan,
  finalUrlPlan,
  parseArgs,
  run,
} from './app-factory-job.mjs';

test('parseArgs parses command flags', () => {
  assert.deepEqual(parseArgs([
    'create-static-job',
    '--title',
    'Demo',
    '--dry-run',
  ]), {
    command: 'create-static-job',
    flags: {
      title: 'Demo',
      'dry-run': true,
    },
  });
});

test('run dry-run create-static-job returns planned writes', async () => {
  const result = await run([
    'create-static-job',
    '--title',
    'Demo Static App',
    '--goal',
    'Create a fast static preview',
    '--features',
    'hero,contact',
    '--dry-run',
  ]);

  assert.equal(result.dryRun, true);
  assert.equal(result.command, 'create-static-job');
  assert.equal(result.operations[0].table, 'build_jobs');
  assert.equal(result.operations[1].table, 'job_step_events');
  assert.equal(result.operations[2].table, 'job_approvals');
});

test('run rejects unsupported commands before any write', async () => {
  await assert.rejects(() => run(['run-shell', '--dry-run']), /Unsupported App Factory command/);
});

test('run dry-run rejects raw secret metadata', async () => {
  await assert.rejects(() => run([
    'create-static-job',
    '--title',
    'Bad Secret',
    '--goal',
    'Try to store a secret',
    '--metadata',
    '{"apiKey":"secret"}',
    '--dry-run',
  ]), /Refusing raw secret-like field/);
});

test('run dry-run process-command classifies command requests', async () => {
  const result = await run([
    'process-command',
    '--command-json',
    JSON.stringify({
      id: 'command-1',
      command_type: 'approve_build',
      status: 'pending',
      build_job_id: 'job-1',
      target_type: 'approval',
      target_id: 'approval-1',
      payload: { note: 'Approved from Mission Control.' },
    }),
    '--dry-run',
  ]);

  assert.equal(result.dryRun, true);
  assert.equal(result.operations[1].kind, 'approval');
});

test('clean-stale-commands dry-run matches command_requests schema', async () => {
  const result = await run([
    'clean-stale-commands',
    '--older-than-hours',
    '24',
    '--dry-run',
  ]);

  assert.equal(result.dryRun, true);
  assert.equal(result.queryField, 'requested_at');
  assert.deepEqual(result.patch, {
    status: 'canceled',
    completed_at: '<now>',
    error_message: 'auto-canceled: stale pending command',
  });
});

test('run rejects removed hygiene commands', async () => {
  await assert.rejects(() => run(['run-hygiene', '--dry-run']), /Unsupported App Factory command/);
  await assert.rejects(() => run(['weekly-cost-summary', '--dry-run']), /Unsupported App Factory command/);
});

test('createStaticJobPlan starts lifecycle at build approval gate', () => {
  const plan = createStaticJobPlan({
    title: 'Pipeline Smoke Test',
    goal: 'Verify lifecycle',
    templateId: 'premium_static_app',
    features: 'hero,contact',
  });

  assert.equal(plan.buildJob.status, 'awaiting_build_approval');
  assert.equal(plan.initialStep.stage, 'request');
  assert.equal(plan.initialStep.status, 'completed');
  assert.equal(plan.buildApproval.approval_type, 'build');
  assert.equal(plan.buildApproval.status, 'pending');
  assert.equal(plan.buildApproval.metadata.templateId, 'premium_static_app');
});

test('approvalDecisionPlan moves build and deploy approvals to correct job statuses', () => {
  const buildApproval = approvalDecisionPlan({
    approvalId: 'approval-build',
    buildJobId: 'job-1',
    approvalType: 'build',
    decision: 'approved',
    sequence: 2,
    currentStatus: 'pending',
  });

  assert.equal(buildApproval.jobPatch.status, 'build_approved');
  assert.equal(buildApproval.event.stage, 'approval');
  assert.equal(buildApproval.event.status, 'approved');

  const deployApproval = approvalDecisionPlan({
    approvalId: 'approval-deploy',
    buildJobId: 'job-1',
    approvalType: 'deploy',
    decision: 'approved',
    sequence: 7,
    currentStatus: 'pending',
  });

  assert.equal(deployApproval.jobPatch.status, 'deploy_approved');

  const rejected = approvalDecisionPlan({
    approvalId: 'approval-build',
    buildJobId: 'job-1',
    approvalType: 'build',
    decision: 'rejected',
    sequence: 2,
    currentStatus: 'pending',
  });

  assert.equal(rejected.jobPatch.status, 'blocked');
});

test('buildApprovalCommandPlan enforces approval target type', () => {
  const plan = buildApprovalCommandPlan(
    {
      id: 'command-1',
      command_type: 'approve_deploy',
      status: 'pending',
      build_job_id: 'job-1',
      requested_by_label: 'Trevor',
      payload: { note: 'Ship it' },
    },
    {
      id: 'approval-1',
      build_job_id: 'job-1',
      approval_type: 'deploy',
      status: 'pending',
    },
    7
  );

  assert.equal(plan.jobPatch.status, 'deploy_approved');
  assert.equal(plan.approvalPatch.status, 'approved');

  assert.throws(
    () => buildApprovalCommandPlan(
      {
        id: 'command-2',
        command_type: 'approve_deploy',
        status: 'pending',
        build_job_id: 'job-1',
      },
      {
        id: 'approval-2',
        build_job_id: 'job-1',
        approval_type: 'build',
        status: 'pending',
      },
      7
    ),
    /cannot decide build approval/
  );
});

test('finalUrlPlan marks the job live and records production proof', () => {
  const plan = finalUrlPlan({
    buildJobId: 'job-1',
    sequence: 8,
    url: 'https://pipeline-smoke-test.vercel.app',
    name: 'Pipeline Smoke Test',
  });

  assert.equal(plan.jobPatch.status, 'live');
  assert.equal(plan.resource.resource_type, 'vercel_production_deployment');
  assert.equal(plan.resource.status, 'live');
  assert.equal(plan.event.stage, 'deploy');
  assert.equal(plan.event.status, 'live');
});

test('command classifier keeps Mission Control command surface explicit', () => {
  assert.equal(classifyCommand('approve_build'), 'approval');
  assert.equal(classifyCommand('reject_deploy'), 'approval');
  assert.equal(classifyCommand('retry_job'), 'retry');
  assert.equal(classifyCommand('cancel_job'), 'cancel');
  assert.equal(classifyCommand('approve_learning'), 'learning');
  assert.equal(classifyCommand('request_deploy_approval'), 'unsupported');
  assert.equal(classifyCommand('retry_build'), 'unsupported');
});

test('cancel and retry command plans record control events without deleting history', () => {
  const cancel = buildCancelJobPlan({
    id: 'command-cancel',
    command_type: 'cancel_job',
    status: 'pending',
    build_job_id: 'job-1',
    payload: { note: 'Stop this one' },
  }, 5);

  assert.equal(cancel.jobPatch.status, 'canceled');
  assert.equal(cancel.event.stage, 'control');
  assert.equal(cancel.event.status, 'canceled');
  assert.equal(cancel.event.metadata.commandRequestId, 'command-cancel');

  const retry = buildRetryJobPlan({
    id: 'command-retry',
    command_type: 'retry_job',
    status: 'pending',
    build_job_id: 'job-1',
    payload: { note: 'Try the narrow fix' },
  }, 6);

  assert.equal(retry.event.stage, 'repair');
  assert.equal(retry.event.status, 'planned');
  assert.equal(retry.event.metadata.commandRequestId, 'command-retry');
});

test('learning commands only target learning proposals', () => {
  const plan = buildLearningCommandPlan({
    id: 'command-learning',
    command_type: 'approve_learning',
    status: 'pending',
    target_type: 'learning_proposal',
    target_id: 'learning-1',
  });

  assert.equal(plan.proposalPatch.status, 'approved');
  assert.equal(plan.proposalPatch.approved_by_label, 'Trevor');

  assert.throws(
    () => buildLearningCommandPlan({
      id: 'command-learning-bad',
      command_type: 'approve_learning',
      status: 'pending',
      target_type: 'build_job',
      target_id: 'job-1',
    }),
    /requires target_type learning_proposal/
  );
});
