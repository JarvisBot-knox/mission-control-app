#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { artifactPlan, milestonePlan, resourcePlan, slugify } from './app-factory-state.mjs';
import { visualProofPlan } from './app-factory-visual-proof.mjs';
import { vercelPreviewPlan, vercelProductionPlan } from './app-factory-vercel.mjs';

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

export async function run(argv = process.argv.slice(2)) {
  const { command, flags } = parseArgs(argv);
  const dryRun = boolFlag(flags, 'dry-run');
  if (command !== 'plan') throw new Error(`Unsupported static build command: ${command || '(missing)'}`);
  if (!dryRun) throw new Error('Real static build execution is gated; run with --dry-run for this slice');

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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
