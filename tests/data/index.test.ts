import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { rebuildIndex } from '../../src/data/index.js';
import { dataPath, writeText, readJson } from '../../src/data/filesystem.js';
let root: string;
afterEach(async () => { vi.unstubAllEnvs(); vi.restoreAllMocks(); if (root) await rm(root, { recursive: true, force: true }); });
it('rekonstruiert einen defekten Index und initialisiert leere Akten', async () => { root = await mkdtemp(path.join(os.tmpdir(), 'erna-index-')); vi.stubEnv('ERNA_DATA_PATH', root); await writeText(dataPath('erna-index.json'), '{kaputt'); vi.spyOn(console, 'error').mockImplementation(() => undefined); const index = await rebuildIndex(); expect(index.mandanten).toEqual([]); expect(await readJson(dataPath('erna-index.json'))).toEqual(index); expect((await rebuildIndex()).erstellt).toBe(index.erstellt); });
