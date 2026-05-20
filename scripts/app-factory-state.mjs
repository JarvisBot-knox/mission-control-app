const STATIC_TEMPLATE_IDS = new Set(['premium_static_app', 'operator_dashboard']);
const ACCESS_MODES = new Set(['public', 'private', 'basic_auth']);
const APPROVAL_DECISIONS = new Set(['approved', 'rejected', 'canceled', 'expired']);
const COMMAND_ACK_STATUSES = new Set(['acknowledged', 'rejected', 'completed', 'failed', 'canceled']);
const RESOURCE_TYPES = new Set([
  'github_repo',
  'vercel_project',
  'vercel_preview_deployment',
  'vercel_production_deployment',
  'auth_basic',
  'secret_metadata',
  'template_repo',
]);
const ARTIFACT_TYPES = new Set(['screenshot', 'demo_video', 'build_summary', 'check_report', 'deployment_log']);
const SECRET_KEY_PATTERN = /(secret|password|token|api[_-]?key|service[_-]?role|credential)/i;

export function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'generated-app';
}

export function compactList(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function assertNoRawSecrets(value, path = 'payload') {
  if (value === null || value === undefined) return;
  if (typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (SECRET_KEY_PATTERN.test(key) && child !== null && child !== undefined && String(child).trim() !== '') {
      throw new Error(`Refusing raw secret-like field at ${childPath}`);
    }
    assertNoRawSecrets(child, childPath);
  }
}

export function createStaticJobPlan(input) {
  const title = String(input.title || '').trim();
  const goal = String(input.goal || '').trim();
  if (!title) throw new Error('Static job title is required');
  if (!goal) throw new Error('Static job goal is required');

  const templateId = input.templateId || 'premium_static_app';
  if (!STATIC_TEMPLATE_IDS.has(templateId)) {
    throw new Error(`Unsupported static template: ${templateId}`);
  }

  const accessMode = input.accessMode || 'public';
  if (!ACCESS_MODES.has(accessMode)) {
    throw new Error(`Unsupported access mode: ${accessMode}`);
  }

  const features = compactList(input.features);
  const slug = slugify(input.slug || title);
  const proposedStack = input.proposedStack || (templateId === 'operator_dashboard' ? 'Next.js App Router + Vercel' : 'Next.js static app + Vercel');
  const compactSummary = {
    appName: title,
    goal,
    templateId,
    features,
    dataNeeds: 'none',
    accessMode,
    proposedStack,
    risks: accessMode === 'public' ? ['public_preview'] : ['private_preview_access'],
    estimatedSteps: [
      'create private repo',
      'apply template',
      'customize app',
      'run checks',
      'deploy preview',
      'request production approval',
    ],
  };

  assertNoRawSecrets(input.metadata || {});

  return {
    telegram: [
      `Build proposal: ${title}`,
      `Goal: ${goal}`,
      `Template: ${templateId}`,
      `Stack: ${proposedStack}`,
      `Access: ${accessMode}`,
      `Features: ${features.length ? features.join(', ') : 'to be refined during build'}`,
      'Approval needed: build',
    ].join('\n'),
    buildJob: {
      external_key: input.externalKey || null,
      title,
      slug,
      request_channel: input.requestChannel || 'telegram',
      request_message_ref: input.requestMessageRef || null,
      requested_by_label: input.requestedByLabel || 'Trevor',
      status: 'awaiting_build_approval',
      app_goal: goal,
      app_type: 'static',
      proposed_stack: proposedStack,
      access_mode: accessMode,
      data_needs: 'none',
      risk_summary: compactSummary.risks.join(', '),
      compact_summary: compactSummary,
      metadata: {
        templateId,
        features,
        source: 'app-factory-job',
        ...(input.metadata || {}),
      },
    },
    initialStep: {
      sequence: 1,
      stage: 'request',
      status: 'completed',
      title: 'Telegram request structured',
      detail: goal,
      actor_label: 'OpenClaw',
      channel: 'telegram',
      metadata: { templateId, features },
    },
    buildApproval: {
      approval_type: 'build',
      status: 'pending',
      risk_category: 'implementation',
      requested_action: `Build preview for ${title}`,
      requested_channel: 'telegram',
      requested_by_label: 'OpenClaw',
      summary: `Approve implementation of ${title} using ${templateId}.`,
      metadata: { templateId, accessMode },
    },
  };
}

export function milestonePlan(input) {
  if (!input.buildJobId) throw new Error('buildJobId is required');
  const sequence = Number(input.sequence);
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error('sequence must be a positive integer');

  const event = {
    build_job_id: input.buildJobId,
    sequence,
    stage: input.stage || 'build',
    status: input.status || 'completed',
    title: input.title || 'Milestone recorded',
    detail: input.detail || null,
    actor_label: input.actorLabel || 'OpenClaw',
    channel: input.channel || 'telegram',
    metadata: input.metadata || {},
  };
  assertNoRawSecrets(event.metadata);

  return {
    telegram: `${event.title}: ${event.status}${event.detail ? `\n${event.detail}` : ''}`,
    event,
    jobStatus: input.jobStatus || null,
  };
}

export function approvalDecisionPlan(input) {
  if (!input.approvalId) throw new Error('approvalId is required');
  if (!input.buildJobId) throw new Error('buildJobId is required');
  if (!APPROVAL_DECISIONS.has(input.decision)) throw new Error(`Unsupported approval decision: ${input.decision}`);
  if ((input.currentStatus || 'pending') !== 'pending') {
    throw new Error(`Approval already decided: ${input.currentStatus}`);
  }

  const approvalType = input.approvalType || 'build';
  const approved = input.decision === 'approved';
  const nextStatus = approved
    ? (approvalType === 'deploy' ? 'deploy_approved' : 'build_approved')
    : 'blocked';
  const sequence = Number(input.sequence);
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error('sequence must be a positive integer');

  return {
    telegram: `${approvalType} approval ${input.decision}${input.note ? `: ${input.note}` : ''}`,
    approvalPatch: {
      status: input.decision,
      decided_by_label: input.decidedByLabel || 'Trevor',
      decision_note: input.note || null,
      decided_at: new Date().toISOString(),
    },
    jobPatch: { status: nextStatus },
    event: {
      build_job_id: input.buildJobId,
      sequence,
      stage: 'approval',
      status: input.decision,
      title: `${approvalType} approval ${input.decision}`,
      detail: input.note || null,
      actor_label: input.decidedByLabel || 'Trevor',
      channel: input.channel || 'telegram',
      metadata: { approvalId: input.approvalId, approvalType },
    },
  };
}

export function resourcePlan(input) {
  if (!input.buildJobId && !input.appId) throw new Error('buildJobId or appId is required');
  if (!RESOURCE_TYPES.has(input.resourceType)) throw new Error(`Unsupported resource type: ${input.resourceType}`);
  assertNoRawSecrets(input.metadata || {});

  return {
    telegram: `Resource recorded: ${input.resourceType} / ${input.name}`,
    resource: {
      app_id: input.appId || null,
      build_job_id: input.buildJobId || null,
      resource_type: input.resourceType,
      provider: input.provider || 'unknown',
      name: input.name || input.resourceType,
      external_id: input.externalId || null,
      url: input.url || null,
      environment: input.environment || null,
      status: input.status || 'recorded',
      secret_names: input.secretNames || [],
      metadata: input.metadata || {},
    },
  };
}

export function artifactPlan(input) {
  if (!input.buildJobId) throw new Error('buildJobId is required');
  if (!ARTIFACT_TYPES.has(input.artifactType)) throw new Error(`Unsupported artifact type: ${input.artifactType}`);
  assertNoRawSecrets(input.metadata || {});

  return {
    telegram: `Proof recorded: ${input.title || input.artifactType}`,
    artifact: {
      build_job_id: input.buildJobId,
      deployment_id: input.deploymentId || null,
      artifact_type: input.artifactType,
      title: input.title || input.artifactType,
      url: input.url || null,
      storage_path: input.storagePath || null,
      summary: input.summary || null,
      metadata: input.metadata || {},
    },
  };
}

export function finalUrlPlan(input) {
  if (!input.buildJobId) throw new Error('buildJobId is required');
  if (!input.url) throw new Error('final URL is required');
  const sequence = Number(input.sequence);
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error('sequence must be a positive integer');

  return {
    telegram: `Live URL: ${input.url}`,
    jobPatch: { status: 'live' },
    resource: resourcePlan({
      buildJobId: input.buildJobId,
      appId: input.appId || null,
      resourceType: 'vercel_production_deployment',
      provider: 'vercel',
      name: input.name || 'Production deployment',
      url: input.url,
      environment: 'production',
      status: 'live',
    }).resource,
    event: {
      build_job_id: input.buildJobId,
      sequence,
      stage: 'deploy',
      status: 'live',
      title: 'Production URL recorded',
      detail: input.url,
      actor_label: 'OpenClaw',
      channel: 'telegram',
      metadata: { url: input.url },
    },
  };
}

export function commandAcknowledgementPlan(input) {
  if (!input.commandId) throw new Error('commandId is required');
  if (!COMMAND_ACK_STATUSES.has(input.status)) throw new Error(`Unsupported command status: ${input.status}`);

  const now = new Date().toISOString();
  return {
    telegram: `Command ${input.commandId} ${input.status}${input.message ? `: ${input.message}` : ''}`,
    commandPatch: {
      status: input.status,
      acknowledgement: input.status === 'acknowledged' ? input.message || 'Acknowledged by OpenClaw' : null,
      result_summary: ['completed'].includes(input.status) ? input.message || null : null,
      error_message: ['rejected', 'failed', 'canceled'].includes(input.status) ? input.message || null : null,
      acknowledged_at: ['acknowledged', 'completed'].includes(input.status) ? now : null,
      completed_at: ['completed', 'failed', 'canceled'].includes(input.status) ? now : null,
    },
  };
}
