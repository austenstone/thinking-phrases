import type { ArticleItem, Config, PhraseSource, WeatherSeverity } from '../core/types.js';
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
    observationStations?: string;
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
  stationsUrl?: string;
}

interface NwsStationsResponse {
  features?: { properties?: { stationIdentifier?: string } }[];
}

interface NwsObservationResponse {
  properties?: {
    temperature?: { value?: number | null };
    textDescription?: string;
    windSpeed?: { value?: number | null };
    windDirection?: { value?: number | null };
    relativeHumidity?: { value?: number | null };
    timestamp?: string;
  };
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

function windDirectionLabel(degrees?: number | null): string | undefined {
  if (degrees === null || degrees === undefined || !Number.isFinite(degrees)) return undefined;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(degrees / 45) % 8];
}

function celsiusToFahrenheit(c: number): number {
  return Math.round(c * 9 / 5 + 32);
}

function metersPerSecToMph(ms: number): number {
  return Math.round(ms * 2.237);
}

async function fetchCurrentConditions(context: WeatherLookupContext, config: Config): Promise<ArticleItem | null> {
  if (!context.stationsUrl) return null;

  try {
    const stationsPayload = await fetchJson<NwsStationsResponse>(context.stationsUrl, { accept: 'application/geo+json' });
    const stationId = stationsPayload.features?.[0]?.properties?.stationIdentifier;
    if (!stationId) return null;

    const obsUrl = `https://api.weather.gov/stations/${stationId}/observations/latest`;
    const obs = await fetchJson<NwsObservationResponse>(obsUrl, { accept: 'application/geo+json' });
    const props = obs.properties;
    if (!props) return null;

    const tempC = props.temperature?.value;
    const tempF = tempC !== null && tempC !== undefined ? celsiusToFahrenheit(tempC) : undefined;
    const description = props.textDescription?.trim();
    const windMs = props.windSpeed?.value;
    const windMph = windMs !== null && windMs !== undefined ? metersPerSecToMph(windMs) : undefined;
    const windDir = windDirectionLabel(props.windDirection?.value);
    const humidity = props.relativeHumidity?.value;

    if (tempF === undefined && !description) return null;

    const conditionParts: string[] = [];
    if (tempF !== undefined) conditionParts.push(`${tempF}°F`);
    if (description) conditionParts.push(description);
    if (windMph !== undefined && windMph > 0) {
      conditionParts.push(`Wind ${windDir ?? ''} ${windMph} mph`.replace(/\s+/gu, ' ').trim());
    }
    if (humidity !== null && humidity !== undefined) {
      conditionParts.push(`Humidity ${Math.round(humidity)}%`);
    }

    const conditions = conditionParts.join(', ');
    const title = conditions;
    const displayPhrase = `${conditions} — ${context.locationLabel} — Weather.gov`;
    logInfo(config, `Current conditions: ${context.locationLabel}, ${conditions}`);

    return {
      type: 'article',
      id: `weather-conditions:${stationId}`,
      title,
      displayPhrase,
      link: context.lookupUrl,
      source: 'Weather.gov',
      content: title,
      articleContent: title,
      skipModelRewrite: true,
    };
  } catch {
    return null;
  }
}

export async function fetchWeatherAlertArticles(config: Config): Promise<ArticleItem[]> {
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
      stationsUrl: pointPayload.properties?.observationStations,
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

  // Always fetch current conditions when we have a ZIP-based location
  const conditionsArticle = lookupContext ? await fetchCurrentConditions(lookupContext, config) : null;

  if (items.length === 0 && lookupContext) {
    logInfo(config, `No active weather alerts for ${lookupContext.locationLabel}. Lookup: ${lookupContext.lookupUrl}`);
    return conditionsArticle ? [conditionsArticle] : [];
  }

  if (conditionsArticle) {
    return [conditionsArticle, ...items];
  }

  return items;
}

export const weatherAlertsSource: PhraseSource = {
  type: 'weather-alerts',
  isEnabled: config => config.weatherAlerts.enabled,
  fetch: fetchWeatherAlertArticles,
};