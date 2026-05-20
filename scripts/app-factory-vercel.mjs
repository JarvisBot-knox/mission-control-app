#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { artifactPlan, finalUrlPlan, resourcePlan } from './app-factory-job.mjs';

const VERCEL_API = 'https://api.vercel.com';
const GITHUB_ORG = 'JarvisBot-knox';
const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 180_000;

// ─── Plan helpers (used by app-factory-static-build.mjs) ─────────────────────

export function vercelPreviewPlan(input) {
  if (!input.buildJobId) throw new Error('buildJobId is required');
  if (!input.projectName) throw new Error('projectName is required');
  if (!input.previewUrl) throw new Error('previewUrl is required');

  return {
    telegram: `Preview ready: ${input.previewUrl}`,
    resources: [
      resourcePlan({
        buildJobId: input.buildJobId,
        resourceType: 'vercel_project',
        provider: 'vercel',
        name: input.projectName,
        externalId: input.projectId || null,
        status: 'configured',
        metadata: { framework: input.framework || 'nextjs' },
      }).resource,
      resourcePlan({
        buildJobId: input.buildJobId,
        resourceType: 'vercel_preview_deployment',
        provider: 'vercel',
        name: input.deploymentName || 'Preview deployment',
        externalId: input.deploymentId || null,
        url: input.previewUrl,
        environment: 'preview',
        status: 'ready',
        metadata: {
          sourceRef: input.sourceRef || null,
          commitSha: input.commitSha || null,
        },
      }).resource,
    ],
    checkArtifact: artifactPlan({
      buildJobId: input.buildJobId,
      artifactType: 'deployment_log',
      title: 'Vercel preview deployment planned',
      summary: `Preview target: ${input.previewUrl}`,
      metadata: {
        projectName: input.projectName,
        previewUrl: input.previewUrl,
        sourceRef: input.sourceRef || null,
      },
    }).artifact,
  };
}

export function productionVerificationPlan(input) {
  if (!input.buildJobId) throw new Error('buildJobId is required');
  if (!input.previewUrl) throw new Error('previewUrl is required');
  if (!input.productionUrl) throw new Error('productionUrl is required');
  if (!input.deployApproved) throw new Error('Production deploy is blocked until deploy approval exists');
  if (!input.sourceVerified) throw new Error('Production deploy is blocked until source is verified');
  if (!input.environmentVerified) throw new Error('Production deploy is blocked until production environment is verified');

  return {
    telegram: `Production target verified: ${input.productionUrl}`,
    artifact: artifactPlan({
      buildJobId: input.buildJobId,
      artifactType: 'check_report',
      title: 'Production target verification',
      summary: 'Preview source and production environment assumptions verified before deploy.',
      metadata: {
        previewUrl: input.previewUrl,
        productionUrl: input.productionUrl,
        sourceVerified: true,
        environmentVerified: true,
        deployApproved: true,
      },
    }).artifact,
  };
}

export function vercelProductionPlan(input) {
  const verification = productionVerificationPlan(input);
  const final = finalUrlPlan({
    buildJobId: input.buildJobId,
    appId: input.appId || null,
    url: input.productionUrl,
    name: input.deploymentName || 'Production deployment',
    sequence: input.sequence,
  });

  return {
    telegram: final.telegram,
    verificationArtifact: verification.artifact,
    resource: final.resource,
    event: final.event,
    jobPatch: final.jobPatch,
  };
}

// ─── Live deployment (CLI entry point) ───────────────────────────────────────

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i++;
    }
  }
  return flags;
}

async function vercelFetch(path, options = {}) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN environment variable is required');

  const url = path.startsWith('https://') ? path : `${VERCEL_API}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Vercel API ${path} failed: ${response.status} ${body}`);
  }

  return response.json();
}

async function supabaseFetch(path, options = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping Supabase record');
    return null;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase ${path} failed: ${response.status} ${body}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function ensureProject(repoName, projectName) {
  const existing = await vercelFetch(`/v9/projects/${projectName}`).catch(() => null);
  if (existing?.id) {
    console.log(`Vercel project already exists: ${existing.id}`);
    return existing;
  }

  const project = await vercelFetch('/v9/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: projectName,
      framework: null,
      gitRepository: {
        type: 'github',
        repo: `${GITHUB_ORG}/${repoName}`,
      },
    }),
  });

  console.log(`Vercel project created: ${project.id}`);
  return project;
}

async function triggerDeployment(projectId, repoName, env) {
  const deployment = await vercelFetch('/v13/deployments', {
    method: 'POST',
    body: JSON.stringify({
      name: repoName,
      project: projectId,
      target: env === 'production' ? 'production' : undefined,
      gitSource: {
        type: 'github',
        org: GITHUB_ORG,
        repo: repoName,
        ref: 'main',
      },
    }),
  });

  console.log(`Deployment triggered: ${deployment.id} (${deployment.url})`);
  return deployment;
}

async function pollDeployment(deploymentId) {
  const start = Date.now();

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const data = await vercelFetch(`/v13/deployments/${deploymentId}`);
    const state = data.readyState || data.status;
    console.log(`Deployment ${deploymentId}: ${state}`);

    if (state === 'READY') return data;
    if (['ERROR', 'CANCELED'].includes(state)) {
      throw new Error(`Deployment ${deploymentId} ended with state: ${state}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Deployment ${deploymentId} did not complete within ${POLL_TIMEOUT_MS / 1000}s`);
}

async function main(argv) {
  const flags = parseArgs(argv);

  const repoName = flags['repo-name'];
  if (!repoName) throw new Error('--repo-name is required');

  const jobId = flags['job-id'];
  if (!jobId) throw new Error('--job-id is required');

  const env = flags.env || 'preview';
  if (!['preview', 'production'].includes(env)) throw new Error('--env must be preview or production');

  const projectName = repoName;

  const project = await ensureProject(repoName, projectName);
  const deployment = await triggerDeployment(project.id, repoName, env);
  const ready = await pollDeployment(deployment.id);

  const deploymentUrl = `https://${ready.url}`;
  const resourceType = env === 'production' ? 'vercel_production_deployment' : 'vercel_preview_deployment';

  await supabaseFetch('proof_artifacts', {
    method: 'POST',
    body: JSON.stringify({
      build_job_id: jobId,
      deployment_id: ready.id,
      artifact_type: 'deployment_log',
      title: `Vercel ${env} deployment`,
      url: deploymentUrl,
      summary: `Deployment ${ready.id} reached READY state.`,
      metadata: {
        projectId: project.id,
        deploymentId: ready.id,
        env,
        repoName,
      },
    }),
  });

  await supabaseFetch('app_resources', {
    method: 'POST',
    body: JSON.stringify({
      build_job_id: jobId,
      resource_type: resourceType,
      provider: 'vercel',
      name: `${env} deployment`,
      external_id: ready.id,
      url: deploymentUrl,
      environment: env,
      status: 'ready',
      secret_names: [],
      metadata: { projectId: project.id, deploymentId: ready.id, repoName },
    }),
  });

  const output = {
    deploymentId: ready.id,
    deploymentUrl,
    projectId: project.id,
    env,
    jobId,
  };

  console.log(JSON.stringify(output, null, 2));
  return output;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { main as run };
