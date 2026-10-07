import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginNames = [
  'template-pulse',
  'template-pulse-backend',
  'template-pulse-common',
  'template-pulse-node',
  'scaffolder-backend-module-template-pulse',
];
const generatedDirectories = new Set([
  'node_modules',
  'dist',
  'dist-types',
  'coverage',
]);

function readSources(root) {
  const files = new Map();
  function visit(relative) {
    const directory = join(root, relative);
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (generatedDirectories.has(entry.name)) continue;
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && !/\.(log|tsbuildinfo)$/.test(entry.name)) {
        const content = readFileSync(join(root, path));
        files.set(path, {
          content,
          hash: createHash('sha256').update(content).digest('hex'),
        });
      }
    }
  }
  pluginNames.forEach(visit);
  return files;
}

// Locate the plugin by package identity so existing checkout directory names work.
function findPluginRoot(demoRoot) {
  const parent = resolve(demoRoot, '..');
  const preferred = join(parent, 'backstage-template-pulse');
  if (existsSync(join(preferred, 'plugins'))) return preferred;
  const matches = readdirSync(parent, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => join(parent, entry.name))
    .filter(directory => {
      const metadata = join(directory, 'package.json');
      if (!existsSync(metadata)) return false;
      try {
        return (
          JSON.parse(readFileSync(metadata, 'utf8')).name ===
          'backstage-template-pulse'
        );
      } catch {
        return false;
      }
    });
  if (matches.length > 1) {
    throw new Error(
      'Multiple Template Pulse repositories found; use the preferred sibling checkout path.',
    );
  }
  return matches[0] ?? preferred;
}

// Compare each copy with the last successful sync before writing either repo.
export function syncPlugins({
  demoRoot = fileURLToPath(new URL('../', import.meta.url)),
  pluginRoot = findPluginRoot(demoRoot),
  direction = 'auto',
  check = false,
} = {}) {
  if (!['auto', 'to-plugin', 'from-plugin'].includes(direction)) {
    throw new Error(`Unknown sync direction: ${direction}`);
  }
  const demoDirectory = join(demoRoot, 'plugins');
  const pluginDirectory = join(pluginRoot, 'plugins');
  if (!existsSync(pluginDirectory)) {
    if (check || direction !== 'auto') {
      throw new Error(`Plugin repository not found: ${pluginRoot}`);
    }
    console.log('Sibling plugin repository absent; using local demo plugins.');
    return;
  }
  const demo = readSources(demoDirectory);
  const plugin = readSources(pluginDirectory);
  const statePath = join(demoRoot, '.plugin-sync.json');
  const baseline = existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, 'utf8'))
    : {};
  const paths = new Set([
    ...Object.keys(baseline),
    ...demo.keys(),
    ...plugin.keys(),
  ]);
  const changes = [];
  const conflicts = [];
  for (const path of paths) {
    const local = demo.get(path);
    const upstream = plugin.get(path);
    if (local?.hash === upstream?.hash) continue;
    if (check) {
      conflicts.push(path);
      continue;
    }
    let fromDemo;
    if (direction !== 'auto') fromDemo = direction === 'to-plugin';
    else if (local?.hash === baseline[path]) fromDemo = false;
    else if (upstream?.hash === baseline[path]) fromDemo = true;
    else {
      conflicts.push(path);
      continue;
    }
    changes.push({
      path,
      destination: fromDemo ? pluginDirectory : demoDirectory,
      source: fromDemo ? local : upstream,
    });
  }
  if (conflicts.length) {
    throw new Error(
      `Plugin copies differ${check ? '' : ' and cannot be safely merged'}:\n` +
        conflicts.map(path => `  ${path}`).join('\n') +
        '\nReview both copies, then use yarn sync:plugins --to-plugin ' +
        'to keep demo changes or --from-plugin to keep plugin repo changes.',
    );
  }
  if (check) {
    console.log(
      'All Template Pulse packages are identical in both repositories.',
    );
    return;
  }
  for (const { path, destination, source } of changes) {
    const target = join(destination, path);
    if (source) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, source.content);
    } else if (existsSync(target)) unlinkSync(target);
  }
  const synced = readSources(demoDirectory);
  writeFileSync(
    statePath,
    `${JSON.stringify(
      Object.fromEntries([...synced].map(([path, file]) => [path, file.hash])),
      null,
      2,
    )}\n`,
  );
  console.log(`Synced ${changes.length} plugin file(s) with ${pluginRoot}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const allowed = ['--to-plugin', '--from-plugin', '--check'];
  if (
    args.some(arg => !allowed.includes(arg)) ||
    args.filter(arg => arg !== '--check').length > 1
  ) {
    console.error(
      'Usage: yarn sync:plugins [--to-plugin | --from-plugin | --check]',
    );
    process.exitCode = 1;
  } else {
    try {
      syncPlugins({
        direction: args.includes('--to-plugin')
          ? 'to-plugin'
          : args.includes('--from-plugin')
          ? 'from-plugin'
          : 'auto',
        check: args.includes('--check'),
      });
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
