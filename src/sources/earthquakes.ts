import type { ArticleItem, PhraseSource } from '../core/types.js';
import { fetchJson, fetchUsZipLocation, logInfo, relativeTime } from '../core/utils.js';

interface UsgsFeature {
  id: string;
  properties?: {
    alert?: string | null;
    mag?: number | null;
    place?: string | null;
    sig?: number | null;
    time?: number | null;
    title?: string | null;
    tsunami?: number | null;
    type?: string | null;
    url?: string | null;
  };
}

interface UsgsGeoJson {
  features?: UsgsFeature[];
}

function buildEarthquakeTitle(feature: UsgsFeature): string | undefined {
  const magnitude = feature.properties?.mag;
  const place = feature.properties?.place?.trim();
  const prefix = Number.isFinite(magnitude) ? `M${(magnitude as number).toFixed(1)}` : undefined;
  return [prefix, place].filter(Boolean).join(' — ') || feature.properties?.title?.trim() || undefined;
}

function buildEarthquakeContent(feature: UsgsFeature): string | undefined {
  const parts = [
    typeof feature.properties?.sig === 'number' ? `significance ${feature.properties.sig}` : undefined,
    feature.properties?.alert ? `alert ${feature.properties.alert}` : undefined,
    feature.properties?.tsunami ? 'tsunami bulletin issued' : undefined,
    feature.properties?.type?.trim(),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' • ') : undefined;
}

export async function fetchEarthquakeArticles(config: import('../core/types.js').Config): Promise<ArticleItem[]> {
  if (!config.earthquakes.enabled) {
    return [];
  }

  const startTime = new Date(Date.now() - config.earthquakes.windowHours * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    format: 'geojson',
    orderby: config.earthquakes.orderBy,
    limit: String(config.earthquakes.limit),
    minmagnitude: String(config.earthquakes.minMagnitude),
    starttime: startTime,
  });

  let zipPlaceFilter: string | undefined;
  if (config.earthquakes.zipCode?.trim()) {
    const zipLocation = await fetchUsZipLocation(config.earthquakes.zipCode);
    params.set('latitude', String(zipLocation.latitude));
    params.set('longitude', String(zipLocation.longitude));
    params.set('maxradiuskm', String(config.earthquakes.radiusKm));
    zipPlaceFilter = `${zipLocation.placeName}, ${zipLocation.stateAbbreviation}`;
    logInfo(config, `Resolved earthquakes ZIP ${zipLocation.zipCode} to ${zipPlaceFilter}`);
  }

  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?${params.toString()}`;
  logInfo(config, `Fetching earthquakes from ${url}`);
  const payload = await fetchJson<UsgsGeoJson>(url);

  return (payload.features ?? [])
    .filter(feature => {
      if (config.earthquakes.zipCode?.trim()) {
        return true;
      }

      return !config.earthquakes.place || feature.properties?.place?.toLowerCase().includes(config.earthquakes.place.toLowerCase());
    })
    .map(feature => {
      const timestamp = feature.properties?.time ?? undefined;
      const datetime = timestamp ? new Date(timestamp).toISOString() : undefined;

      return {
        type: 'article' as const,
        id: `earthquake:${feature.id}`,
        title: buildEarthquakeTitle(feature),
        link: feature.properties?.url?.trim() || undefined,
        source: 'USGS Earthquakes',
        datetime,
        time: relativeTime(datetime),
        content: buildEarthquakeContent(feature),
        articleContent: buildEarthquakeContent(feature),
      };
    })
    .filter(item => Boolean(item.title));
}

export const earthquakeSource: PhraseSource = {
  type: 'earthquakes',
  isEnabled: config => config.earthquakes.enabled,
  fetch: fetchEarthquakeArticles,
};