#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

export async function generate({ templateId, outputDir, vars = {}, dryRun = false }) {
  if (!templateId) throw new Error('--template is required');
  if (!outputDir) throw new Error('--output-dir is required');

  const templatesRoot = join(__dirname, '..', 'templates');
  const templatePath = join(templatesRoot, templateId, 'index.html');

  let source;
  try {
    source = await readFile(templatePath, 'utf8');
  } catch {
    throw new Error(`Template not found: ${templatePath}`);
  }

  const replacements = [];
  let output = source.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
    const value = vars[key];
    if (value === undefined) {
      replacements.push({ key, value: match, replaced: false });
      return match;
    }
    replacements.push({ key, value, replaced: true });
    return value;
  });

  for (const rep of replacements) {
    if (rep.replaced) {
      console.log(`  [replace] {{${rep.key}}} → ${String(rep.value).slice(0, 80)}`);
    } else {
      console.log(`  [skip]    {{${rep.key}}} — no value provided, left as-is`);
    }
  }

  const outFile = join(outputDir, 'index.html');

  if (dryRun) {
    console.log(`[dry-run] Would write ${output.length} bytes to ${outFile}`);
    return { outputFile: outFile, replacements, dryRun: true };
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(outFile, output, 'utf8');
  console.log(`[generate] Written: ${outFile}`);

  return { outputFile: outFile, replacements };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flags = parseArgs(process.argv.slice(2));
  const vars = flags.vars && flags.vars !== true ? JSON.parse(String(flags.vars)) : {};

  generate({
    templateId: flags.template,
    outputDir: flags['output-dir'],
    vars,
    dryRun: boolFlag(flags, 'dry-run'),
  })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
