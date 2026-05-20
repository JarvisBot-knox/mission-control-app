#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { artifactPlan, milestonePlan, resourcePlan, slugify } from './app-factory-job.mjs';
import { vercelPreviewPlan, vercelProductionPlan } from './app-factory-vercel.mjs';
import { run as runGenerate } from './app-factory-generate.mjs';
import { run as runGithub } from './app-factory-github.mjs';
import { run as runVercel } from './app-factory-vercel.mjs';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      index += 1;
    }
  }

  return { command, flags };
}

function boolFlag(flags, name) {
  return flags[name] === true || flags[name] === 'true';
}

function listFlag(flags, name, fallback = []) {
  if (!flags[name] || flags[name] === true) return fallback;
  return String(flags[name]).split(',').map((item) => item.trim()).filter(Boolean);
}

function jsonFlag(flags, name) {
  if (!flags[name] || flags[name] === true) return {};
  return JSON.parse(String(flags[name]));
}

async function supabaseFetch(path, options = {}) {
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

async function insert(table, row) {
  return supabaseFetch(table, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
}

async function patchById(table, id, patch) {
  return supabaseFetch(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
}

async function nextSequence(buildJobId) {
  const rows = await supabaseFetch(`job_step_events?select=sequence&build_job_id=eq.${encodeURIComponent(buildJobId)}&order=sequence.desc&limit=1`, { method: 'GET' });
  return (rows?.[0]?.sequence || 0) + 1;
}

async function waitForDeployApproval(buildJobId, pollMs = 15_000, timeoutMs = 3_600_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rows = await supabaseFetch(
      `job_approvals?select=id,status&build_job_id=eq.${encodeURIComponent(buildJobId)}&approval_type=eq.deploy&order=requested_at.desc&limit=1`,
      { method: 'GET' }
    );
    const approval = rows?.[0];
    if (!approval) throw new Error(`No deploy approval found for job ${buildJobId}`);
    if (approval.status === 'approved') return approval;
    if (['rejected', 'canceled', 'expired'].includes(approval.status)) {
      throw new Error(`Deploy approval ${approval.status} for job ${buildJobId}`);
    }
    console.log(`Waiting for deploy approval (current: ${approval.status})...`);
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Deploy approval timed out after ${timeoutMs / 1000}s for job ${buildJobId}`);
}

export function staticVerticalSlicePlan(input) {
  if (!input.buildJobId) throw new Error('buildJobId is required');
  if (!input.title) throw new Error('title is required');
  if (!input.previewUrl) throw new Error('previewUrl is required');
  if (!input.productionUrl) throw new Error('productionUrl is required');
  if (!input.buildApproved) throw new Error('Static build is blocked until build approval exists');

  const slug = slugify(input.slug || input.title);
  const repoName = input.repoName || slug;
  const projectName = input.vercelProject || slug;
  const templateId = input.templateId || 'premium_static_app';
  const preview = vercelPreviewPlan({
    buildJobId: input.buildJobId,
    projectName,
    previewUrl: input.previewUrl,
    sourceRef: input.sourceRef || 'main',
    commitSha: input.commitSha || null,
  });
  const production = vercelProductionPlan({
    buildJobId: input.buildJobId,
    productionUrl: input.productionUrl,
    previewUrl: input.previewUrl,
    deployApproved: input.deployApproved,
    sourceVerified: input.sourceVerified,
    environmentVerified: input.environmentVerified,
    sequence: input.finalSequence || 8,
  });

  return {
    telegram: [
      `Static vertical slice planned: ${input.title}`,
      `Repo: JarvisBot-knox/${repoName}`,
      `Preview: ${input.previewUrl}`,
      `Production target: ${input.productionUrl}`,
      'Proof: desktop/mobile',
    ].join('\n'),
    operations: [
      { table: 'app_resources', row: resourcePlan({
        buildJobId: input.buildJobId,
        resourceType: 'template_repo',
        provider: 'github',
        name: templateId,
        url: input.templateUrl || null,
        status: 'selected',
        metadata: { templateId },
      }).resource },
      { table: 'app_resources', row: resourcePlan({
        buildJobId: input.buildJobId,
        resourceType: 'github_repo',
        provider: 'github',
        name: `JarvisBot-knox/${repoName}`,
        url: input.repoUrl || `https://github.com/JarvisBot-knox/${repoName}`,
        status: 'planned_private',
        metadata: { defaultBranch: 'main', visibility: 'private' },
      }).resource },
      { table: 'job_step_events', row: milestonePlan({
        buildJobId: input.buildJobId,
        sequence: 2,
        stage: 'repo',
        status: 'planned',
        title: 'Private repo planned',
        detail: `JarvisBot-knox/${repoName}`,
      }).event },
      { table: 'job_step_events', row: milestonePlan({
        buildJobId: input.buildJobId,
        sequence: 3,
        stage: 'build',
        status: 'completed',
        title: 'Static build checks planned',
        detail: 'Install, build, typecheck/lint where available, and secret scan posture.',
        jobStatus: 'building',
      }).event },
      ...preview.resources.map((row) => ({ table: 'app_resources', row })),
      { table: 'proof_artifacts', row: preview.checkArtifact },
      { table: 'job_step_events', row: milestonePlan({
        buildJobId: input.buildJobId,
        sequence: 4,
        stage: 'preview',
        status: 'ready',
        title: 'Preview proof ready',
        detail: input.previewUrl,
        jobStatus: 'preview_ready',
      }).event },
      { table: 'job_approvals', row: {
        build_job_id: input.buildJobId,
        approval_type: 'deploy',
        status: 'pending',
        risk_category: 'production_deploy',
        requested_action: `Deploy ${input.title} to production`,
        requested_channel: 'telegram',
        requested_by_label: 'OpenClaw',
        summary: `Approve production deploy after reviewing ${input.previewUrl}.`,
        metadata: {
          previewUrl: input.previewUrl,
          productionUrl: input.productionUrl,
          repoName,
        },
      } },
      { table: 'proof_artifacts', row: artifactPlan({
        buildJobId: input.buildJobId,
        artifactType: 'build_summary',
        title: 'Deploy approval package',
        summary: `Preview ${input.previewUrl}; production target ${input.productionUrl}; source/env verification required before live deploy.`,
        metadata: {
          previewUrl: input.previewUrl,
          productionUrl: input.productionUrl,
          repoName,
        },
      }).artifact },
      { table: 'proof_artifacts', row: production.verificationArtifact },
      { table: 'app_resources', row: production.resource },
      { table: 'job_step_events', row: production.event },
      { table: 'build_jobs', id: input.buildJobId, patch: production.jobPatch },
    ],
  };
}

async function executeStaticBuild(flags) {
  const jobId = flags['job-id'];
  if (!jobId) throw new Error('--job-id is required');

  const title = flags.title;
  if (!title) throw new Error('--title is required');

  const templateId = flags.template || 'premium_static_app';
  const slug = slugify(flags.slug || title);
  const repoName = flags.repo || `generated-${jobId}`;
  const outputDir = flags['output-dir'] || `/tmp/jarvis-build-${jobId}`;
  const vars = flags.vars ? JSON.parse(String(flags.vars)) : {};

  console.log(`[1/6] Generating site from template: ${templateId}`);
  await runGenerate([
    '--template', templateId,
    '--output-dir', outputDir,
    '--vars', JSON.stringify({ SITE_TITLE: title, ...vars }),
  ]);

  const seq2 = await nextSequence(jobId);
  await insert('job_step_events', milestonePlan({
    buildJobId: jobId,
    sequence: seq2,
    stage: 'build',
    status: 'completed',
    title: 'Template generated',
    detail: `Template: ${templateId}, output: ${outputDir}`,
    jobStatus: 'building',
  }).event);
  await patchById('build_jobs', jobId, { status: 'building' });

  console.log(`[2/6] Creating GitHub repo: ${repoName}`);
  const githubResult = await runGithub([
    '--repo-name', repoName,
    '--source-dir', outputDir,
    '--job-id', jobId,
  ]);

  const seq3 = await nextSequence(jobId);
  await insert('job_step_events', milestonePlan({
    buildJobId: jobId,
    sequence: seq3,
    stage: 'repo',
    status: 'completed',
    title: 'GitHub repo created',
    detail: githubResult.repoUrl,
  }).event);

  console.log(`[3/6] Deploying Vercel preview`);
  const previewResult = await runVercel([
    '--repo-name', repoName,
    '--job-id', jobId,
    '--env', 'preview',
  ]);

  const seq4 = await nextSequence(jobId);
  await insert('job_step_events', milestonePlan({
    buildJobId: jobId,
    sequence: seq4,
    stage: 'preview',
    status: 'ready',
    title: 'Preview deployment ready',
    detail: previewResult.deploymentUrl,
    jobStatus: 'preview_ready',
  }).event);
  await patchById('build_jobs', jobId, { status: 'preview_ready' });

  await insert('job_approvals', {
    build_job_id: jobId,
    approval_type: 'deploy',
    status: 'pending',
    risk_category: 'production_deploy',
    requested_action: `Deploy ${title} to production`,
    requested_channel: 'telegram',
    requested_by_label: 'OpenClaw',
    summary: `Approve production deploy after reviewing ${previewResult.deploymentUrl}.`,
    metadata: { previewUrl: previewResult.deploymentUrl, repoName },
  });

  const seq5 = await nextSequence(jobId);
  await insert('job_step_events', milestonePlan({
    buildJobId: jobId,
    sequence: seq5,
    stage: 'approval',
    status: 'pending',
    title: 'Deploy approval requested',
    detail: `Preview: ${previewResult.deploymentUrl}`,
    jobStatus: 'awaiting_deploy_approval',
  }).event);
  await patchById('build_jobs', jobId, { status: 'awaiting_deploy_approval' });

  console.log(`[4/6] Waiting for deploy approval from Trevor...`);
  await waitForDeployApproval(jobId);

  console.log(`[5/6] Deploying Vercel production`);
  const productionResult = await runVercel([
    '--repo-name', repoName,
    '--job-id', jobId,
    '--env', 'production',
  ]);

  const seq6 = await nextSequence(jobId);
  await insert('job_step_events', milestonePlan({
    buildJobId: jobId,
    sequence: seq6,
    stage: 'deploy',
    status: 'live',
    title: 'Production deployment live',
    detail: productionResult.deploymentUrl,
    jobStatus: 'live',
  }).event);
  await patchById('build_jobs', jobId, { status: 'live' });

  console.log(`[6/6] Recording final URL`);
  await insert('app_resources', {
    build_job_id: jobId,
    resource_type: 'vercel_production_deployment',
    provider: 'vercel',
    name: 'Production deployment',
    external_id: productionResult.deploymentId,
    url: productionResult.deploymentUrl,
    environment: 'production',
    status: 'live',
    secret_names: [],
    metadata: { projectId: productionResult.projectId, repoName },
  });

  return {
    jobId,
    previewUrl: previewResult.deploymentUrl,
    productionUrl: productionResult.deploymentUrl,
    repoUrl: githubResult.repoUrl,
    status: 'live',
  };
}

export async function run(argv = process.argv.slice(2)) {
  const { command, flags } = parseArgs(argv);
  const dryRun = boolFlag(flags, 'dry-run');

  if (command !== 'plan') throw new Error(`Unsupported static build command: ${command || '(missing)'}`);

  if (dryRun) {
    const plan = staticVerticalSlicePlan({
      buildJobId: flags['job-id'],
      title: flags.title,
      slug: flags.slug,
      templateId: flags.template,
      templateUrl: flags['template-url'],
      repoName: flags.repo,
      repoUrl: flags['repo-url'],
      vercelProject: flags['vercel-project'],
      previewUrl: flags['preview-url'],
      productionUrl: flags['production-url'],
      artifactBaseUrl: flags['artifact-base-url'],
      sourceRef: flags['source-ref'],
      commitSha: flags['commit-sha'],
      viewports: listFlag(flags, 'viewports', ['desktop', 'mobile']),
      buildApproved: boolFlag(flags, 'build-approved'),
      deployApproved: boolFlag(flags, 'deploy-approved'),
      sourceVerified: boolFlag(flags, 'source-verified'),
      environmentVerified: boolFlag(flags, 'environment-verified'),
    });
    return { dryRun: true, command, ...plan };
  }

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for live execution');
  }

  return executeStaticBuild(flags);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
