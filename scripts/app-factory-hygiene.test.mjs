import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildExternalReconciliation,
  buildHygieneConfig,
  parseArgs,
  planHygieneActions,
  run,
} from './app-factory-hygiene.mjs';

test('parseArgs defaults to audit command', () => {
  assert.deepEqual(parseArgs([]), {
    command: 'audit',
    flags: {},
  });
});

test('buildHygieneConfig parses retention flags', () => {
  assert.deepEqual(buildHygieneConfig({
    'stale-command-hours': '12',
    'stale-approval-hours': '36',
    'archive-job-days': '14',
    'usage-retention-days': '45',
  }), {
    staleCommandHours: 12,
    staleApprovalHours: 36,
    archiveJobDays: 14,
    usageRetentionDays: 45,
  });
});

test('planHygieneActions recommends Supabase hygiene without applying it', () => {
  const plan = planHygieneActions({
    commandRequests: [
      { id: 'command-1', command_type: 'approve_build', requested_at: '2026-05-19T02:41:22.000Z' },
    ],
    approvals: [
      { id: 'approval-1', approval_type: 'deploy', requested_at: '2026-05-18T02:41:22.000Z' },
    ],
    buildJobs: [
      { id: 'job-1', title: 'Failed build', status: 'failed', updated_at: '2026-04-18T02:41:22.000Z' },
      { id: 'job-2', title: 'Live build', status: 'live', updated_at: '2026-04-18T02:41:22.000Z' },
    ],
    usageObservations: [
      { id: 'usage-1', source: 'openclaw', session_id: 'session-1', observed_at: '2026-01-18T02:41:22.000Z' },
    ],
    allBuildJobs: [
      { id: 'job-1' },
    ],
    apps: [
      { id: 'app-1' },
    ],
    resources: [
      { id: 'resource-1', build_job_id: 'missing-job', app_id: null, resource_type: 'github_repo' },
      { id: 'resource-2', build_job_id: null, app_id: null, resource_type: 'vercel_project' },
    ],
  }, {
    staleCommandHours: 24,
    staleApprovalHours: 72,
    archiveJobDays: 30,
    usageRetentionDays: 90,
  }, '2026-05-22T02:30:00.000Z');

  assert.equal(plan.counts.staleCommands, 1);
  assert.equal(plan.counts.staleApprovals, 1);
  assert.equal(plan.counts.jobsToArchive, 1);
  assert.equal(plan.counts.usageRowsToDelete, 1);
  assert.equal(plan.counts.unmanagedGithubRepos, 0);
  assert.equal(plan.counts.unmanagedVercelProjects, 0);

  assert.deepEqual(plan.recommendedSupabaseActions.map((action) => action.kind), [
    'cancel_stale_command',
    'expire_stale_approval',
    'archive_terminal_job',
    'delete_old_usage_observation',
  ]);

  assert.deepEqual(plan.recommendedSupabaseActions[0].patch, {
    status: 'canceled',
    completed_at: '2026-05-22T02:30:00.000Z',
    error_message: 'auto-canceled by app factory hygiene: stale pending command',
  });
  assert.deepEqual(plan.recommendedSupabaseActions[1].patch, {
    status: 'expired',
    decided_at: '2026-05-22T02:30:00.000Z',
    decision_note: 'auto-expired by app factory hygiene: stale pending approval',
  });
  assert.deepEqual(plan.recommendedSupabaseActions[2].patch, {
    status: 'archived',
    updated_at: '2026-05-22T02:30:00.000Z',
  });
});

test('buildExternalReconciliation reports unmanaged external resources', () => {
  const reconciliation = buildExternalReconciliation({
    resources: [
      {
        id: 'resource-1',
        provider: 'github',
        resource_type: 'github_repo',
        name: 'JarvisBot-knox/managed-site',
        url: 'https://github.com/JarvisBot-knox/managed-site',
        metadata: {},
      },
      {
        id: 'resource-2',
        provider: 'vercel',
        resource_type: 'vercel_project',
        name: 'managed-site',
        url: null,
        metadata: {},
      },
    ],
  }, {
    status: 'checked',
    errors: [],
    githubRepos: [
      { fullName: 'JarvisBot-knox/managed-site', url: 'https://github.com/JarvisBot-knox/managed-site', private: true },
      { fullName: 'JarvisBot-knox/unmanaged-site', url: 'https://github.com/JarvisBot-knox/unmanaged-site', private: true },
    ],
    vercelProjects: [
      { id: 'project-1', name: 'managed-site', url: null },
      { id: 'project-2', name: 'unmanaged-site', url: null },
    ],
  });

  assert.equal(reconciliation.counts.githubReposChecked, 2);
  assert.equal(reconciliation.counts.vercelProjectsChecked, 2);
  assert.deepEqual(reconciliation.unmanagedGithubRepos.map((repo) => repo.fullName), ['JarvisBot-knox/unmanaged-site']);
  assert.deepEqual(reconciliation.unmanagedVercelProjects.map((project) => project.name), ['unmanaged-site']);
});

test('hygiene clean/apply is disabled until cleanup is atomic and approved', async () => {
  await assert.rejects(
    () => run(['clean', '--apply']),
    /Hygiene apply is disabled/
  );
});
