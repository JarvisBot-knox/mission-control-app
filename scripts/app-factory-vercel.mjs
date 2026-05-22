#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import {
  artifactPlan,
  finalUrlPlan,
  resourcePlan,
} from './app-factory-contract.mjs';

const POLL_INTERVAL_MS = 10_000;
const MAX_POLLS = 18; // 3 minutes

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i += 1;
    }
  }
  return flags;
}

function boolFlag(flags, name) {
  return flags[name] === true || flags[name] === 'true';
}

async function vercelFetch(path, options = {}, token, teamId) {
  const base = 'https://api.vercel.com';
  const url = new URL(path.startsWith('https://') ? path : `${base}${path}`);
  if (teamId) url.searchParams.set('teamId', teamId);

  const response = await fetch(url.toString(), {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Vercel ${path} failed: ${response.status} ${body}`);
  }

  return response.json();
}

async function supabaseFetch(supabaseUrl, serviceRoleKey, path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
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

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function deployToVercel({ repoName, jobId, env = 'preview', dryRun = false, resultFile = null }) {
  if (!repoName) throw new Error('--repo-name is required');

  const vercelToken = process.env.VERCEL_TOKEN;
  if (!vercelToken) throw new Error('VERCEL_TOKEN env var is required');

  const teamId = process.env.VERCEL_TEAM_ID || null;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const projectName = repoName;
  const GITHUB_ORG = 'JarvisBot-knox';

  if (dryRun) {
    console.log(`[dry-run] Would create Vercel project: ${projectName}`);
    console.log(`[dry-run] Would link to GitHub repo: ${GITHUB_ORG}/${repoName}`);
    console.log(`[dry-run] Would trigger ${env} deployment`);
    console.log(`[dry-run] Would poll until READY or ERROR (max ${MAX_POLLS} polls)`);
    if (jobId && supabaseUrl && serviceRoleKey) {
      console.log(`[dry-run] Would record proof_artifacts row for deployment URL`);
    }
    return { dryRun: true, deploymentUrl: `https://${projectName}.vercel.app` };
  }

  console.log(`[vercel] Creating project: ${projectName}`);
  let project;
  try {
    project = await vercelFetch('/v9/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: projectName,
        gitRepository: {
          type: 'github',
          repo: `${GITHUB_ORG}/${repoName}`,
        },
        framework: null,
      }),
    }, vercelToken, teamId);
  } catch (error) {
    if (error.message.includes('already exists') || error.message.includes('409')) {
      console.log(`[vercel] Project already exists, fetching: ${projectName}`);
      project = await vercelFetch(`/v9/projects/${encodeURIComponent(projectName)}`, { method: 'GET' }, vercelToken, teamId);
    } else {
      throw error;
    }
  }

  console.log(`[vercel] Triggering deployment (env: ${env})`);
  const deployment = await vercelFetch('/v13/deployments', {
    method: 'POST',
    body: JSON.stringify({
      name: projectName,
      gitSource: {
        type: 'github',
        org: GITHUB_ORG,
        repo: repoName,
        ref: 'main',
      },
      target: env === 'production' ? 'production' : undefined,
      projectId: project.id,
    }),
  }, vercelToken, teamId);

  const deploymentId = deployment.id;
  console.log(`[vercel] Deployment started: ${deploymentId}`);

  let finalState = deployment.readyState || deployment.status;
  let deploymentUrl = deployment.url ? `https://${deployment.url}` : null;

  for (let poll = 0; poll < MAX_POLLS; poll += 1) {
    if (finalState === 'READY' || finalState === 'ERROR' || finalState === 'CANCELED') break;
    console.log(`[vercel] Polling (${poll + 1}/${MAX_POLLS}) — state: ${finalState}`);
    await sleep(POLL_INTERVAL_MS);
    const status = await vercelFetch(`/v13/deployments/${encodeURIComponent(deploymentId)}`, { method: 'GET' }, vercelToken, teamId);
    finalState = status.readyState || status.status;
    deploymentUrl = status.url ? `https://${status.url}` : deploymentUrl;
  }

  if (finalState === 'ERROR' || finalState === 'CANCELED') {
    throw new Error(`Vercel deployment failed with state: ${finalState}`);
  }

  if (finalState !== 'READY') {
    throw new Error(`Vercel deployment timed out after ${MAX_POLLS} polls. Last state: ${finalState}`);
  }

  console.log(`[vercel] Deployment READY: ${deploymentUrl}`);

  if (resultFile) {
    await writeFile(resultFile, JSON.stringify({ deploymentUrl, deploymentId }), 'utf8');
    console.log(`[vercel] Result written to ${resultFile}`);
  }

  if (jobId && supabaseUrl && serviceRoleKey && deploymentUrl) {
    const summary = env === 'production'
      ? `Vercel production deployment: ${deploymentUrl}`
      : `Vercel preview deployment: ${deploymentUrl}`;
    await supabaseFetch(supabaseUrl, serviceRoleKey, 'proof_artifacts', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        build_job_id: jobId,
        artifact_type: 'deployment_log',
        title: `Vercel ${env} deployment`,
        url: deploymentUrl,
        summary,
        metadata: { deploymentId, projectName, env },
      }),
    });
    console.log(`[vercel] Recorded proof_artifacts row`);
  }

  return { deploymentUrl, deploymentId, projectId: project.id };
}

// ─── Preserved plan exports (imported by app-factory-static-build.mjs) ───────

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
        metadata: {
          framework: input.framework || 'nextjs',
        },
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

// ─── CLI entry point ──────────────────────────────────────────────────────────

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flags = parseArgs(process.argv.slice(2));

  deployToVercel({
    repoName: flags['repo-name'],
    jobId: flags['job-id'],
    env: flags.env || 'preview',
    dryRun: boolFlag(flags, 'dry-run'),
    resultFile: flags['result-file'] || null,
  })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
