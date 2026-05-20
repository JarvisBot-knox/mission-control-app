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

export async function createGithubRepo({ repoName, sourceDir, jobId, appSlug, dryRun = false }) {
  if (!repoName) throw new Error('--repo-name is required');
  if (!sourceDir) throw new Error('--source-dir is required');

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) throw new Error('GITHUB_TOKEN env var is required');

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Derive slug: use explicit appSlug, or strip generated- prefix and UUID suffix from repoName
  const slug = appSlug || repoName.replace(/^generated-/, '').replace(/-[0-9a-f-]{36}$/, '');
  // Use slug as repo name (one-app-one-repo architecture)
  const finalRepoName = appSlug || slug || repoName;

  const files = await readdir(sourceDir);

  if (dryRun) {
    console.log(`[dry-run] Would check apps table for slug: ${slug}`);
    console.log(`[dry-run] Would create or reuse private repo: ${GITHUB_ORG}/${finalRepoName}`);
    for (const file of files) {
      console.log(`[dry-run] Would push file: ${file}`);
    }
    if (jobId && supabaseUrl && serviceRoleKey) {
      console.log(`[dry-run] Would upsert apps row and record app_resources row for github_repo`);
    }
    return {
      dryRun: true,
      repoUrl: `https://github.com/${GITHUB_ORG}/${finalRepoName}`,
      cloneUrl: `https://github.com/${GITHUB_ORG}/${finalRepoName}.git`,
    };
  }

  // Check for existing app with repo_path already set
  let existingRepoPath = null;
  if (supabaseUrl && serviceRoleKey && slug) {
    const appRows = await supabaseFetch(supabaseUrl, serviceRoleKey, `apps?select=id,repo_path&slug=eq.${encodeURIComponent(slug)}&limit=1`);
    if (appRows?.[0]?.repo_path) {
      existingRepoPath = appRows[0].repo_path;
      console.log(`[github] Using existing repo: ${existingRepoPath}`);
    }
  }

  let repoUrl;
  let cloneUrl;
  let repoFullName;

  if (existingRepoPath) {
    repoFullName = existingRepoPath;
    repoUrl = `https://github.com/${existingRepoPath}`;
    cloneUrl = `https://github.com/${existingRepoPath}.git`;
  } else {
    const repo = await githubFetch('/user/repos', {
      method: 'POST',
      body: JSON.stringify({ name: finalRepoName, private: true, auto_init: true }),
    }, githubToken);

    const defaultBranch = repo.default_branch || 'main';

    const latestCommit = await githubFetch(
      `/repos/${GITHUB_ORG}/${finalRepoName}/git/ref/heads/${defaultBranch}`,
      { method: 'GET' },
      githubToken
    );
    const latestSha = latestCommit.object.sha;

    const blobTree = await githubFetch(
      `/repos/${GITHUB_ORG}/${finalRepoName}/git/trees/${latestSha}`,
      { method: 'GET' },
      githubToken
    );

    const treeItems = [];
    for (const file of files) {
      const content = await readFile(join(sourceDir, file), 'utf8');
      const blob = await githubFetch(`/repos/${GITHUB_ORG}/${finalRepoName}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content, encoding: 'utf-8' }),
      }, githubToken);
      treeItems.push({ path: file, mode: '100644', type: 'blob', sha: blob.sha });
      console.log(`[github] Pushed: ${file}`);
    }

    const newTree = await githubFetch(`/repos/${GITHUB_ORG}/${finalRepoName}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: blobTree.sha, tree: treeItems }),
    }, githubToken);

    const commit = await githubFetch(`/repos/${GITHUB_ORG}/${finalRepoName}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message: 'Initial generated site',
        tree: newTree.sha,
        parents: [latestSha],
      }),
    }, githubToken);

    await githubFetch(`/repos/${GITHUB_ORG}/${finalRepoName}/git/refs/heads/${defaultBranch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha }),
    }, githubToken);

    repoUrl = repo.html_url;
    cloneUrl = repo.clone_url;
    repoFullName = `${GITHUB_ORG}/${finalRepoName}`;
  }

  // Upsert apps row
  if (supabaseUrl && serviceRoleKey && slug) {
    await supabaseFetch(supabaseUrl, serviceRoleKey, `apps?slug=eq.${encodeURIComponent(slug)}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        name: finalRepoName,
        slug,
        app_type: 'generated',
        repo_path: repoFullName,
        status: 'draft',
      }),
    });
    console.log(`[github] Upserted apps row for slug: ${slug}`);
  }

  if (jobId && supabaseUrl && serviceRoleKey) {
    await supabaseFetch(supabaseUrl, serviceRoleKey, 'app_resources', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        build_job_id: jobId,
        resource_type: 'github_repo',
        provider: 'github',
        name: repoFullName,
        url: repoUrl,
        status: existingRepoPath ? 'existing' : 'created',
        metadata: { html_url: repoUrl, clone_url: cloneUrl },
      }),
    });
    console.log(`[github] Recorded app_resources row`);
  }

  console.log(`[github] Repo ready: ${repoUrl}`);
  return { repoUrl, cloneUrl, repoFullName };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flags = parseArgs(process.argv.slice(2));

  createGithubRepo({
    repoName: flags['repo-name'],
    sourceDir: flags['source-dir'],
    jobId: flags['job-id'],
    appSlug: flags['app-slug'],
    dryRun: boolFlag(flags, 'dry-run'),
  })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
