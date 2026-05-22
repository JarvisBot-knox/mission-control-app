import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from './app-factory-static-build.mjs';

test('static build dry-run requires build subcommand', async () => {
  await assert.rejects(
    () => run(['--dry-run', '--repo-name', 'test-site-001', '--job-id', 'fake-id']),
    /Unsupported static build command: --dry-run/
  );
});

test('static build dry-run reports live pipeline without side effects', async () => {
  const result = await run([
    'build',
    '--dry-run',
    '--repo-name',
    'test-site-001',
    '--job-id',
    'fake-id',
  ]);

  assert.deepEqual(result, {
    dryRun: true,
    command: 'build',
  });
});
