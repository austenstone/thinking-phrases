import type { ArticleItem, PhraseSource, WeatherSeverity } from '../core/types.js';
import { fetchJson, fetchUsZipLocation, logInfo, relativeTime, truncate } from '../core/utils.js';

interface NwsPointResponse {
  properties?: {
    relativeLocation?: {
      properties?: {
        city?: string;
        state?: string;
      };
    };
    forecast?: string;
    forecastHourly?: string;
    forecastZone?: string;
    county?: string;
  };
}

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

interface WeatherLookupContext {
  locationLabel: string;
  lookupUrl: string;
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

function trimTrailingPathSegment(value?: string): string | undefined {
  return value?.trim().replace(/\/+$/u, '').split('/').filter(Boolean).at(-1);
}

function buildLookupUrl(latitude: number, longitude: number): string {
  return `https://forecast.weather.gov/MapClick.php?lat=${latitude}&lon=${longitude}`;
}

function buildNoAlertsArticle(context: WeatherLookupContext): ArticleItem {
  return {
    type: 'article',
    id: `weather-alert:none:${context.locationLabel.toLowerCase()}`,
    source: 'Weather.gov',
    title: `No active alerts near ${context.locationLabel}`,
    displayPhrase: `Weather.gov — No active alerts near ${context.locationLabel}`,
    link: context.lookupUrl,
    content: `Lookup: ${context.lookupUrl}`,
    articleContent: `No active weather alerts are currently active near ${context.locationLabel}. Lookup: ${context.lookupUrl}`,
  };
}

export async function fetchWeatherAlertArticles(config: import('../core/types.js').Config): Promise<ArticleItem[]> {
  if (!config.weatherAlerts.enabled) {
    return [];
  }

  const params = new URLSearchParams();
  let lookupContext: WeatherLookupContext | undefined;
  if (config.weatherAlerts.zipCode?.trim()) {
    const zipLocation = await fetchUsZipLocation(config.weatherAlerts.zipCode);
    const pointUrl = `https://api.weather.gov/points/${zipLocation.latitude},${zipLocation.longitude}`;
    const pointPayload = await fetchJson<NwsPointResponse>(pointUrl, { accept: 'application/geo+json' });
    const relativeLocation = pointPayload.properties?.relativeLocation?.properties;
    const forecastZoneId = trimTrailingPathSegment(pointPayload.properties?.forecastZone);
    const countyZoneId = trimTrailingPathSegment(pointPayload.properties?.county);
    const locationLabel = [
      zipLocation.placeName || relativeLocation?.city?.trim(),
      zipLocation.stateAbbreviation || relativeLocation?.state?.trim(),
    ].filter(Boolean).join(', ');

    params.set('point', `${zipLocation.latitude},${zipLocation.longitude}`);
    lookupContext = {
      locationLabel: locationLabel || `${zipLocation.zipCode}`,
      lookupUrl: buildLookupUrl(zipLocation.latitude, zipLocation.longitude),
    };
    logInfo(
      config,
      `Resolved weather ZIP ${zipLocation.zipCode} to ${lookupContext.locationLabel} (${zipLocation.latitude}, ${zipLocation.longitude})${forecastZoneId ? ` • forecast zone ${forecastZoneId}` : ''}${countyZoneId ? ` • county ${countyZoneId}` : ''}`,
    );
  } else if (config.weatherAlerts.area?.trim()) {
    params.set('area', config.weatherAlerts.area.trim().toUpperCase());
    lookupContext = {
      locationLabel: config.weatherAlerts.area.trim().toUpperCase(),
      lookupUrl: `https://api.weather.gov/alerts/active?area=${encodeURIComponent(config.weatherAlerts.area.trim().toUpperCase())}`,
    };
  }

  const url = `https://api.weather.gov/alerts/active${params.toString() ? `?${params.toString()}` : ''}`;
  logInfo(config, `Fetching weather alerts from ${url}`);
  const payload = await fetchJson<NwsAlertsResponse>(url, { accept: 'application/geo+json' });
  const minimumRank = SEVERITY_RANK[config.weatherAlerts.minimumSeverity];

  const items = (payload.features ?? [])
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

  if (items.length === 0 && lookupContext) {
    logInfo(config, `No active weather alerts for ${lookupContext.locationLabel}. Lookup: ${lookupContext.lookupUrl}`);
    return [buildNoAlertsArticle(lookupContext)];
  }

  return items;
}

export const weatherAlertsSource: PhraseSource = {
  type: 'weather-alerts',
  isEnabled: config => config.weatherAlerts.enabled,
  fetch: fetchWeatherAlertArticles,
};