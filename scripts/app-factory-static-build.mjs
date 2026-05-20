#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { artifactPlan, milestonePlan, resourcePlan, slugify } from './app-factory-state.mjs';
import { visualProofPlan } from './app-factory-visual-proof.mjs';
import { vercelPreviewPlan, vercelProductionPlan } from './app-factory-vercel.mjs';

const execAsync = promisify(exec);

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
  const proof = visualProofPlan({
    buildJobId: input.buildJobId,
    previewUrl: input.previewUrl,
    viewports: input.viewports,
    artifactBaseUrl: input.artifactBaseUrl || null,
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
      ...proof.artifacts.map((row) => ({ table: 'proof_artifacts', row })),
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

async function runScript(cmd, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] Would run: ${cmd}`);
    return '';
  }
  console.log(`[exec] ${cmd}`);
  const { stdout, stderr } = await execAsync(cmd, { env: process.env });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  return stdout;
}

async function recordMilestone(jobId, stage, status, title, detail, jobStatus, dryRun) {
  const args = [
    `node scripts/app-factory-job.mjs record-milestone`,
    `--job-id ${jobId}`,
    `--stage ${stage}`,
    `--status ${status}`,
    `--title "${title.replace(/"/g, '\\"')}"`,
  ];
  if (detail) args.push(`--detail "${detail.replace(/"/g, '\\"')}"`);
  if (jobStatus) args.push(`--job-status ${jobStatus}`);
  if (dryRun) args.push('--dry-run');
  await runScript(args.join(' '), false);
}

async function supabaseFetch(path, options = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

async function pollDeployApproval(jobId, maxWaitMs = 10 * 60 * 1000, intervalMs = 30_000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const rows = await supabaseFetch(
      `job_approvals?select=id,status&build_job_id=eq.${encodeURIComponent(jobId)}&approval_type=eq.deploy&order=requested_at.asc&limit=1`
    );
    const approval = rows?.[0];
    if (approval?.status === 'approved') return { approved: true, approvalId: approval.id };
    if (approval?.status === 'rejected') return { approved: false, approvalId: approval.id, reason: 'rejected' };
    console.log(`[poll] Waiting for deploy approval... (${Math.round((deadline - Date.now()) / 1000)}s left)`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return { approved: false, reason: 'timeout' };
}

async function runLiveBuild(flags) {
  const jobId = flags['job-id'];
  const title = flags.title || 'Untitled';
  const template = flags.template || 'premium_static_app';
  const slug = flags.slug || slugify(title);
  const repoName = flags.repo || `generated-${jobId}`;
  const outputDir = flags['output-dir'] || `/tmp/jarvis-build-${jobId}`;
  const vars = flags.vars && flags.vars !== true ? flags.vars : '{}';

  try {
    // Step 1: Generate
    await recordMilestone(jobId, 'build', 'in_progress', 'Generating site files', template, 'building', false);
    await runScript(
      `node scripts/app-factory-generate.mjs --template ${template} --output-dir ${outputDir} --vars '${vars}'`,
      false
    );

    // Step 2: GitHub
    await runScript(
      `node scripts/app-factory-github.mjs --repo-name ${repoName} --source-dir ${outputDir} --job-id ${jobId}`,
      false
    );

    // Step 3: Vercel preview
    await recordMilestone(jobId, 'preview', 'in_progress', 'Deploying preview', null, null, false);
    const previewOut = await runScript(
      `node scripts/app-factory-vercel.mjs --repo-name ${repoName} --job-id ${jobId} --env preview`,
      false
    );
    let previewUrl;
    try {
      previewUrl = JSON.parse(previewOut.trim()).deploymentUrl;
    } catch {
      previewUrl = null;
    }

    await recordMilestone(jobId, 'preview', 'ready', 'Preview ready', previewUrl || repoName, 'preview_ready', false);

    // Step 4: Insert deploy approval request
    await supabaseFetch('command_requests', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        build_job_id: jobId,
        command_type: 'request_deploy_approval',
        status: 'pending',
        target_type: 'approval',
        requested_by_label: 'OpenClaw',
        risk_category: 'production_deploy',
        result_summary: `Preview: ${previewUrl || 'see job resources'}`,
      }),
    });

    // Step 5: Poll for deploy approval
    const approval = await pollDeployApproval(jobId);
    if (!approval.approved) {
      await recordMilestone(jobId, 'deploy', 'failed', 'Deploy not approved', approval.reason, 'failed', false);
      return { status: 'not_approved', reason: approval.reason };
    }

    // Step 6: Vercel production
    await recordMilestone(jobId, 'deploy', 'in_progress', 'Deploying to production', null, 'deploying', false);
    const prodOut = await runScript(
      `node scripts/app-factory-vercel.mjs --repo-name ${repoName} --job-id ${jobId} --env production`,
      false
    );
    let productionUrl;
    try {
      productionUrl = JSON.parse(prodOut.trim()).deploymentUrl;
    } catch {
      productionUrl = null;
    }

    // Step 7: Record final URL
    const finalArgs = [
      `node scripts/app-factory-job.mjs record-final-url`,
      `--job-id ${jobId}`,
      `--url "${(productionUrl || '').replace(/"/g, '\\"')}"`,
      `--name "${title.replace(/"/g, '\\"')}"`,
    ];
    await runScript(finalArgs.join(' '), false);

    return { status: 'live', productionUrl, previewUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await recordMilestone(jobId, 'build', 'failed', 'Build failed', message, 'failed', false);
    } catch {
      // best-effort
    }
    throw error;
  }
}

export async function run(argv = process.argv.slice(2)) {
  const { command, flags } = parseArgs(argv);
  const dryRun = boolFlag(flags, 'dry-run');
  if (command !== 'plan' && command !== 'build') throw new Error(`Unsupported static build command: ${command || '(missing)'}`);

  if (command === 'build') {
    if (dryRun) {
      console.log('[dry-run] Would run full live build pipeline');
      console.log('[dry-run] Steps: generate → github → vercel preview → poll approval → vercel production → record-final-url');
      return { dryRun: true, command };
    }
    return runLiveBuild(flags);
  }

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

  return { dryRun, command, ...plan };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
