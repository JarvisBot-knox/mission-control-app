#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
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
const SESSIONS_DIR = '/Users/knoxbot/.openclaw/agents/main/sessions';
const USAGE_SESSION_LIMIT = 120;

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

function toInt(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
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

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
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

function sessionIdFromFile(name) {
  return name.endsWith('.jsonl') ? name.slice(0, -'.jsonl'.length) : name;
}

async function listRecentSessionFiles() {
  const entries = await readdir(SESSIONS_DIR, { withFileTypes: true });
  const files = await Promise.all(entries
    .filter((entry) => entry.isFile())
    .filter((entry) => entry.name.endsWith('.jsonl'))
    .filter((entry) => !entry.name.endsWith('.trajectory.jsonl'))
    .map(async (entry) => {
      const path = join(SESSIONS_DIR, entry.name);
      const fileStat = await stat(path);
      return { name: entry.name, path, mtimeMs: fileStat.mtimeMs };
    }));

  return files
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, USAGE_SESSION_LIMIT);
}

function usageFromMessage(record) {
  const usage = record?.message?.usage;
  if (!usage) return null;

  const input = toInt(usage.input);
  const output = toInt(usage.output);
  const cacheRead = toInt(usage.cacheRead);
  const cacheWrite = toInt(usage.cacheWrite);
  const total = toInt(usage.totalTokens || usage.total || input + output + cacheRead + cacheWrite);

  if (!total && !input && !output && !cacheRead && !cacheWrite) return null;

  return {
    provider: record.message.provider || null,
    model: record.message.model || null,
    input_tokens: input,
    output_tokens: output,
    cache_read_tokens: cacheRead,
    cache_write_tokens: cacheWrite,
    total_tokens: total,
    estimated_cost: typeof usage.cost?.total === 'number' ? usage.cost.total : null,
    estimate_currency: typeof usage.cost?.total === 'number' ? 'USD' : null,
  };
}

function buildUsageRow(file, record) {
  const usage = usageFromMessage(record);
  if (!usage) return null;

  const sessionId = sessionIdFromFile(file.name);
  const messageId = record.id || record.message?.idempotencyKey || sha256(JSON.stringify({
    timestamp: record.timestamp,
    parentId: record.parentId,
    usage,
  }));
  const observedAt = record.timestamp || record.message?.timestamp || new Date(file.mtimeMs).toISOString();

  return {
    external_key: `session-message:${sessionId}:${messageId}`,
    source: 'openclaw_session',
    session_id: sessionId,
    session_key: record.message?.__openclaw?.mirrorIdentity || null,
    run_id: null,
    provider: usage.provider,
    model: usage.model,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_tokens: usage.cache_read_tokens,
    cache_write_tokens: usage.cache_write_tokens,
    total_tokens: usage.total_tokens,
    estimated_cost: usage.estimated_cost,
    estimate_currency: usage.estimate_currency,
    estimate_note: 'Observed local OpenClaw session usage. Cost values are estimates when present and may be zero for OAuth-backed models.',
    observed_at: observedAt,
    metadata: {
      messageId,
      stopReason: record.message?.stopReason || null,
      role: record.message?.role || null,
      sessionFile: file.name,
    },
  };
}

async function readUsageObservations() {
  const files = await listRecentSessionFiles();
  const rows = [];
  const errors = [];

  for (const file of files) {
    try {
      const text = await readFile(file.path, 'utf8');
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        const record = parseJsonLine(line);
        if (!record) continue;
        const row = buildUsageRow(file, record);
        if (row) rows.push(row);
      }
    } catch (error) {
      errors.push({
        label: basename(file.path),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { rows, errors, scannedFiles: files.length };
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
  const usageResult = await readUsageObservations()
    .then((data) => ({ label: 'usage_observations', data, error: null }))
    .catch((error) => ({
      label: 'usage_observations',
      data: null,
      error: error instanceof Error ? error.message : String(error),
    }));
  const sourceErrors = [statusResult, gatewayResult, cronResult, usageResult]
    .filter((result) => result.error)
    .map(({ label, error }) => ({ label, error }));
  const usageRows = usageResult.data?.rows || [];
  const usageErrors = usageResult.data?.errors || [];
  if (usageErrors.length) {
    sourceErrors.push(...usageErrors.map(({ label, error }) => ({ label: `usage:${label}`, error })));
  }

  const systemSnapshot = buildSystemSnapshot(statusResult.data, gatewayResult.data);
  const cronRows = cronResult.data ? buildCronRows(cronResult.data) : [];
  const usageSummary = {
    scannedFiles: usageResult.data?.scannedFiles || 0,
    observations: usageRows.length,
    totalTokens: usageRows.reduce((sum, row) => sum + row.total_tokens, 0),
    inputTokens: usageRows.reduce((sum, row) => sum + row.input_tokens, 0),
    outputTokens: usageRows.reduce((sum, row) => sum + row.output_tokens, 0),
    cacheReadTokens: usageRows.reduce((sum, row) => sum + row.cache_read_tokens, 0),
    cacheWriteTokens: usageRows.reduce((sum, row) => sum + row.cache_write_tokens, 0),
  };

  const result = {
    collectedAt: new Date().toISOString(),
    systemSnapshot,
    cronRows,
    watchedFiles: files.map(({ content, ...file }) => file),
    usageSummary,
    usageRows,
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

    const existingSnapshot = await supabaseFetch(
      `file_snapshots?select=id&watched_file_id=eq.${encodeURIComponent(watchedFile.id)}&sha256=eq.${encodeURIComponent(file.sha256)}&limit=1`
    );
    if (existingSnapshot?.length) {
      console.log(`skipped unchanged: ${file.label}`);
    } else {
      await insert('file_snapshots', {
        watched_file_id: watchedFile.id,
        byte_size: file.byte_size,
        sha256: file.sha256,
        content: file.content,
        modified_at: file.modified_at,
      });
    }
  }

  for (const usageRow of usageRows) {
    await upsert('usage_observations', 'external_key', usageRow);
  }

  await insert('events', {
    source: 'collector',
    event_type: 'collector_run',
    severity: sourceErrors.length ? 'warning' : 'info',
    title: sourceErrors.length ? 'OpenClaw collector completed with warnings' : 'OpenClaw collector completed',
    detail: `Collected ${cronRows.length} cron jobs, ${files.length} watched files, and ${usageRows.length} usage observations.`,
    metadata: {
      cronJobs: cronRows.length,
      watchedFiles: files.length,
      usageObservations: usageRows.length,
      usageSummary,
      sourceErrors,
    },
  });

  console.log(JSON.stringify(result, null, 2));
}

collect().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
