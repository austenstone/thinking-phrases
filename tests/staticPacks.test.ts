import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverStaticPacks, getStaticPackByPath } from '../src/core/staticPacks.js';

const tmpDir = join(tmpdir(), 'thinking-phrases-test-static-packs');

beforeEach(() => {
  mkdirSync(join(tmpDir, 'out'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('discoverStaticPacks', () => {
  it('returns empty array when out/ does not exist', () => {
    rmSync(join(tmpDir, 'out'), { recursive: true, force: true });
    expect(discoverStaticPacks(tmpDir)).toEqual([]);
  });

  it('discovers string-array packs', () => {
    writeFileSync(join(tmpDir, 'out', 'test-pack.json'), JSON.stringify(['phrase 1', 'phrase 2']));
    const packs = discoverStaticPacks(tmpDir);
    expect(packs).toHaveLength(1);
    expect(packs[0].name).toBe('Test Pack');
    expect(packs[0].phrases).toEqual(['phrase 1', 'phrase 2']);
    expect(packs[0].mode).toBe('append');
  });

  it('discovers object-format packs', () => {
    writeFileSync(join(tmpDir, 'out', 'copilot.json'), JSON.stringify({
      'chat.agent.thinking.phrases': {
        mode: 'replace',
        phrases: ['copilot tip 1'],
      },
    }));

    const packs = discoverStaticPacks(tmpDir);
    expect(packs).toHaveLength(1);
    expect(packs[0].mode).toBe('replace');
    expect(packs[0].phrases).toEqual(['copilot tip 1']);
  });

  it('skips empty packs', () => {
    writeFileSync(join(tmpDir, 'out', 'empty.json'), JSON.stringify([]));
    expect(discoverStaticPacks(tmpDir)).toEqual([]);
  });

  it('sorts packs alphabetically', () => {
    writeFileSync(join(tmpDir, 'out', 'zebra.json'), JSON.stringify(['z']));
    writeFileSync(join(tmpDir, 'out', 'alpha.json'), JSON.stringify(['a']));
    const packs = discoverStaticPacks(tmpDir);
    expect(packs[0].name).toBe('Alpha');
    expect(packs[1].name).toBe('Zebra');
  });
});

describe('getStaticPackByPath', () => {
  it('returns pack for matching path', () => {
    writeFileSync(join(tmpDir, 'out', 'my-pack.json'), JSON.stringify(['hello']));
    const pack = getStaticPackByPath('out/my-pack.json', tmpDir);
    expect(pack).toBeDefined();
    expect(pack?.name).toBe('My Pack');
  });

  it('returns undefined for non-matching path', () => {
    writeFileSync(join(tmpDir, 'out', 'my-pack.json'), JSON.stringify(['hello']));
    expect(getStaticPackByPath('out/nonexistent.json', tmpDir)).toBeUndefined();
  });
});
