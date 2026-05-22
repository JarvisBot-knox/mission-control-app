export const STATIC_TEMPLATE_IDS = new Set(['premium_static_app', 'operator_dashboard']);
export const ACCESS_MODES = new Set(['public', 'private', 'basic_auth']);
export const APPROVAL_DECISIONS = new Set(['approved', 'rejected', 'canceled', 'expired']);
export const COMMAND_ACK_STATUSES = new Set(['acknowledged', 'rejected', 'completed', 'failed', 'canceled']);
export const RESOURCE_TYPES = new Set([
  'github_repo',
  'vercel_project',
  'vercel_preview_deployment',
  'vercel_production_deployment',
  'auth_basic',
  'secret_metadata',
  'template_repo',
]);
export const ARTIFACT_TYPES = new Set(['screenshot', 'demo_video', 'build_summary', 'check_report', 'deployment_log']);

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
