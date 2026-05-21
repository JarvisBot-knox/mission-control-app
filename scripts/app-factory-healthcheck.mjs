#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isDryRun(argv) {
  return argv.includes('--dry-run');
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

async function patchById(table, id, patch) {
  return supabaseFetch(`${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
}

async function checkUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
    clearTimeout(timer);
    return { url, status: res.status, healthy: res.status >= 200 && res.status < 400 };
  } catch {
    clearTimeout(timer);
    return { url, status: 'timeout/error', healthy: false };
  }
}

export async function run(argv = process.argv.slice(2)) {
  const dryRun = isDryRun(argv);

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  const resourceRows = await read(
    "app_resources?select=id,url,app_id,resource_type,status&resource_type=in.(vercel_production_deployment,vercel_preview_deployment)&status=neq.degraded&url=not.is.null"
  );
  const appRows = await read(
    "apps?select=id,production_url,status&production_url=not.is.null&status=eq.active"
  );

  const urlMap = new Map();

  for (const row of resourceRows || []) {
    if (row.url && !urlMap.has(row.url)) {
      urlMap.set(row.url, { type: 'resource', id: row.id, appId: row.app_id });
    }
  }
  for (const row of appRows || []) {
    if (row.production_url && !urlMap.has(row.production_url)) {
      urlMap.set(row.production_url, { type: 'app', id: row.id });
    }
  }

  const urls = [...urlMap.keys()];

  if (!urls.length) {
    const msg = 'TELEGRAM_NOTIFY: Health check passed. No URLs to check.';
    console.log(msg);
    return { healthy: 0, degraded: 0, degradedUrls: [] };
  }

  const results = await Promise.all(urls.map(checkUrl));
  const degraded = results.filter((r) => !r.healthy);
  const healthy = results.filter((r) => r.healthy);

  if (!dryRun) {
    for (const result of degraded) {
      const meta = urlMap.get(result.url);
      if (!meta) continue;
      if (meta.type === 'resource') {
        await patchById('app_resources', meta.id, { status: 'degraded' });
        if (meta.appId) {
          await patchById('apps', meta.appId, { status: 'paused' });
        }
      } else if (meta.type === 'app') {
        await patchById('apps', meta.id, { status: 'paused' });
      }
    }
  }

  const degradedList = degraded.map((r) => r.url).join(', ');

  if (degraded.length) {
    const msg = `TELEGRAM_NOTIFY: Health check found ${degraded.length} degraded URL(s): ${degradedList}. Check Mission Control.`;
    console.log(msg);
    if (dryRun) console.log('[dry-run] Supabase updates skipped.');
  } else {
    const msg = `TELEGRAM_NOTIFY: Health check passed. ${healthy.length} URL${healthy.length !== 1 ? 's' : ''} healthy.`;
    console.log(msg);
  }

  return {
    healthy: healthy.length,
    degraded: degraded.length,
    degradedUrls: degraded.map((r) => r.url),
    results,
    dryRun,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
