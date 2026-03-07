import YahooFinance from 'yahoo-finance2';
import { formatStockPhrase as formatStockPhraseTemplate } from '../core/phraseFormats.js';
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

function formatMarketLabel(label?: string): string | undefined {
  switch (label) {
    case 'today':
      return '🟢';
    case 'close':
      return '🔒';
    case 'pre-market':
      return '🌅';
    case 'after-hours':
      return '🌙';
    default:
      return label;
  }
}

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
  const signedPercent = formatSignedPercent(item.changePercent);
  const formattedMarketLabel = formatMarketLabel(item.marketLabel);

  return truncate(
    formatStockPhraseTemplate({
      symbol: item.symbol,
      price: formatPrice(item.price, item.currency),
      change: signedPercent,
      market: config.stockQuotes.includeMarketState ? formattedMarketLabel : undefined,
    }, { template: config.phraseFormatting.templates?.stock }),
    config.phraseFormatting.maxLength,
  );
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
