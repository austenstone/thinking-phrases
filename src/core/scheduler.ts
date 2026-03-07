import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { InstalledSchedulerInfo } from './types.js';

export const SCHEDULER_LABEL = 'com.austenstone.thinking-phrases.rss';
export const INSTALLED_PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', `${SCHEDULER_LABEL}.plist`);
export const DEFAULT_SCHEDULER_INTERVAL_SECONDS = 60;

const IGNORED_DIRECTORIES = new Set(['.git', 'dist', 'node_modules', 'out']);

function parsePlistValue(plist: string, key: string): string | undefined {
	const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
	const match = new RegExp(`<key>${escapedKey}</key>\\s*<(string|integer)>([\\s\\S]*?)</\\1>`, 'u').exec(plist);
	return match?.[2]?.trim();
}

export function getInstalledSchedulerInfo(): InstalledSchedulerInfo {
	if (!existsSync(INSTALLED_PLIST_PATH)) {
		return {
			installed: false,
			label: SCHEDULER_LABEL,
			plistPath: INSTALLED_PLIST_PATH,
		};
	}

	const plist = readFileSync(INSTALLED_PLIST_PATH, 'utf8');
	const intervalText = parsePlistValue(plist, 'StartInterval');
	const configPath = parsePlistValue(plist, 'THINKING_PHRASES_CONFIG');

	return {
		installed: true,
		label: SCHEDULER_LABEL,
		plistPath: INSTALLED_PLIST_PATH,
		intervalSeconds: intervalText ? Number(intervalText) : undefined,
		configPath: configPath || undefined,
	};
}

function shouldIncludeConfigFile(rootDir: string, absolutePath: string): boolean {
	const fileName = absolutePath.split('/').pop() ?? '';
	if (fileName.endsWith('.config.json')) {
		return true;
	}

	const relativePath = relative(rootDir, absolutePath);
	return relativePath.startsWith(`configs/`) && relativePath.endsWith('.json');
}

function walkConfigs(rootDir: string, currentDir: string, results: Set<string>): void {
	for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (IGNORED_DIRECTORIES.has(entry.name)) {
				continue;
			}

			walkConfigs(rootDir, join(currentDir, entry.name), results);
			continue;
		}

		if (!entry.isFile() || !entry.name.endsWith('.json')) {
			continue;
		}

		const absolutePath = join(currentDir, entry.name);
		if (shouldIncludeConfigFile(rootDir, absolutePath)) {
			results.add(relative(rootDir, absolutePath));
		}
	}
}

export function discoverConfigProfiles(rootDir = process.cwd()): string[] {
	const resolvedRoot = resolve(rootDir);
	const results = new Set<string>();
	walkConfigs(resolvedRoot, resolvedRoot, results);
	return Array.from(results).sort((left, right) => left.localeCompare(right));
}

export function formatConfigPathForDisplay(configPath: string, rootDir = process.cwd()): string {
	const resolvedRoot = resolve(rootDir);
	const resolvedPath = resolve(configPath);
	const relativePath = relative(resolvedRoot, resolvedPath);
	return relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath) ? relativePath : resolvedPath;
}