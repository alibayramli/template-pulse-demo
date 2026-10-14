import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  writeFileSync,
  copyFileSync,
  readFileSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';

const root = fileURLToPath(new URL('../', import.meta.url));
// GitHub supplies the actual Pages URL; local builds default to this repository.
const baseUrl = new URL(
  process.env.DEMO_BASE_URL ||
    'https://alibayramli.github.io/template-pulse-demo',
);
if (
  !['http:', 'https:'].includes(baseUrl.protocol) ||
  baseUrl.search ||
  baseUrl.hash
) {
  throw new Error(
    'DEMO_BASE_URL must be an HTTP(S) URL without a query or hash.',
  );
}
mkdirSync(new URL('../.cache/', import.meta.url), { recursive: true });
const override = fileURLToPath(
  new URL('../.cache/static-base-url.yaml', import.meta.url),
);
writeFileSync(
  override,
  stringify({ app: { baseUrl: baseUrl.href.replace(/\/$/, '') } }),
);
const cli = fileURLToPath(
  new URL('../node_modules/@backstage/cli/bin/backstage-cli', import.meta.url),
);
const result = spawnSync(
  process.execPath,
  [
    cli,
    'package',
    'build',
    '--config',
    fileURLToPath(new URL('../app-config.static.yaml', import.meta.url)),
    '--config',
    override,
  ],
  {
    cwd: fileURLToPath(new URL('../packages/app/', import.meta.url)),
    stdio: 'inherit',
    env: process.env,
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
// Publish browser assets without the original source embedded in source maps.
stripSourceMaps(
  fileURLToPath(new URL('../packages/app/dist/', import.meta.url)),
);
const manifestPath = new URL(
  '../packages/app/dist/manifest.json',
  import.meta.url,
);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.start_url = `${baseUrl.pathname.replace(/\/$/, '')}/`;
manifest.scope = manifest.start_url;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(new URL('../packages/app/dist/.nojekyll', import.meta.url), '');
// Also allow older /template-pulse bookmarks to boot and redirect to the root.
copyFileSync(
  new URL('../packages/app/dist/index.html', import.meta.url),
  new URL('../packages/app/dist/404.html', import.meta.url),
);
console.log(
  `Static showcase built in ${root}packages/app/dist for ${baseUrl.href}`,
);

function stripSourceMaps(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) stripSourceMaps(path);
    else if (entry.isFile() && entry.name.endsWith('.map')) unlinkSync(path);
    else if (entry.isFile() && /\.(js|css)$/.test(entry.name)) {
      const original = readFileSync(path, 'utf8');
      const stripped = original.replace(
        /(?:\/\/[#@]\s*sourceMappingURL=[^\r\n]*|\/\*[#@]\s*sourceMappingURL=[\s\S]*?\*\/)\s*$/,
        '',
      );
      if (stripped !== original) writeFileSync(path, stripped);
    }
  }
}
