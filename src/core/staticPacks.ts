import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Mode, StaticPackInfo } from './types.js';

interface PersistedThinkingPhrases {
  'chat.agent.thinking.phrases'?: {
    mode?: Mode;
    phrases?: unknown;
  };
}

function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.json$/i, '')
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseStaticPack(filePath: string, fileName: string): StaticPackInfo | null {
  const rawText = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(rawText) as PersistedThinkingPhrases | string[];

  let phrases: string[] = [];
  let mode: Mode = 'append';

  if (Array.isArray(parsed)) {
    phrases = parsed.filter((phrase): phrase is string => typeof phrase === 'string');
  } else {
    const payload = parsed['chat.agent.thinking.phrases'];
    mode = payload?.mode === 'replace' ? 'replace' : 'append';
    phrases = Array.isArray(payload?.phrases)
      ? payload.phrases.filter((phrase): phrase is string => typeof phrase === 'string')
      : [];
  }

  if (phrases.length === 0) {
    return null;
  }

  return {
    name: titleFromFileName(fileName),
    fileName,
    path: filePath,
    mode,
    phrases,
  };
}

export function discoverStaticPacks(rootDir = process.cwd()): StaticPackInfo[] {
  const outDir = resolve(rootDir, 'out');
  if (!existsSync(outDir)) {
    return [];
  }

  return readdirSync(outDir)
    .filter(entry => entry.endsWith('.json'))
    .map(fileName => parseStaticPack(join(outDir, fileName), fileName))
    .filter((pack): pack is StaticPackInfo => Boolean(pack))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getStaticPackByPath(filePath: string, rootDir = process.cwd()): StaticPackInfo | undefined {
  const resolvedPath = resolve(rootDir, filePath);
  return discoverStaticPacks(rootDir).find(pack => resolve(pack.path) === resolvedPath);
}