/**
 * One absolute DB_URL for everything. `mastra dev` (bundled, different cwd) and `tsx`
 * CLI scripts resolve a relative `file:./mastra.db` to DIFFERENT files — the classic
 * symptom is Studio showing agents but no datasets. So we compute one
 * project-root-absolute path and use it everywhere (overridable via env).
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url)); // <root>/src/mastra
export const PROJECT_ROOT = resolve(here, '..', '..');

export const DB_URL = process.env.DB_URL ?? `file:${resolve(PROJECT_ROOT, 'mastra.db')}`;
