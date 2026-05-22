#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const githubToken = process.env.GITHUB_TOKEN;
const vercelToken = process.env.VERCEL_TOKEN;
const vercelTeamId = process.env.VERCEL_TEAM_ID || null;

const DEFAULT_STALE_COMMAND_HOURS = 24;
const DEFAULT_STALE_APPROVAL_HOURS = 72;
const DEFAULT_ARCHIVE_JOB_DAYS = 30;
const DEFAULT_USAGE_RETENTION_DAYS = 90;
const GITHUB_ORG = 'JarvisBot-knox';

const TERMINAL_ARCHIVABLE_JOB_STATUSES = new Set(['failed', 'canceled']);

export function parseArgs(argv) {
  const [command = 'audit', ...rest] = argv;
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

function numberFlag(flags, name, fallback) {
  const raw = flags[name];
  if (raw === undefined || raw === true) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be a positive number`);
  return value;
}

function cutoffIso(amount, unit) {
  const multiplier = unit === 'days' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  return new Date(Date.now() - amount * multiplier).toISOString();
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

async function read(path) {
  return supabaseFetch(path, { method: 'GET' });
}

export function buildHygieneConfig(flags = {}) {
  return {
    staleCommandHours: numberFlag(flags, 'stale-command-hours', DEFAULT_STALE_COMMAND_HOURS),
    staleApprovalHours: numberFlag(flags, 'stale-approval-hours', DEFAULT_STALE_APPROVAL_HOURS),
    archiveJobDays: numberFlag(flags, 'archive-job-days', DEFAULT_ARCHIVE_JOB_DAYS),
    usageRetentionDays: numberFlag(flags, 'usage-retention-days', DEFAULT_USAGE_RETENTION_DAYS),
  };
}

function resourceNameSet(resources, provider, typePrefix = null) {
  return new Set(resources
    .filter((row) => row.provider === provider && (!typePrefix || row.resource_type?.startsWith(typePrefix)))
    .map((row) => row.name)
    .filter(Boolean));
}

function resourceUrlSet(resources, provider) {
  return new Set(resources
    .filter((row) => row.provider === provider)
    .flatMap((row) => [row.url, row.metadata?.html_url, row.metadata?.clone_url])
    .filter(Boolean));
}

export function buildExternalReconciliation(raw, external = {}) {
  const githubNames = resourceNameSet(raw.resources, 'github');
  const githubUrls = resourceUrlSet(raw.resources, 'github');
  const vercelNames = resourceNameSet(raw.resources, 'vercel');
  const vercelUrls = resourceUrlSet(raw.resources, 'vercel');

  const unmanagedGithubRepos = (external.githubRepos || [])
    .filter((repo) => !githubNames.has(repo.fullName) && !githubUrls.has(repo.url))
    .map((repo) => ({
      provider: 'github',
      fullName: repo.fullName,
      url: repo.url,
      private: repo.private,
      reason: 'external_repo_missing_app_resource',
    }));

  const unmanagedVercelProjects = (external.vercelProjects || [])
    .filter((project) => !vercelNames.has(project.name) && !vercelUrls.has(project.url))
    .map((project) => ({
      provider: 'vercel',
      name: project.name,
      id: project.id,
      url: project.url,
      reason: 'external_project_missing_app_resource',
    }));

  return {
    status: external.status || 'not_checked',
    errors: external.errors || [],
    counts: {
      githubReposChecked: (external.githubRepos || []).length,
      vercelProjectsChecked: (external.vercelProjects || []).length,
      unmanagedGithubRepos: unmanagedGithubRepos.length,
      unmanagedVercelProjects: unmanagedVercelProjects.length,
    },
    unmanagedGithubRepos,
    unmanagedVercelProjects,
  };
}

export function planHygieneActions(raw, config, nowIso = new Date().toISOString(), external = {}) {
  const staleCommands = raw.commandRequests.map((row) => ({
    kind: 'cancel_stale_command',
    table: 'command_requests',
    id: row.id,
    label: row.command_type,
    requestedAt: row.requested_at,
    patch: {
      status: 'canceled',
      completed_at: nowIso,
      error_message: 'auto-canceled by app factory hygiene: stale pending command',
    },
  }));

  const staleApprovals = raw.approvals.map((row) => ({
    kind: 'expire_stale_approval',
    table: 'job_approvals',
    id: row.id,
    label: row.approval_type,
    requestedAt: row.requested_at,
    patch: {
      status: 'expired',
      decided_at: nowIso,
      decision_note: 'auto-expired by app factory hygiene: stale pending approval',
    },
  }));

  const jobsToArchive = raw.buildJobs
    .filter((row) => TERMINAL_ARCHIVABLE_JOB_STATUSES.has(row.status))
    .map((row) => ({
      kind: 'archive_terminal_job',
      table: 'build_jobs',
      id: row.id,
      label: row.title,
      updatedAt: row.updated_at,
      patch: {
        status: 'archived',
        updated_at: nowIso,
      },
    }));

  const usageRowsToDelete = raw.usageObservations.map((row) => ({
    kind: 'delete_old_usage_observation',
    table: 'usage_observations',
    id: row.id,
    label: row.session_id || row.source,
    observedAt: row.observed_at,
  }));

  const reconciliation = buildExternalReconciliation(raw, external);

  return {
    generatedAt: nowIso,
    config,
    counts: {
      staleCommands: staleCommands.length,
      staleApprovals: staleApprovals.length,
      jobsToArchive: jobsToArchive.length,
      usageRowsToDelete: usageRowsToDelete.length,
      unmanagedGithubRepos: reconciliation.counts.unmanagedGithubRepos,
      unmanagedVercelProjects: reconciliation.counts.unmanagedVercelProjects,
    },
    recommendedSupabaseActions: [
      ...staleCommands,
      ...staleApprovals,
      ...jobsToArchive,
      ...usageRowsToDelete,
    ],
    reconciliation,
  };
}

async function githubFetch(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub ${path} failed: ${response.status} ${body}`);
  }

  return response.json();
}

async function vercelFetch(path) {
  const url = new URL(`https://api.vercel.com${path}`);
  if (vercelTeamId) url.searchParams.set('teamId', vercelTeamId);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${vercelToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Vercel ${path} failed: ${response.status} ${body}`);
  }

  return response.json();
}

async function readExternalInventory() {
  const errors = [];
  let githubRepos = [];
  let vercelProjects = [];

  if (githubToken) {
    try {
      const rows = await githubFetch(`/orgs/${GITHUB_ORG}/repos?type=private&per_page=100`);
      githubRepos = rows.map((repo) => ({
        fullName: repo.full_name,
        name: repo.name,
        url: repo.html_url,
        private: repo.private,
      }));
    } catch (error) {
      errors.push({ provider: 'github', message: error instanceof Error ? error.message : String(error) });
    }
  } else {
    errors.push({ provider: 'github', message: 'GITHUB_TOKEN missing; external repo reconciliation skipped' });
  }

  if (vercelToken) {
    try {
      const result = await vercelFetch('/v9/projects?limit=100');
      vercelProjects = (result.projects || []).map((project) => ({
        id: project.id,
        name: project.name,
        url: project.link?.repo ? `https://vercel.com/${project.name}` : null,
      }));
    } catch (error) {
      errors.push({ provider: 'vercel', message: error instanceof Error ? error.message : String(error) });
    }
  } else {
    errors.push({ provider: 'vercel', message: 'VERCEL_TOKEN missing; external project reconciliation skipped' });
  }

  return {
    status: errors.length ? 'partial' : 'checked',
    errors,
    githubRepos,
    vercelProjects,
  };
}

async function readHygieneData(config) {
  const staleCommandCutoff = cutoffIso(config.staleCommandHours, 'hours');
  const staleApprovalCutoff = cutoffIso(config.staleApprovalHours, 'hours');
  const archiveJobCutoff = cutoffIso(config.archiveJobDays, 'days');
  const usageCutoff = cutoffIso(config.usageRetentionDays, 'days');

  const [
    commandRequests,
    approvals,
    buildJobs,
    usageObservations,
    allBuildJobs,
    apps,
    resources,
  ] = await Promise.all([
    read(`command_requests?select=id,command_type,requested_at&status=eq.pending&requested_at=lt.${encodeURIComponent(staleCommandCutoff)}&order=requested_at.asc`),
    read(`job_approvals?select=id,approval_type,requested_at&status=eq.pending&requested_at=lt.${encodeURIComponent(staleApprovalCutoff)}&order=requested_at.asc`),
    read(`build_jobs?select=id,title,status,updated_at&status=in.(failed,canceled)&updated_at=lt.${encodeURIComponent(archiveJobCutoff)}&order=updated_at.asc`),
    read(`usage_observations?select=id,source,session_id,observed_at&observed_at=lt.${encodeURIComponent(usageCutoff)}&order=observed_at.asc&limit=500`),
    read('build_jobs?select=id'),
    read('apps?select=id'),
    read('app_resources?select=id,app_id,build_job_id,resource_type,provider,name,url,status,metadata'),
  ]);

  return {
    commandRequests: commandRequests || [],
    approvals: approvals || [],
    buildJobs: buildJobs || [],
    usageObservations: usageObservations || [],
    allBuildJobs: allBuildJobs || [],
    apps: apps || [],
    resources: resources || [],
  };
}

function printSummary(plan) {
  console.log('App Factory hygiene audit report');
  console.log(`- stale pending commands: ${plan.counts.staleCommands}`);
  console.log(`- stale pending approvals: ${plan.counts.staleApprovals}`);
  console.log(`- failed/canceled jobs to archive: ${plan.counts.jobsToArchive}`);
  console.log(`- old usage observations to delete: ${plan.counts.usageRowsToDelete}`);
  console.log(`- unmanaged GitHub repos: ${plan.counts.unmanagedGithubRepos}`);
  console.log(`- unmanaged Vercel projects: ${plan.counts.unmanagedVercelProjects}`);

  if (plan.recommendedSupabaseActions.length) {
    console.log('[audit] Recommended Supabase actions (not applied):');
    for (const action of plan.recommendedSupabaseActions) {
      console.log(`  - ${action.kind}: ${action.table}/${action.id}${action.label ? ` (${action.label})` : ''}`);
    }
  }

  if (plan.reconciliation.errors.length) {
    console.log('[audit] External reconciliation warnings:');
    for (const error of plan.reconciliation.errors) {
      console.log(`  - ${error.provider}: ${error.message}`);
    }
  }
}

export async function run(argv = process.argv.slice(2)) {
  const { command, flags } = parseArgs(argv);
  if (!['audit', 'clean'].includes(command)) throw new Error(`Unsupported hygiene command: ${command}`);
  if (command === 'clean' || flags.apply === true) {
    throw new Error('Hygiene apply is disabled. Run audit, reconcile external resources, then implement approved atomic cleanup actions.');
  }

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  const config = buildHygieneConfig(flags);
  const raw = await readHygieneData(config);
  const external = flags['skip-external'] === true ? { status: 'skipped', errors: [] } : await readExternalInventory();
  const plan = planHygieneActions(raw, config, new Date().toISOString(), external);

  printSummary(plan);

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
