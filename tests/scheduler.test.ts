import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  discoverConfigProfiles,
  formatConfigPathForDisplay,
  getInstalledSchedulerInfo,
  SCHEDULER_LABEL,
  INSTALLED_PLIST_PATH,
  DEFAULT_SCHEDULER_INTERVAL_SECONDS,
} from '../src/core/scheduler.js';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const tmpDir = join(tmpdir(), 'thinking-phrases-test-scheduler');

describe('scheduler constants', () => {
  it('has expected label', () => {
    expect(SCHEDULER_LABEL).toBe('com.austenstone.thinking-phrases.rss');
  });

  it('has expected plist path', () => {
    expect(INSTALLED_PLIST_PATH).toContain('LaunchAgents');
    expect(INSTALLED_PLIST_PATH).toContain(SCHEDULER_LABEL);
  });

  it('has positive default interval', () => {
    expect(DEFAULT_SCHEDULER_INTERVAL_SECONDS).toBeGreaterThan(0);
  });
});

// ── getInstalledSchedulerInfo ────────────────────────────────────────
describe('getInstalledSchedulerInfo', () => {
  it('returns installed status and metadata', () => {
    const info = getInstalledSchedulerInfo();
    expect(info).toHaveProperty('installed');
    expect(info).toHaveProperty('label', SCHEDULER_LABEL);
    expect(info).toHaveProperty('plistPath', INSTALLED_PLIST_PATH);
    expect(typeof info.installed).toBe('boolean');

    if (info.installed) {
      // If a scheduler is installed, intervalSeconds should be a number
      expect(typeof info.intervalSeconds).toBe('number');
    }
  });
});

describe('discoverConfigProfiles', () => {
  beforeEach(() => {
    mkdirSync(join(tmpDir, 'configs'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('discovers .config.json files at root', () => {
    writeFileSync(join(tmpDir, 'my.config.json'), '{}');
    const profiles = discoverConfigProfiles(tmpDir);
    expect(profiles).toContain('my.config.json');
  });

  it('discovers json files inside configs/', () => {
    writeFileSync(join(tmpDir, 'configs', 'test.json'), '{}');
    const profiles = discoverConfigProfiles(tmpDir);
    expect(profiles).toContain('configs/test.json');
  });

  it('ignores node_modules', () => {
    mkdirSync(join(tmpDir, 'node_modules'), { recursive: true });
    writeFileSync(join(tmpDir, 'node_modules', 'hidden.config.json'), '{}');
    const profiles = discoverConfigProfiles(tmpDir);
    expect(profiles).not.toContain('node_modules/hidden.config.json');
  });
});

describe('formatConfigPathForDisplay', () => {
  it('returns relative path when inside rootDir', () => {
    const result = formatConfigPathForDisplay('/project/configs/test.json', '/project');
    expect(result).toBe('configs/test.json');
  });

  it('returns absolute path when outside rootDir', () => {
    const result = formatConfigPathForDisplay('/other/test.json', '/project');
    expect(result).toBe('/other/test.json');
  });
});
