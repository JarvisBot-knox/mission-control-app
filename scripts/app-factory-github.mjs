#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const GITHUB_ORG = 'JarvisBot-knox';

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

async function githubFetch(path, options = {}, token) {
  const url = path.startsWith('https://') ? path : `https://api.github.com${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub ${path} failed: ${response.status} ${body}`);
  }

  if (response.status === 204) return null;
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

export async function createGithubRepo({ repoName, sourceDir, jobId, dryRun = false }) {
  if (!repoName) throw new Error('--repo-name is required');
  if (!sourceDir) throw new Error('--source-dir is required');

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) throw new Error('GITHUB_TOKEN env var is required');

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const files = await readdir(sourceDir);

  if (dryRun) {
    console.log(`[dry-run] Would create private repo: ${GITHUB_ORG}/${repoName}`);
    for (const file of files) {
      console.log(`[dry-run] Would push file: ${file}`);
    }
    if (jobId && supabaseUrl && serviceRoleKey) {
      console.log(`[dry-run] Would record app_resources row for github_repo`);
    }
    return {
      dryRun: true,
      repoUrl: `https://github.com/${GITHUB_ORG}/${repoName}`,
      cloneUrl: `https://github.com/${GITHUB_ORG}/${repoName}.git`,
    };
  }

  console.log(`[github] Creating private repo: ${GITHUB_ORG}/${repoName}`);
  const repo = await githubFetch('/user/repos', {
    method: 'POST',
    body: JSON.stringify({ name: repoName, private: true, auto_init: true }),
  }, githubToken);

  const defaultBranch = repo.default_branch || 'main';

  const latestCommit = await githubFetch(
    `/repos/${GITHUB_ORG}/${repoName}/git/ref/heads/${defaultBranch}`,
    { method: 'GET' },
    githubToken
  );
  const latestSha = latestCommit.object.sha;

  const blobTree = await githubFetch(
    `/repos/${GITHUB_ORG}/${repoName}/git/trees/${latestSha}`,
    { method: 'GET' },
    githubToken
  );

  const treeItems = [];
  for (const file of files) {
    const content = await readFile(join(sourceDir, file), 'utf8');
    const blob = await githubFetch(`/repos/${GITHUB_ORG}/${repoName}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content, encoding: 'utf-8' }),
    }, githubToken);
    treeItems.push({ path: file, mode: '100644', type: 'blob', sha: blob.sha });
    console.log(`[github] Pushed: ${file}`);
  }

  const newTree = await githubFetch(`/repos/${GITHUB_ORG}/${repoName}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: blobTree.sha, tree: treeItems }),
  }, githubToken);

  const commit = await githubFetch(`/repos/${GITHUB_ORG}/${repoName}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: 'Initial generated site',
      tree: newTree.sha,
      parents: [latestSha],
    }),
  }, githubToken);

  await githubFetch(`/repos/${GITHUB_ORG}/${repoName}/git/refs/heads/${defaultBranch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  }, githubToken);

  const repoUrl = repo.html_url;
  const cloneUrl = repo.clone_url;

  if (jobId && supabaseUrl && serviceRoleKey) {
    await supabaseFetch(supabaseUrl, serviceRoleKey, 'app_resources', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        build_job_id: jobId,
        resource_type: 'github_repo',
        provider: 'github',
        name: `${GITHUB_ORG}/${repoName}`,
        url: repoUrl,
        status: 'created',
        metadata: { html_url: repoUrl, clone_url: cloneUrl },
      }),
    });
    console.log(`[github] Recorded app_resources row`);
  }

  console.log(`[github] Repo ready: ${repoUrl}`);
  return { repoUrl, cloneUrl, repoFullName: `${GITHUB_ORG}/${repoName}` };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flags = parseArgs(process.argv.slice(2));

  createGithubRepo({
    repoName: flags['repo-name'],
    sourceDir: flags['source-dir'],
    jobId: flags['job-id'],
    dryRun: boolFlag(flags, 'dry-run'),
  })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
