import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDashboardViewModel } from './mission-control-data.ts';

test('buildDashboardViewModel converts rows into dashboard metrics', () => {
  const dashboard = buildDashboardViewModel({
    snapshots: [{
      gateway_status: 'ok',
      gateway_version: '2026.5.12',
      cli_version: '2026.5.12',
      model: 'gpt-5.5',
      sessions_active: 8,
      collected_at: '2026-05-18T03:43:36.800Z',
    }],
    cronJobs: [],
    files: [],
    apps: [{ id: 'app-1', name: 'Demo', slug: 'demo', app_type: 'static', visibility: 'private', status: 'active', production_url: null, updated_at: '2026-05-18T03:43:36.800Z' }],
    deployments: [],
    alerts: [{ id: 'alert-1', severity: 'warning', title: 'Check', status: 'open', created_at: '2026-05-18T03:43:36.800Z' }],
    buildJobs: [{ id: 'job-1', title: 'Demo build', slug: 'demo-build', status: 'building', request_channel: 'telegram', app_type: 'static', proposed_stack: 'Next.js', created_at: '2026-05-18T03:43:36.800Z', updated_at: '2026-05-18T03:43:36.800Z' }],
    approvals: [{ id: 'approval-1', approval_type: 'build', status: 'pending', requested_action: 'Build preview', summary: null, requested_at: '2026-05-18T03:43:36.800Z', build_jobs: { title: 'Demo build', slug: 'demo-build' } }],
    commandRequests: [{ id: 'command-1', build_job_id: 'job-1', command_type: 'approve_build', status: 'pending', target_type: 'approval', target_id: 'approval-1', risk_category: 'approval_gate', requested_by_label: 'trevor', requested_at: '2026-05-18T03:43:36.800Z', acknowledgement: null, result_summary: null, error_message: null }],
    usageRows: [{ id: 'usage-1', provider: 'openai', model: 'gpt-5.5', input_tokens: 10, output_tokens: 5, cache_read_tokens: 20, cache_write_tokens: 0, total_tokens: 35, estimated_cost: 0, estimate_currency: 'USD', estimate_note: 'observed', observed_at: '2026-05-18T03:43:36.800Z' }],
    repairAttempts: [],
    learningProposals: [],
    resources: [],
    readErrors: [],
  });

  assert.equal(dashboard.health.gatewayStatus, 'ok');
  assert.equal(dashboard.metrics.appCount, 1);
  assert.equal(dashboard.metrics.activeBuilds, 1);
  assert.equal(dashboard.metrics.pendingApprovals, 1);
  assert.equal(dashboard.metrics.pendingCommands, 1);
  assert.equal(dashboard.metrics.openAlerts, 1);
  assert.equal(dashboard.metrics.totalTokens, 35);
  assert.equal(dashboard.usage.estimateNote, 'observed');
});

test('buildDashboardViewModel handles empty state', () => {
  const dashboard = buildDashboardViewModel({
    snapshots: [],
    cronJobs: [],
    files: [],
    apps: [],
    deployments: [],
    alerts: [],
    buildJobs: [],
    approvals: [],
    commandRequests: [],
    usageRows: [],
    repairAttempts: [],
    learningProposals: [],
    resources: [],
    readErrors: [],
  });

  assert.equal(dashboard.health.gatewayStatus, 'unknown');
  assert.equal(dashboard.health.model, 'n/a');
  assert.equal(dashboard.metrics.totalTokens, 0);
  assert.equal(dashboard.metrics.estimatedCost, null);
  assert.deepEqual(dashboard.pendingApprovals, []);
});

test('buildDashboardViewModel does not expose resource secret metadata', () => {
  const dashboard = buildDashboardViewModel({
    snapshots: [],
    cronJobs: [],
    files: [],
    apps: [],
    deployments: [],
    alerts: [],
    buildJobs: [],
    approvals: [],
    commandRequests: [],
    usageRows: [],
    repairAttempts: [],
    learningProposals: [],
    resources: [{
      id: 'resource-1',
      resource_type: 'secret_metadata',
      provider: 'vercel',
      name: 'OPENAI_API_KEY',
      url: null,
      environment: 'production',
      status: 'configured',
      created_at: '2026-05-18T03:43:36.800Z',
    }],
    readErrors: [],
  });

  assert.deepEqual(Object.keys(dashboard.resources[0]).sort(), [
    'created_at',
    'environment',
    'id',
    'name',
    'provider',
    'resource_type',
    'status',
    'url',
  ]);
});
