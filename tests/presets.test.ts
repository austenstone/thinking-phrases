import { describe, it, expect } from 'vitest';
import { dynamicConfigPresets } from '../src/core/presets.js';

describe('dynamicConfigPresets', () => {
  it('exports an array of presets', () => {
    expect(Array.isArray(dynamicConfigPresets)).toBe(true);
    expect(dynamicConfigPresets.length).toBeGreaterThan(0);
  });

  it('each preset has required fields', () => {
    for (const preset of dynamicConfigPresets) {
      expect(preset.id).toBeTruthy();
      expect(preset.label).toBeTruthy();
      expect(preset.hint).toBeTruthy();
      expect(preset.config).toBeDefined();
    }
  });

  it('preset IDs are unique', () => {
    const ids = dynamicConfigPresets.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains known presets', () => {
    const ids = dynamicConfigPresets.map(p => p.id);
    expect(ids).toContain('dev-pulse');
    expect(ids).toContain('market-watch');
    expect(ids).toContain('world-signals');
  });
});
