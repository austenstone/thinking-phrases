import { describe, it, expect, vi, afterEach } from 'vitest';
import { earthquakeSource } from '../src/sources/earthquakes.js';
import { weatherAlertsSource } from '../src/sources/weatherAlerts.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import type { ArticleItem, Config } from '../src/core/types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Earthquake source ────────────────────────────────────────────────
describe('earthquakeSource', () => {
  it('is disabled by default', () => {
    expect(earthquakeSource.isEnabled(DEFAULT_CONFIG)).toBe(false);
  });

  it('is enabled when config says so', () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      earthquakes: { ...DEFAULT_CONFIG.earthquakes, enabled: true },
    };
    expect(earthquakeSource.isEnabled(config)).toBe(true);
  });

  it('returns empty when disabled', async () => {
    const result = await earthquakeSource.fetch(DEFAULT_CONFIG);
    expect(result).toEqual([]);
  });

  it('fetches and parses USGS data', async () => {
    const mockGeoJson = {
      features: [
        {
          id: 'quake1',
          properties: {
            mag: 5.2,
            place: '10km NE of Somewhere',
            time: Date.now() - 3_600_000,
            title: 'M5.2 - 10km NE of Somewhere',
            url: 'https://earthquake.usgs.gov/earthquakes/eventpage/quake1',
            sig: 450,
          },
        },
        {
          id: 'quake2',
          properties: {
            mag: 4.8,
            place: '20km SW of Elsewhere',
            time: Date.now() - 7_200_000,
            title: 'M4.8 - 20km SW of Elsewhere',
            url: 'https://earthquake.usgs.gov/earthquakes/eventpage/quake2',
          },
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockGeoJson)),
    );

    const config: Config = {
      ...DEFAULT_CONFIG,
      earthquakes: {
        ...DEFAULT_CONFIG.earthquakes,
        enabled: true,
        minMagnitude: 4,
        limit: 5,
        windowHours: 24,
      },
    };

    const result = await earthquakeSource.fetch(config);
    expect(result).toHaveLength(2);
    const first = result[0] as ArticleItem;
    expect(first.title).toContain('M5.2');
    expect(first.source).toBe('USGS Earthquakes');
    expect(first.link).toContain('earthquake.usgs.gov');
  });
});

// ── Weather alerts source ────────────────────────────────────────────
describe('weatherAlertsSource', () => {
  it('is disabled by default', () => {
    expect(weatherAlertsSource.isEnabled(DEFAULT_CONFIG)).toBe(false);
  });

  it('is enabled when config says so', () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      weatherAlerts: { ...DEFAULT_CONFIG.weatherAlerts, enabled: true },
    };
    expect(weatherAlertsSource.isEnabled(config)).toBe(true);
  });

  it('returns empty when disabled', async () => {
    const result = await weatherAlertsSource.fetch(DEFAULT_CONFIG);
    expect(result).toEqual([]);
  });

  it('fetches and parses NWS alerts with area filter', async () => {
    const mockAlerts = {
      features: [
        {
          id: 'alert1',
          properties: {
            event: 'Tornado Warning',
            headline: 'Tornado Warning for Broward County',
            severity: 'Extreme',
            sent: new Date().toISOString(),
            areaDesc: 'Broward County, FL',
            web: 'https://alerts.weather.gov/alert1',
            description: 'Take shelter immediately',
          },
        },
        {
          id: 'alert2',
          properties: {
            event: 'Wind Advisory',
            headline: 'Wind Advisory for Miami-Dade',
            severity: 'Minor',
            sent: new Date().toISOString(),
            areaDesc: 'Miami-Dade County, FL',
          },
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockAlerts)),
    );

    const config: Config = {
      ...DEFAULT_CONFIG,
      weatherAlerts: {
        ...DEFAULT_CONFIG.weatherAlerts,
        enabled: true,
        area: 'FL',
        minimumSeverity: 'severe',
        limit: 10,
      },
    };

    const result = await weatherAlertsSource.fetch(config);
    // Only Extreme severity passes "severe" minimum
    expect(result).toHaveLength(1);
    const alert = result[0] as ArticleItem;
    expect(alert.title).toContain('Tornado Warning');
    expect(alert.source).toBe('NWS Alerts');
  });

  it('returns empty array when no results match', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ features: [] })),
    );

    const config: Config = {
      ...DEFAULT_CONFIG,
      weatherAlerts: {
        ...DEFAULT_CONFIG.weatherAlerts,
        enabled: true,
        area: 'FL',
        minimumSeverity: 'moderate',
        limit: 10,
      },
    };

    const result = await weatherAlertsSource.fetch(config);
    expect(result).toHaveLength(0);
  });
});
