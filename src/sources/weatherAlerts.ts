import type { ArticleItem, PhraseSource, WeatherSeverity } from '../core/types.js';
import { fetchJson, fetchUsZipLocation, logInfo, relativeTime, truncate } from '../core/utils.js';

interface NwsAlertFeature {
  id?: string;
  properties?: {
    areaDesc?: string;
    description?: string;
    event?: string;
    headline?: string;
    instruction?: string;
    onset?: string;
    sent?: string;
    severity?: string;
    web?: string;
  };
}

interface NwsAlertsResponse {
  features?: NwsAlertFeature[];
}

const SEVERITY_RANK: Record<WeatherSeverity, number> = {
  minor: 1,
  moderate: 2,
  severe: 3,
  extreme: 4,
};

function normalizeSeverity(value?: string): WeatherSeverity | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'minor' || normalized === 'moderate' || normalized === 'severe' || normalized === 'extreme') {
    return normalized;
  }

  return null;
}

function buildWeatherTitle(feature: NwsAlertFeature): string | undefined {
  const headline = feature.properties?.headline?.trim();
  if (headline) {
    return headline;
  }

  const event = feature.properties?.event?.trim();
  const area = feature.properties?.areaDesc?.trim();
  return [event, area].filter(Boolean).join(' — ') || undefined;
}

function buildWeatherContent(feature: NwsAlertFeature, maxLength: number): string | undefined {
  const pieces = [
    feature.properties?.severity?.trim(),
    feature.properties?.areaDesc?.trim(),
    feature.properties?.description?.trim(),
    feature.properties?.instruction?.trim(),
  ].filter(Boolean);

  return pieces.length > 0 ? truncate(pieces.join(' • '), maxLength) : undefined;
}

export async function fetchWeatherAlertArticles(config: import('../core/types.js').Config): Promise<ArticleItem[]> {
  if (!config.weatherAlerts.enabled) {
    return [];
  }

  const params = new URLSearchParams();
  if (config.weatherAlerts.zipCode?.trim()) {
    const zipLocation = await fetchUsZipLocation(config.weatherAlerts.zipCode);
    if (zipLocation.stateAbbreviation) {
      params.set('area', zipLocation.stateAbbreviation);
      logInfo(config, `Resolved weather ZIP ${zipLocation.zipCode} to ${zipLocation.stateAbbreviation}`);
    }
  } else if (config.weatherAlerts.area?.trim()) {
    params.set('area', config.weatherAlerts.area.trim().toUpperCase());
  }

  const url = `https://api.weather.gov/alerts/active${params.toString() ? `?${params.toString()}` : ''}`;
  logInfo(config, `Fetching weather alerts from ${url}`);
  const payload = await fetchJson<NwsAlertsResponse>(url, { accept: 'application/geo+json' });
  const minimumRank = SEVERITY_RANK[config.weatherAlerts.minimumSeverity];

  return (payload.features ?? [])
    .filter(feature => {
      const severity = normalizeSeverity(feature.properties?.severity);
      return severity ? SEVERITY_RANK[severity] >= minimumRank : false;
    })
    .slice(0, config.weatherAlerts.limit)
    .map((feature, index) => {
      const datetime = feature.properties?.sent ?? feature.properties?.onset;
      const content = buildWeatherContent(feature, config.githubModels.maxArticleContentLength);

      return {
        type: 'article' as const,
        id: feature.id ?? `weather-alert:${index}`,
        title: buildWeatherTitle(feature),
        link: feature.properties?.web?.trim() || undefined,
        source: 'NWS Alerts',
        datetime,
        time: relativeTime(datetime),
        content,
        articleContent: content,
      };
    })
    .filter(item => Boolean(item.title));
}

export const weatherAlertsSource: PhraseSource = {
  type: 'weather-alerts',
  isEnabled: config => config.weatherAlerts.enabled,
  fetch: fetchWeatherAlertArticles,
};