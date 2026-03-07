import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeVsCodeSettings, removeVsCodeThinkingPhrases } from '../src/sinks/vscodeSettings.js';

const tmpDir = join(tmpdir(), 'thinking-phrases-test-vscode-settings');

beforeEach(() => {
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('writeVsCodeSettings', () => {
  it('creates settings file with phrases when it does not exist', () => {
    const settingsPath = join(tmpDir, 'settings.json');
    writeVsCodeSettings(settingsPath, ['phrase 1', 'phrase 2'], 'replace');

    expect(existsSync(settingsPath)).toBe(true);
    const content = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(content['chat.agent.thinking.phrases']).toEqual({
      mode: 'replace',
      phrases: ['phrase 1', 'phrase 2'],
    });
  });

  it('updates existing settings file without clobbering other keys', () => {
    const settingsPath = join(tmpDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({ 'editor.fontSize': 14 }, null, 2));

    writeVsCodeSettings(settingsPath, ['hello'], 'append');

    const content = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(content['editor.fontSize']).toBe(14);
    expect(content['chat.agent.thinking.phrases']).toEqual({
      mode: 'append',
      phrases: ['hello'],
    });
  });

  it('overwrites existing phrases', () => {
    const settingsPath = join(tmpDir, 'settings.json');
    writeVsCodeSettings(settingsPath, ['old phrase'], 'replace');
    writeVsCodeSettings(settingsPath, ['new phrase'], 'replace');

    const content = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(content['chat.agent.thinking.phrases'].phrases).toEqual(['new phrase']);
  });

  it('creates nested directories', () => {
    const settingsPath = join(tmpDir, 'deep', 'nested', 'settings.json');
    writeVsCodeSettings(settingsPath, ['test'], 'replace');
    expect(existsSync(settingsPath)).toBe(true);
  });

  it('file ends with newline', () => {
    const settingsPath = join(tmpDir, 'settings.json');
    writeVsCodeSettings(settingsPath, ['test'], 'replace');
    const raw = readFileSync(settingsPath, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
  });
});

describe('removeVsCodeThinkingPhrases', () => {
  it('returns false when key does not exist', () => {
    const settingsPath = join(tmpDir, 'settings.json');
    writeFileSync(settingsPath, '{}');
    expect(removeVsCodeThinkingPhrases(settingsPath)).toBe(false);
  });

  it('removes the thinking phrases key and returns true', () => {
    const settingsPath = join(tmpDir, 'settings.json');
    writeVsCodeSettings(settingsPath, ['test'], 'replace');

    expect(removeVsCodeThinkingPhrases(settingsPath)).toBe(true);

    const content = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(content['chat.agent.thinking.phrases']).toBeUndefined();
  });

  it('preserves other settings when removing', () => {
    const settingsPath = join(tmpDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({
      'editor.fontSize': 14,
      'chat.agent.thinking.phrases': { mode: 'replace', phrases: ['hello'] },
    }, null, 2));

    removeVsCodeThinkingPhrases(settingsPath);

    const content = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(content['editor.fontSize']).toBe(14);
    expect(content['chat.agent.thinking.phrases']).toBeUndefined();
  });
});
