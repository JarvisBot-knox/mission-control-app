#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const WATCHED_FILES = [
  '/Users/knoxbot/.openclaw/workspace/SOUL.md',
  '/Users/knoxbot/.openclaw/workspace/USER.md',
  '/Users/knoxbot/.openclaw/workspace/MEMORY.md',
  '/Users/knoxbot/.openclaw/workspace/open-loops.md',
  '/Users/knoxbot/.openclaw/workspace/HEARTBEAT.md',
];

const CRON_JOBS_PATH = '/Users/knoxbot/.openclaw/cron/jobs.json';
const CRON_STATE_PATH = '/Users/knoxbot/.openclaw/cron/jobs-state.json';

const dryRun = process.argv.includes('--dry-run');
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function openclawJson(args) {
  let lastError;
  const allowed = new Set([
    'status',
    'gateway status',
    'cron list',
  ]);
  const command = args.join(' ');

  if (!allowed.has(command)) {
    throw new Error(`Unsupported OpenClaw command: ${command}`);
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const { stdout } = await execFileAsync('/bin/zsh', ['-lc', `openclaw ${command} --json`], {
        maxBuffer: 1024 * 1024 * 10,
      });
      return JSON.parse(stdout);
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw lastError;
}

function toIso(ms) {
  return typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeOpenclawJson(label, args) {
  try {
    return { label, data: await openclawJson(args), error: null };
  } catch (error) {
    return {
      label,
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readJsonFile(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function supabaseFetch(path, options = {}) {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required without --dry-run');
  }

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
  if (dryRun) return { dryRun: true, table, row };
  return supabaseFetch(table, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
}

async function upsert(table, conflictTarget, row) {
  if (dryRun) return [{ dryRun: true, table, row }];
  return supabaseFetch(`${table}?on_conflict=${conflictTarget}`, {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  });
}

function buildSystemSnapshot(status, gateway) {
  const recent = status?.sessions?.recent || [];
  const primarySession = recent[0] || null;
  const gatewayRunning = gateway?.service?.runtime?.status === 'running'
    || status?.gatewayService?.runtime?.status === 'running'
    || status?.gatewayService?.runtimeShort?.startsWith('running');

  return {
    source: 'openclaw',
    gateway_status: gateway?.rpc?.ok || gatewayRunning ? 'ok' : status?.gateway?.reachable ? 'ok' : 'warning',
    gateway_url: gateway?.rpc?.url || status?.gateway?.url || null,
    gateway_version: gateway?.rpc?.server?.version || status?.runtimeVersion || null,
    cli_version: gateway?.cli?.version || null,
    model: primarySession?.model || status?.sessions?.defaults?.model || null,
    sessions_active: status?.sessions?.count ?? status?.agents?.totalSessions ?? null,
    raw_summary: {
      runtimeVersion: status?.runtimeVersion,
      gatewayService: status?.gatewayService?.runtimeShort || gateway?.service?.runtime?.status,
      gatewayBindMode: gateway?.gateway?.bindMode,
      gatewayPort: gateway?.gateway?.port,
      defaultAgentId: status?.agents?.defaultId,
      taskWarnings: status?.taskAudit?.warnings,
    },
  };
}

async function readCronList() {
  const [jobsFile, stateFile] = await Promise.all([
    readJsonFile(CRON_JOBS_PATH),
    readJsonFile(CRON_STATE_PATH),
  ]);

  return {
    jobs: (jobsFile.jobs || [])
      .filter((job) => job.enabled)
      .map((job) => ({
        ...job,
        state: stateFile.jobs?.[job.id]?.state || job.state || {},
        updatedAtMs: stateFile.jobs?.[job.id]?.updatedAtMs || job.updatedAtMs,
      })),
  };
}

function buildCronRows(cronList) {
  return (cronList.jobs || []).map((job) => ({
    openclaw_id: job.id,
    name: job.name,
    schedule: job.schedule?.expr || '',
    timezone: job.schedule?.tz || 'America/Denver',
    next_run_text: toIso(job.state?.nextRunAtMs),
    last_run_text: toIso(job.state?.lastRunAtMs),
    status: job.status || job.state?.lastStatus || null,
    target: job.sessionTarget || null,
    model: job.payload?.model || null,
    collected_at: new Date().toISOString(),
  }));
}

async function readWatchedFile(path) {
  const [fileStat, content] = await Promise.all([
    stat(path),
    readFile(path, 'utf8'),
  ]);

  return {
    label: basename(path),
    path,
    byte_size: Buffer.byteLength(content),
    sha256: sha256(content),
    content,
    modified_at: fileStat.mtime.toISOString(),
  };
}

async function collect() {
  const gatewayResult = await safeOpenclawJson('gateway_status', ['gateway', 'status']);
  await sleep(750);
  const statusResult = await safeOpenclawJson('status', ['status']);
  const cronResult = await readCronList()
    .then((data) => ({ label: 'cron_files', data, error: null }))
    .catch((error) => ({
      label: 'cron_files',
      data: null,
      error: error instanceof Error ? error.message : String(error),
    }));
  const files = await Promise.all(WATCHED_FILES.map(readWatchedFile));
  const sourceErrors = [statusResult, gatewayResult, cronResult]
    .filter((result) => result.error)
    .map(({ label, error }) => ({ label, error }));

  const systemSnapshot = buildSystemSnapshot(statusResult.data, gatewayResult.data);
  const cronRows = cronResult.data ? buildCronRows(cronResult.data) : [];

  const result = {
    collectedAt: new Date().toISOString(),
    systemSnapshot,
    cronRows,
    watchedFiles: files.map(({ content, ...file }) => file),
    sourceErrors,
  };

  if (dryRun) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  await insert('system_snapshots', systemSnapshot);

  for (const cronRow of cronRows) {
    await upsert('cron_jobs', 'openclaw_id', cronRow);
  }

  for (const file of files) {
    const [watchedFile] = await upsert('watched_files', 'label', {
      label: file.label,
      path: file.path,
      is_active: true,
    });

    await insert('file_snapshots', {
      watched_file_id: watchedFile.id,
      byte_size: file.byte_size,
      sha256: file.sha256,
      content: file.content,
      modified_at: file.modified_at,
    });
  }

  await insert('events', {
    source: 'collector',
    event_type: 'collector_run',
    severity: sourceErrors.length ? 'warning' : 'info',
    title: sourceErrors.length ? 'OpenClaw collector completed with warnings' : 'OpenClaw collector completed',
    detail: `Collected ${cronRows.length} cron jobs and ${files.length} watched files.`,
    metadata: {
      cronJobs: cronRows.length,
      watchedFiles: files.length,
      sourceErrors,
    },
  });

  console.log(JSON.stringify(result, null, 2));
}

collect().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
