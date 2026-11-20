// Solara Cover Studio — entrypoint for make.fun's "Make GTA 6 Cover Art" bounty.
//
// Copies app/ and screenshots/ from this repository into the output
// directory and writes /output/dossier.json with buildDossier from
// vendor/makefun-app.ts (the kit's library, unchanged).
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const OUTPUT_DIR = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 48 * 1024 * 1024,
  app_path_max_bytes: 1000,
};

/** Empty a directory's contents without removing the directory itself. */
function emptyDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (const entry of readdirSync(dir)) {
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

/** Copy a directory tree, failing loudly when the source is missing. */
function copyTree(src: string, dest: string): void {
  if (!existsSync(src)) throw new Error(`main.ts: missing ${src}`);
  cpSync(src, dest, { recursive: true });
}

function main(): void {
  emptyDir(OUTPUT_DIR);
  copyTree(join(REPO_ROOT, 'app'), join(OUTPUT_DIR, 'app'));
  copyTree(join(REPO_ROOT, 'screenshots'), join(OUTPUT_DIR, 'screenshots'));
  const dossier = buildDossier(OUTPUT_DIR, DOSSIER_CAPS);
  writeFileSync(join(OUTPUT_DIR, 'dossier.json'), dossier);
  const appBytes = readFileSync(join(OUTPUT_DIR, 'app', 'index.html')).length;
  console.log(`main.ts: wrote ${OUTPUT_DIR} (index.html ${appBytes} bytes, dossier.json ${dossier.length} bytes)`);
}

main();
