import { describe, it, expect } from 'vitest';
import { buildStockPhrase, fetchStockItems, stockSource } from '../src/sources/stocks.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import type { Config, StockItem } from '../src/core/types.js';

describe('buildStockPhrase', () => {
  const baseItem: StockItem = {
    type: 'stock',
    id: 'MSFT',
    symbol: 'MSFT',
    price: 420.50,
    currency: 'USD',
    changePercent: 1.25,
    marketLabel: 'today',
  };

  it('includes symbol and price', () => {
    const phrase = buildStockPhrase(baseItem, DEFAULT_CONFIG);
    expect(phrase).toContain('MSFT');
    expect(phrase).toContain('$420.50');
  });

  it('includes change percent with arrow', () => {
    const phrase = buildStockPhrase(baseItem, DEFAULT_CONFIG);
    expect(phrase).toContain('▲ 1.25%');
  });

  it('includes market state emoji when enabled', () => {
    const phrase = buildStockPhrase(baseItem, DEFAULT_CONFIG);
    expect(phrase).toContain('🟢');
  });

  it('omits market state when disabled', () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      stockQuotes: { ...DEFAULT_CONFIG.stockQuotes, includeMarketState: false },
    };
    const phrase = buildStockPhrase(baseItem, config);
    expect(phrase).not.toContain('🟢');
  });

  it('shows lock emoji for closed market', () => {
    const item: StockItem = { ...baseItem, marketLabel: 'close' };
    const phrase = buildStockPhrase(item, DEFAULT_CONFIG);
    expect(phrase).toContain('🔒');
  });

  it('shows moon emoji for after-hours', () => {
    const item: StockItem = { ...baseItem, marketLabel: 'after-hours' };
    const phrase = buildStockPhrase(item, DEFAULT_CONFIG);
    expect(phrase).toContain('🌙');
  });

  it('shows sunrise emoji for pre-market', () => {
    const item: StockItem = { ...baseItem, marketLabel: 'pre-market' };
    const phrase = buildStockPhrase(item, DEFAULT_CONFIG);
    expect(phrase).toContain('🌅');
  });

  it('truncates to maxLength', () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      phraseFormatting: { ...DEFAULT_CONFIG.phraseFormatting, maxLength: 20 },
    };
    const phrase = buildStockPhrase(baseItem, config);
    expect(phrase.length).toBeLessThanOrEqual(20);
  });

  it('handles negative change', () => {
    const item: StockItem = { ...baseItem, changePercent: -3.5 };
    const phrase = buildStockPhrase(item, DEFAULT_CONFIG);
    expect(phrase).toContain('▼ 3.50%');
  });
});

// ── stockSource.isEnabled ────────────────────────────────────────────
describe('stockSource.isEnabled', () => {
  it('returns false by default', () => {
    expect(stockSource.isEnabled(DEFAULT_CONFIG)).toBe(false);
  });

  it('returns true when enabled', () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      stockQuotes: { ...DEFAULT_CONFIG.stockQuotes, enabled: true },
    };
    expect(stockSource.isEnabled(config)).toBe(true);
  });
});

// ── fetchStockItems ──────────────────────────────────────────────────
describe('fetchStockItems', () => {
  it('returns empty when disabled', async () => {
    const result = await fetchStockItems(DEFAULT_CONFIG);
    expect(result).toEqual([]);
  });

  it('returns empty when enabled but no symbols', async () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      stockQuotes: { ...DEFAULT_CONFIG.stockQuotes, enabled: true, symbols: [] },
    };
    const result = await fetchStockItems(config);
    expect(result).toEqual([]);
  });
});
