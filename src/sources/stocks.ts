import YahooFinance from 'yahoo-finance2';
import type { Config, PhraseSource, StockItem } from '../core/types.js';
import { dedupePhrases, formatPrice, formatSignedPercent, logInfo, normalizeSymbols, truncate } from '../core/utils.js';

interface StockQuoteSnapshot {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  postMarketPrice?: number;
  postMarketChangePercent?: number;
  preMarketPrice?: number;
  preMarketChangePercent?: number;
  currency?: string;
  marketState?: string;
}

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

function getMarketPriceDetails(quote: StockQuoteSnapshot): {
  label?: string;
  price?: number;
  changePercent?: number;
} {
  switch (quote.marketState) {
    case 'PRE':
    case 'PREPRE':
      return {
        label: 'pre-market',
        price: quote.preMarketPrice ?? quote.regularMarketPrice,
        changePercent: quote.preMarketChangePercent ?? quote.regularMarketChangePercent,
      };
    case 'POST':
    case 'POSTPOST':
      return {
        label: 'after-hours',
        price: quote.postMarketPrice ?? quote.regularMarketPrice,
        changePercent: quote.postMarketChangePercent ?? quote.regularMarketChangePercent,
      };
    default:
      return {
        label: quote.marketState === 'CLOSED' ? 'close' : 'today',
        price: quote.regularMarketPrice,
        changePercent: quote.regularMarketChangePercent,
      };
  }
}

export function buildStockPhrase(item: StockItem, config: Config): string {
  const parts = [item.symbol, formatPrice(item.price, item.currency)];
  const signedPercent = formatSignedPercent(item.changePercent);
  if (signedPercent) {
    parts.push(signedPercent);
  }

  if (config.stockQuotes.includeMarketState && item.marketLabel) {
    parts.push(item.marketLabel);
  }

  return truncate(parts.join(' — '), config.phraseFormatting.maxLength);
}

export async function fetchStockItems(config: Config): Promise<StockItem[]> {
  if (!config.stockQuotes.enabled) {
    return [];
  }

  const symbols = normalizeSymbols(config.stockQuotes.symbols);
  if (symbols.length === 0) {
    return [];
  }

  logInfo(config, `Fetching live stock quotes for ${symbols.join(', ')}`);
  const fields = [
    'symbol',
    'currency',
    'marketState',
    'regularMarketPrice',
    'regularMarketChangePercent',
    'postMarketPrice',
    'postMarketChangePercent',
    'preMarketPrice',
    'preMarketChangePercent',
  ] as const;

  const rawQuotes = await yahooFinance.quote(symbols, { fields: [...fields] });
  const quotes = Array.isArray(rawQuotes)
    ? rawQuotes as StockQuoteSnapshot[]
    : Object.values(rawQuotes as Record<string, StockQuoteSnapshot>);

  const items = quotes.flatMap(quote => {
    const symbol = quote.symbol?.trim().toUpperCase();
    if (!symbol) {
      return [];
    }

    const details = getMarketPriceDetails(quote);
    if (!Number.isFinite(details.price)) {
      return [];
    }

    return [{
      type: 'stock' as const,
      id: symbol,
      symbol,
      price: details.price as number,
      currency: quote.currency,
      changePercent: details.changePercent,
      marketLabel: details.label,
    }];
  });

  logInfo(config, `Built ${items.length} stock items`);
  return items;
}

export const stockSource: PhraseSource = {
  type: 'stocks',
  isEnabled: config => config.stockQuotes.enabled,
  fetch: fetchStockItems,
};
