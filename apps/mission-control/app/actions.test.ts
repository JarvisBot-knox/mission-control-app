import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCommandRequestPayload, sanitizeReturnPath } from '../lib/command-requests.ts';

test('buildCommandRequestPayload creates pending OpenClaw command request', () => {
  assert.deepEqual(buildCommandRequestPayload({
    commandType: 'approve_build',
    buildJobId: 'job-1',
    targetType: 'approval',
    targetId: 'approval-1',
    riskCategory: 'approval_gate',
    returnPath: '/approvals',
  }), {
    build_job_id: 'job-1',
    command_type: 'approve_build',
    status: 'pending',
    source_surface: 'mission_control',
    requested_by_label: 'Trevor',
    target_type: 'approval',
    target_id: 'approval-1',
    risk_category: 'approval_gate',
    payload: {
      note: null,
      requested_from: '/approvals',
    },
  });
});

test('buildCommandRequestPayload rejects unsupported command types', () => {
  assert.throws(() => buildCommandRequestPayload({ commandType: 'run_shell' }), /Unsupported command request/);
});

test('sanitizeReturnPath keeps revalidation local', () => {
  assert.equal(sanitizeReturnPath('/approvals'), '/approvals');
  assert.equal(sanitizeReturnPath('https://evil.example/approvals'), '/');
  assert.equal(sanitizeReturnPath('//evil.example/approvals'), '/');
});
