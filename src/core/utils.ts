import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import type { Config, Target } from './types.js';

export interface ZipLocation {
  zipCode: string;
  placeName: string;
  state: string;
  stateAbbreviation: string;
  latitude: number;
  longitude: number;
}

export const USER_AGENT = 'thinking-phrases/1.0 (+https://github.com/austenstone/thinking-phrases)';

export function logInfo(config: Pick<Config, 'verbose'>, message: string): void {
  if (config.verbose) {
    console.log(`[phrases] ${message}`);
  }
}

export function logDebug(config: Pick<Config, 'debug'>, message: string): void {
  if (config.debug) {
    console.log(`[phrases:debug] ${message}`);
  }
}

export function loadDotEnv(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/gu, '');
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function expandHome(filePath: string): string {
  return filePath.startsWith('~/') ? join(homedir(), filePath.slice(2)) : filePath;
}

export function resolveSettingsPath(target: Target, explicitPath?: string): string {
  if (explicitPath) {
    const expanded = expandHome(explicitPath);
    return isAbsolute(expanded) ? expanded : resolve(process.cwd(), expanded);
  }

  const home = homedir();
  const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
  const candidates = {
    insiders: [
      join(home, 'Library', 'Application Support', 'Code - Insiders', 'User', 'settings.json'),
      join(home, '.config', 'Code - Insiders', 'User', 'settings.json'),
      join(appData, 'Code - Insiders', 'User', 'settings.json'),
    ],
    stable: [
      join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json'),
      join(home, '.config', 'Code', 'User', 'settings.json'),
      join(appData, 'Code', 'User', 'settings.json'),
    ],
  };

  const firstExisting = (paths: string[]) => paths.find(path => existsSync(path));

  if (target === 'insiders') {
    return firstExisting(candidates.insiders) ?? candidates.insiders[0];
  }

  if (target === 'stable') {
    return firstExisting(candidates.stable) ?? candidates.stable[0];
  }

  return firstExisting([...candidates.insiders, ...candidates.stable]) ?? candidates.insiders[0];
}

export function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input;
  }

  return `${input.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function singleLine(input: string, maxLength = input.length): string {
  return truncate(input.replace(/\s+/gu, ' ').trim(), maxLength);
}

export function decodeHtmlEntities(input: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/giu, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized in named) {
      return named[normalized];
    }

    if (!normalized.startsWith('#')) {
      return match;
    }

    const isHex = normalized.startsWith('#x');
    const codePoint = Number.parseInt(normalized.slice(isHex ? 2 : 1), isHex ? 16 : 10);
    if (Number.isNaN(codePoint)) {
      return match;
    }

    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return match;
    }
  });
}

export function stripHtml(input?: string): string | undefined {
  if (!input) {
    return undefined;
  }

  const cleaned = decodeHtmlEntities(input)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

  return cleaned || undefined;
}

export function relativeTime(input?: string): string | undefined {
  if (!input) {
    return undefined;
  }

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60_000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.round(hours / 24)}d ago`;
}

export function dedupePhrases(phrases: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const phrase of phrases) {
    const normalized = phrase.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(phrase);
  }

  return unique;
}

export function normalizeSymbols(symbols: string[]): string[] {
  return Array.from(new Set(symbols.map(symbol => symbol.trim().toUpperCase()).filter(Boolean)));
}

export function normalizeUsZipCode(input?: string): string | undefined {
  const digits = input?.replace(/\D+/gu, '').slice(0, 5);
  return digits && digits.length === 5 ? digits : undefined;
}

export function isValidUsZipCode(input?: string): boolean {
  return Boolean(normalizeUsZipCode(input));
}

export function formatPrice(value: number, currency?: string): string {
  const normalizedCurrency = currency?.trim().toUpperCase() || 'USD';

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizedCurrency,
      minimumFractionDigits: value < 1 ? 4 : 2,
      maximumFractionDigits: value < 1 ? 4 : 2,
    }).format(value);
  } catch {
    return `${value.toFixed(value < 1 ? 4 : 2)} ${normalizedCurrency}`;
  }
}

export function formatSignedPercent(value?: number): string | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }

  const normalizedValue = value as number;
  const arrow = normalizedValue > 0 ? '▲' : normalizedValue < 0 ? '▼' : '•';
  return `${arrow} ${Math.abs(normalizedValue).toFixed(2)}%`;
}

export async function fetchText(url: string, headers?: Record<string, string>): Promise<string> {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, ...(headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url} (${response.status})`);
  }

  return response.text();
}

export async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'application/json',
      ...(headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url} (${response.status})`);
  }

  return response.json() as Promise<T>;
}

interface ZippopotamResponse {
  country?: string;
  'post code'?: string;
  places?: Array<{
    latitude?: string;
    longitude?: string;
    'place name'?: string;
    state?: string;
    'state abbreviation'?: string;
  }>;
}

const zipLocationCache = new Map<string, Promise<ZipLocation>>();

export async function fetchUsZipLocation(zipCode: string): Promise<ZipLocation> {
  const normalizedZip = normalizeUsZipCode(zipCode);
  if (!normalizedZip) {
    throw new Error(`Invalid ZIP code: ${zipCode}`);
  }

  const cached = zipLocationCache.get(normalizedZip);
  if (cached) {
    return cached;
  }

  const lookupPromise = fetchJson<ZippopotamResponse>(`https://api.zippopotam.us/us/${normalizedZip}`)
    .then(payload => {
      const place = payload.places?.[0];
      const latitude = Number(place?.latitude);
      const longitude = Number(place?.longitude);

      if (!place || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error(`Could not resolve ZIP code ${normalizedZip}`);
      }

      return {
        zipCode: normalizedZip,
        placeName: place['place name']?.trim() || normalizedZip,
        state: place.state?.trim() || '',
        stateAbbreviation: place['state abbreviation']?.trim().toUpperCase() || '',
        latitude,
        longitude,
      } satisfies ZipLocation;
    })
    .catch(error => {
      zipLocationCache.delete(normalizedZip);
      throw error;
    });

  zipLocationCache.set(normalizedZip, lookupPromise);
  return lookupPromise;
}
