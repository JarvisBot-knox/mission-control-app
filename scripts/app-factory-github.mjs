#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const GITHUB_API = 'https://api.github.com';
const GITHUB_ORG = 'JarvisBot-knox';

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i++;
    }
  }
  return flags;
}

async function githubFetch(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN environment variable is required');

  const url = path.startsWith('https://') ? path : `${GITHUB_API}${path}`;
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
    throw new Error(`GitHub API ${path} failed: ${response.status} ${body}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function supabaseFetch(path, options = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping Supabase record');
    return null;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
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

function collectFiles(dir, base = dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const rel = full.slice(base.length + 1);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectFiles(full, base));
    } else {
      files.push({ path: rel, content: readFileSync(full) });
    }
  }
  return files;
}

async function pushFilesToRepo(owner, repoName, files, defaultBranch) {
  const repoPath = `/repos/${owner}/${repoName}`;

  const refData = await githubFetch(`${repoPath}/git/refs/heads/${defaultBranch}`).catch(() => null);

  let treeSha;
  let parentSha;

  if (refData) {
    const commitData = await githubFetch(`${repoPath}/git/commits/${refData.object.sha}`);
    parentSha = refData.object.sha;
    treeSha = commitData.tree.sha;
  }

  const treeItems = [];
  for (const file of files) {
    const blobData = await githubFetch(`${repoPath}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({
        content: file.content.toString('base64'),
        encoding: 'base64',
      }),
    });
    treeItems.push({ path: file.path, mode: '100644', type: 'blob', sha: blobData.sha });
  }

  const newTree = await githubFetch(`${repoPath}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: treeSha,
      tree: treeItems,
    }),
  });

  const newCommit = await githubFetch(`${repoPath}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: 'Initial build from App Factory',
      tree: newTree.sha,
      ...(parentSha ? { parents: [parentSha] } : { parents: [] }),
    }),
  });

  const refEndpoint = refData
    ? `${repoPath}/git/refs/heads/${defaultBranch}`
    : `${repoPath}/git/refs`;

  if (refData) {
    await githubFetch(refEndpoint, {
      method: 'PATCH',
      body: JSON.stringify({ sha: newCommit.sha, force: false }),
    });
  } else {
    await githubFetch(refEndpoint, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${defaultBranch}`, sha: newCommit.sha }),
    });
  }

  return newCommit.sha;
}

async function main(argv) {
  const flags = parseArgs(argv);

  const repoName = flags['repo-name'];
  if (!repoName) throw new Error('--repo-name is required');

  const sourceDir = flags['source-dir'];
  if (!sourceDir) throw new Error('--source-dir is required');

  const jobId = flags['job-id'];
  if (!jobId) throw new Error('--job-id is required');

  const defaultBranch = 'main';

  const repoData = await githubFetch(`/orgs/${GITHUB_ORG}/repos`, {
    method: 'POST',
    body: JSON.stringify({
      name: repoName,
      private: true,
      auto_init: true,
      description: `App Factory build — job ${jobId}`,
    }),
  });

  console.log(`Repo created: ${repoData.html_url}`);

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const files = collectFiles(sourceDir);
  console.log(`Pushing ${files.length} file(s) to ${GITHUB_ORG}/${repoName}...`);

  const commitSha = await pushFilesToRepo(GITHUB_ORG, repoName, files, defaultBranch);

  await supabaseFetch('app_resources', {
    method: 'POST',
    body: JSON.stringify({
      build_job_id: jobId,
      resource_type: 'github_repo',
      provider: 'github',
      name: `${GITHUB_ORG}/${repoName}`,
      external_id: String(repoData.id),
      url: repoData.html_url,
      environment: null,
      status: 'ready',
      secret_names: [],
      metadata: {
        defaultBranch,
        visibility: 'private',
        commitSha,
        repoName,
        owner: GITHUB_ORG,
      },
    }),
  });

  const output = {
    repoName,
    repoUrl: repoData.html_url,
    defaultBranch,
    commitSha,
    cloneUrl: repoData.clone_url,
    jobId,
  };

  console.log(JSON.stringify(output, null, 2));
  return output;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { main as run };
