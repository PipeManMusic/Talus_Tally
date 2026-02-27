#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const scriptPath = resolve(__dirname, 'prepare_tauri_resources.py');

const candidates = [
  ['python3'],
  ['python'],
  ['py', '-3'],
];

let lastError = null;

for (const candidate of candidates) {
  const [cmd, ...args] = candidate;
  const result = spawnSync(cmd, [...args, scriptPath], { stdio: 'inherit' });
  if (result.status === 0) {
    process.exit(0);
  }
  lastError = result.error || new Error(`${cmd} exited with code ${result.status}`);
}

console.error('[prepare-tauri] Failed to locate a working Python interpreter.');
if (lastError) {
  console.error(lastError.message);
}
process.exit(1);
