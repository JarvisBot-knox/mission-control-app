const allowedCommands = new Set([
  'approve_build',
  'reject_build',
  'approve_deploy',
  'reject_deploy',
  'cancel_job',
  'retry_job',
  'review_learning',
  'approve_learning',
  'reject_learning',
]);

export type CommandRequestInput = {
  commandType: string;
  buildJobId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  riskCategory?: string | null;
  note?: string | null;
  returnPath?: string | null;
};

export function sanitizeReturnPath(value: string | null | undefined) {
  const path = String(value || '/');
  if (!path.startsWith('/') || path.startsWith('//')) return '/';
  return path;
}

export function buildCommandRequestPayload(input: CommandRequestInput) {
  if (!allowedCommands.has(input.commandType)) {
    throw new Error(`Unsupported command request: ${input.commandType}`);
  }

  return {
    build_job_id: input.buildJobId || null,
    command_type: input.commandType,
    status: 'pending',
    source_surface: 'mission_control',
    requested_by_label: 'Trevor',
    target_type: input.targetType || null,
    target_id: input.targetId || null,
    risk_category: input.riskCategory || null,
    payload: {
      note: input.note || null,
      requested_from: input.returnPath || null,
    },
  };
}
