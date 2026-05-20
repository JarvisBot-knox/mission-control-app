import assert from 'node:assert/strict';
import test from 'node:test';
import { run, staticVerticalSlicePlan } from './app-factory-static-build.mjs';

const validInput = {
  buildJobId: 'job-1',
  title: 'Demo Static App',
  previewUrl: 'https://demo-preview.vercel.app',
  productionUrl: 'https://demo.vercel.app',
  buildApproved: true,
  deployApproved: true,
  sourceVerified: true,
  environmentVerified: true,
};

test('staticVerticalSlicePlan records repo, preview, proof, deploy package, and final URL operations', () => {
  const plan = staticVerticalSlicePlan(validInput);
  const tables = plan.operations.map((operation) => operation.table);

  assert.match(plan.telegram, /Static vertical slice planned/);
  assert.ok(tables.includes('app_resources'));
  assert.ok(tables.includes('proof_artifacts'));
  assert.ok(tables.includes('job_approvals'));
  assert.ok(tables.includes('job_step_events'));
  assert.equal(plan.operations.at(-1).table, 'build_jobs');
  assert.deepEqual(plan.operations.at(-1).patch, { status: 'live' });
});

test('staticVerticalSlicePlan blocks before build approval', () => {
  assert.throws(() => staticVerticalSlicePlan({
    ...validInput,
    buildApproved: false,
  }), /build approval/);
});

test('staticVerticalSlicePlan blocks production without deploy approval', () => {
  assert.throws(() => staticVerticalSlicePlan({
    ...validInput,
    deployApproved: false,
  }), /deploy approval/);
});

test('run only supports dry-run for this slice', async () => {
  await assert.rejects(() => run([
    'plan',
    '--job-id',
    'job-1',
    '--title',
    'Demo',
    '--preview-url',
    'https://preview.vercel.app',
    '--production-url',
    'https://demo.vercel.app',
    '--build-approved',
    '--deploy-approved',
    '--source-verified',
    '--environment-verified',
  ]), /gated/);
});

test('run dry-run returns planned operations', async () => {
  const result = await run([
    'plan',
    '--job-id',
    'job-1',
    '--title',
    'Demo',
    '--preview-url',
    'https://preview.vercel.app',
    '--production-url',
    'https://demo.vercel.app',
    '--build-approved',
    '--deploy-approved',
    '--source-verified',
    '--environment-verified',
    '--dry-run',
  ]);

  assert.equal(result.dryRun, true);
  assert.equal(result.command, 'plan');
  assert.ok(result.operations.length > 8);
});
