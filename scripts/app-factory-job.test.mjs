import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArgs, run } from './app-factory-job.mjs';

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
