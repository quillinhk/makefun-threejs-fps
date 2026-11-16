// main.ts — the program entrypoint for this make.fun threejs-fps-02 entry.
//
// It hands the game in: it copies game/ and screenshots/ (both beside this file)
// into the output directory, then writes dossier.json there with buildDossier
// from vendor/makefun-threejs.ts. Node 22, standard library only.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The output directory comes from MAKEFUN_OUTPUT_DIR, defaulting to /output
// (the grader's output directory).

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDossier } from './vendor/makefun-threejs.ts';

// The dossier caps for threejs-fps-02 (from the kit's RULES.txt):
//   game/ holds at most 993 files and directories and 48 MiB in all, every path
//   at most 1,000 UTF-8 bytes; screenshots/ holds 3 to 4 images, each at most
//   256 KiB; the dossier text holds at most 163,840 UTF-8 bytes.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

mkdirSync(outDir, { recursive: true });

// game/ is required: copy the whole tree into the output directory.
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });

// screenshots/ holds the game's renders; copy it when the repository has one.
const shotsDir = join(repoRoot, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
}

// The dossier is built from the output directory's own game/ and screenshots/,
// so it matches exactly what the scorer computes from the same files.
const dossier = buildDossier(outDir, CAPS);
writeFileSync(join(outDir, 'dossier.json'), dossier);
