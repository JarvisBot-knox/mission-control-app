#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, '../templates');

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

function replaceTokens(template, vars) {
  const replaced = [];
  const missing = [];
  const TOKEN_RE = /\{\{([A-Z0-9_]+)\}\}/g;

  const seen = new Set();
  let match;
  while ((match = TOKEN_RE.exec(template)) !== null) {
    const key = match[1];
    if (!seen.has(key)) {
      seen.add(key);
      if (Object.hasOwn(vars, key)) {
        replaced.push(key);
      } else {
        missing.push(key);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required template variables: ${missing.join(', ')}`);
  }

  let result = template;
  for (const key of replaced) {
    result = result.replaceAll(`{{${key}}}`, vars[key]);
  }
  return { result, replaced };
}

async function main(argv) {
  const flags = parseArgs(argv);

  const templateId = flags.template;
  if (!templateId) throw new Error('--template is required');

  const outputDir = flags['output-dir'];
  if (!outputDir) throw new Error('--output-dir is required');

  const varsRaw = flags.vars;
  if (!varsRaw || varsRaw === true) throw new Error('--vars JSON string is required');
  const vars = JSON.parse(String(varsRaw));

  const templatePath = join(TEMPLATES_DIR, templateId, 'index.html');

  let templateSource;
  try {
    templateSource = readFileSync(templatePath, 'utf-8');
  } catch {
    throw new Error(`Template not found: ${templatePath}\nAvailable templates: ${TEMPLATES_DIR}/{template_id}/index.html`);
  }

  const { result, replaced } = replaceTokens(templateSource, vars);

  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, 'index.html');
  writeFileSync(outputPath, result, 'utf-8');

  const output = {
    templateId,
    outputPath,
    replaced,
    byteSize: Buffer.byteLength(result, 'utf-8'),
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
