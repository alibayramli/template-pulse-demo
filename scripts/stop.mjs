import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const windows = process.platform === 'win32';
const normalize = value => {
  const path = value.replaceAll('\\', '/');
  return windows ? path.toLowerCase() : path;
};
const root = normalize(fileURLToPath(new URL('../', import.meta.url)));
const output = execFileSync(
  windows ? 'powershell.exe' : 'ps',
  windows
    ? [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_Process -Filter "Name = \'node.exe\'" | ForEach-Object { "$($_.ProcessId) $($_.CommandLine)" }',
      ]
    : ['-eo', 'pid=,args='],
  { encoding: 'utf8', windowsHide: true },
);

for (const line of output.split(/\r?\n/)) {
  const match = line.trim().match(/^(\d+)\s+(.+)$/);
  if (!match) continue;
  const [, pid, command] = match;
  const normalized = normalize(command);
  if (
    !normalized.includes(root) ||
    !/\/@backstage\/(?:cli\/bin\/backstage-cli\b.*\bstart\b|cli-node\/config\/nodetransform\.cjs\b)/i.test(
      normalized,
    )
  )
    continue;
  try {
    process.kill(Number(pid), 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}
console.log("Stopped this project's Backstage dev processes.");
