import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approvalDecisionPlan,
  assertNoRawSecrets,
  commandAcknowledgementPlan,
  createStaticJobPlan,
  finalUrlPlan,
  milestonePlan,
} from './app-factory-state.mjs';

test('createStaticJobPlan builds a static job, first step, and pending approval', () => {
  const plan = createStaticJobPlan({
    title: 'Client Portal Preview',
    goal: 'Create a polished static preview for a client portal',
    features: 'hero,status,contact',
    templateId: 'premium_static_app',
    accessMode: 'public',
  });

  assert.equal(plan.buildJob.status, 'awaiting_build_approval');
  assert.equal(plan.buildJob.app_type, 'static');
  assert.equal(plan.buildJob.slug, 'client-portal-preview');
  assert.equal(plan.initialStep.sequence, 1);
  assert.equal(plan.buildApproval.status, 'pending');
  assert.match(plan.telegram, /Build proposal/);
});

test('createStaticJobPlan rejects unsupported templates', () => {
  assert.throws(() => createStaticJobPlan({
    title: 'Data App',
    goal: 'Needs persistence',
    templateId: 'supabase_crud_app',
  }), /Unsupported static template/);
});

test('assertNoRawSecrets rejects secret-like metadata', () => {
  assert.throws(() => assertNoRawSecrets({
    nested: { apiKey: 'do-not-store' },
  }), /Refusing raw secret-like field/);
});

test('milestonePlan returns matching Telegram and timeline event state', () => {
  const plan = milestonePlan({
    buildJobId: 'job-1',
    sequence: 3,
    stage: 'build',
    status: 'completed',
    title: 'Checks passed',
    detail: 'Build and typecheck passed.',
    jobStatus: 'preview_ready',
  });

  assert.equal(plan.event.build_job_id, 'job-1');
  assert.equal(plan.event.sequence, 3);
  assert.equal(plan.jobStatus, 'preview_ready');
  assert.match(plan.telegram, /Checks passed/);
});

test('approvalDecisionPlan records approval without directly executing deploy', () => {
  const plan = approvalDecisionPlan({
    approvalId: 'approval-1',
    buildJobId: 'job-1',
    approvalType: 'deploy',
    decision: 'approved',
    sequence: 7,
  });

  assert.equal(plan.approvalPatch.status, 'approved');
  assert.equal(plan.jobPatch.status, 'deploy_approved');
  assert.equal(plan.event.stage, 'approval');
});

test('approvalDecisionPlan rejects duplicate approval attempts', () => {
  assert.throws(() => approvalDecisionPlan({
    approvalId: 'approval-1',
    buildJobId: 'job-1',
    approvalType: 'build',
    decision: 'approved',
    currentStatus: 'approved',
    sequence: 2,
  }), /Approval already decided/);
});

test('finalUrlPlan records live URL metadata and live job status', () => {
  const plan = finalUrlPlan({
    buildJobId: 'job-1',
    url: 'https://example.vercel.app',
    sequence: 9,
  });

  assert.equal(plan.jobPatch.status, 'live');
  assert.equal(plan.resource.resource_type, 'vercel_production_deployment');
  assert.equal(plan.event.status, 'live');
});

test('commandAcknowledgementPlan rejects unsupported command statuses', () => {
  assert.throws(() => commandAcknowledgementPlan({
    commandId: 'command-1',
    status: 'approved',
  }), /Unsupported command status/);
});
