/**
 * Central Weather & IMGW Telemetry API Service for Aura Pogoda
 * 100% Client-Side Multi-Model Forecast Engine & Direct IMGW Telemetry Integration.
 */

import { fetchNearestImgwStation } from '../utils/imgw';

export interface FetchWeatherOptions {
  lat: number;
  lng: number;
  isRefresh?: boolean;
  forceFresh?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Creates an AbortSignal linked to a timeout and an optional parent AbortSignal.
 */
function createLinkedTimeoutSignal(timeoutMs: number, parentSignal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Timeout after ${timeoutMs}ms`));
  }, timeoutMs);

  const onParentAbort = () => {
    clearTimeout(timer);
    controller.abort(parentSignal?.reason || new Error("Aborted by caller"));
  };

  if (parentSignal) {
    if (parentSignal.aborted) {
      clearTimeout(timer);
      controller.abort(parentSignal.reason);
    } else {
      parentSignal.addEventListener("abort", onParentAbort, { once: true });
    }
  }

  const cleanup = () => {
    clearTimeout(timer);
    if (parentSignal) {
      parentSignal.removeEventListener("abort", onParentAbort);
    }
  };

  return { signal: controller.signal, cleanup };
}

export interface WeatherApiResponse {
  serverPayload: any | null;
  omJson: any | null;
}

/**
 * Builds Open-Meteo API query with optional parameter depth and explicit model target.
 * Default model is 'gfs_seamless' to ensure true GFS global numerical model output (Point 2 & 4).
 */
export function buildOpenMeteoUrl(
  lat: number,
  lng: number,
  mode: 'full' | 'standard' | 'minimal' = 'full',
  model = 'gfs_seamless'
): string {
  const baseUrl = "https://api.open-meteo.com/v1/forecast";
  
  let currentParams = "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,uv_index";
  let hourlyParams = "temperature_2m,relative_humidity_2m,weather_code,precipitation_probability,wind_speed_10m,wind_gusts_10m,wind_direction_10m";
  let dailyParams = "temperature_2m_max,temperature_2m_min,weather_code,wind_speed_10m_max,wind_gusts_10m_max";
  let extraParams = "";

  if (mode === 'full' || mode === 'standard') {
    currentParams += ",precipitation,rain,showers,snowfall,cloud_cover,visibility";
    hourlyParams += ",apparent_temperature,precipitation,uv_index,cloud_cover";
    dailyParams += ",sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max";
  }

  if (mode === 'full') {
    currentParams += ",cloud_cover_low,cloud_cover_mid,cloud_cover_high,shortwave_radiation,direct_normal_irradiance";
    hourlyParams += ",pressure_msl,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,shortwave_radiation,evapotranspiration";
    dailyParams += ",apparent_temperature_max,apparent_temperature_min";
    extraParams += "&minutely_15=precipitation,precipitation_probability,rain,snowfall";
  }

  const modelParam = model ? `&models=${model}` : '';
  const cacheBuster = `&t=${Date.now()}`;
  return `${baseUrl}?latitude=${lat}&longitude=${lng}&current=${currentParams}${extraParams}&hourly=${hourlyParams}&daily=${dailyParams}&forecast_days=3&past_days=1&timezone=auto${modelParam}${cacheBuster}`;
}

/**
 * Builds separate Open-Meteo Land-Surface Model API query for soil profile layers.
 * Uses Open-Meteo's land-surface models to fetch raw unadulterated soil telemetry.
 */
export function buildSoilMeteoUrl(lat: number, lng: number): string {
  const baseUrl = "https://api.open-meteo.com/v1/forecast";
  const soilHourly = "soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm,soil_moisture_27_to_81cm,soil_temperature_0cm,soil_temperature_6cm,soil_temperature_18cm,soil_temperature_54cm";
  const soilCurrent = "soil_moisture_0_to_1cm,soil_temperature_0cm";
  const cacheBuster = `&t=${Date.now()}`;
  return `${baseUrl}?latitude=${lat}&longitude=${lng}&current=${soilCurrent}&hourly=${soilHourly}&forecast_days=3&past_days=1&timezone=auto${cacheBuster}`;
}

/**
 * Fetches fresh telemetry for the nearest IMGW station directly from IMGW public API
 */
export async function fetchFreshImgwStation(lat: number, lng: number): Promise<any | null> {
  try {
    const directStation = await fetchNearestImgwStation(lat, lng);
    if (directStation && typeof directStation.temp === 'number') {
      return directStation;
    }
  } catch (e) {
    console.warn("Direct IMGW station fetch error:", e);
  }
  return null;
}

// Module-level cache for IMGW station measurement timestamps to detect new reports
interface ImgwStationCacheEntry {
  stationName: string | null;
  measurementTime: string | null;
  fetchedAt: number;
  data: any;
}

const lastImgwReportCache = new Map<string, ImgwStationCacheEntry>();

/**
 * Determines whether an IMGW measurement time represents a newly published report.
 */
export function isNewImgwReport(
  previousMeasurementTime: string | null | undefined,
  currentMeasurementTime: string | null | undefined
): { isNewReport: boolean; changeStatus: 'NEW' | 'IDENTICAL' | 'OLDER' | 'INITIAL' } {
  if (!currentMeasurementTime || !previousMeasurementTime) {
    return { isNewReport: false, changeStatus: 'INITIAL' };
  }
  const currTrim = currentMeasurementTime.trim();
  const prevTrim = previousMeasurementTime.trim();
  if (currTrim === prevTrim) {
    return { isNewReport: false, changeStatus: 'IDENTICAL' };
  }
  return { isNewReport: true, changeStatus: 'NEW' };
}

/**
 * Central 100% Client-Side Fetcher for combined multi-model forecast and IMGW station telemetry.
 */
export async function fetchWeatherData(options: FetchWeatherOptions): Promise<WeatherApiResponse> {
  const { lat, lng, timeoutMs = 8000, signal: parentSignal } = options;
  const HARD_TIMEOUT_MS = timeoutMs;
  const ts = Date.now();

  const primaryUrl = buildOpenMeteoUrl(lat, lng, 'full', 'gfs_seamless');
  const soilUrl = buildSoilMeteoUrl(lat, lng);
  const ecmwfUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,cloud_cover&models=ecmwf_ifs025&t=${ts}`;
  const iconUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,cloud_cover&models=icon_eu&t=${ts}`;

  // 1. Inicjalizacja wszystkich zapytań RÓWNOLEGLE (Zero-latency parallel execution)
  // GFS Seamless (Globalny model bazowy ze strukturą atmosferyczną/godzinną/dzienną)
  const gfsLinked = createLinkedTimeoutSignal(HARD_TIMEOUT_MS, parentSignal);
  const gfsPromise = (async () => {
    try {
      const res = await fetch(primaryUrl, { signal: gfsLinked.signal });
      if (res && res.ok) {
        return await res.json();
      }
    } catch (err) {
      try {
        const fallbackUrl = buildOpenMeteoUrl(lat, lng, 'standard', 'gfs_seamless');
        const res2 = await fetch(fallbackUrl, { signal: gfsLinked.signal });
        if (res2 && res2.ok) {
          return await res2.json();
        }
      } catch (e2) {
        // ignore
      }
    } finally {
      gfsLinked.cleanup();
    }
    return null;
  })();

  // Dedykowany strumień glebowy (Niezależny model powierzchniowy Open-Meteo Land Surface)
  const soilLinked = createLinkedTimeoutSignal(HARD_TIMEOUT_MS, parentSignal);
  const soilPromise = (async () => {
    try {
      const res = await fetch(soilUrl, { signal: soilLinked.signal });
      if (res && res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn("Dedicated soil stream fetch warning:", e);
    } finally {
      soilLinked.cleanup();
    }
    return null;
  })();

  // ECMWF IFS (waga 50%)
  const ecmwfLinked = createLinkedTimeoutSignal(HARD_TIMEOUT_MS, parentSignal);
  const ecmwfPromise = (async () => {
    try {
      const res = await fetch(ecmwfUrl, { signal: ecmwfLinked.signal });
      if (res && res.ok) {
        const eData = await res.json();
        if (typeof eData?.current?.temperature_2m === 'number') {
          return eData.current.temperature_2m as number;
        }
      }
    } catch (e) {
      // timeout lub błąd sieci
    } finally {
      ecmwfLinked.cleanup();
    }
    return null;
  })();

  // DWD ICON-EU (waga 30%)
  const iconLinked = createLinkedTimeoutSignal(HARD_TIMEOUT_MS, parentSignal);
  const iconPromise = (async () => {
    try {
      const res = await fetch(iconUrl, { signal: iconLinked.signal });
      if (res && res.ok) {
        const iData = await res.json();
        if (typeof iData?.current?.temperature_2m === 'number') {
          return iData.current.temperature_2m as number;
        }
      }
    } catch (e) {
      // timeout lub błąd sieci
    } finally {
      iconLinked.cleanup();
    }
    return null;
  })();

  // IMGW telemetria bezpośrednia
  const imgwPromise = (async () => {
    try {
      return await fetchNearestImgwStation(lat, lng);
    } catch (e) {
      console.warn("Direct IMGW station fetch warning:", e);
      return null;
    }
  })();

  // Równoległe oczekiwanie na wszystkie modele, dedykowany strumień glebowy i telemetrię
  const [omJson, soilJson, ecmwfTemp, iconTemp, imgwStation] = await Promise.all([
    gfsPromise,
    soilPromise,
    ecmwfPromise,
    iconPromise,
    imgwPromise
  ]);

  if (!omJson) {
    return { serverPayload: null, omJson: null };
  }

  // Bezpieczna integracja dedykowanego strumienia glebowego bez wpływu na parametry atmosferyczne
  if (soilJson) {
    if (soilJson.hourly && typeof soilJson.hourly === 'object') {
      if (!omJson.hourly) omJson.hourly = {};
      const soilLayerKeys = [
        'soil_moisture_0_to_1cm',
        'soil_moisture_1_to_3cm',
        'soil_moisture_3_to_9cm',
        'soil_moisture_9_to_27cm',
        'soil_moisture_27_to_81cm',
        'soil_temperature_0cm',
        'soil_temperature_6cm',
        'soil_temperature_18cm',
        'soil_temperature_54cm'
      ];
      for (const key of soilLayerKeys) {
        if (Array.isArray(soilJson.hourly[key])) {
          omJson.hourly[key] = soilJson.hourly[key];
        }
      }
    }
    if (soilJson.current && typeof soilJson.current === 'object') {
      if (!omJson.current) omJson.current = {};
      if (typeof soilJson.current.soil_moisture_0_to_1cm === 'number') {
        omJson.current.soil_moisture_0_to_1cm = soilJson.current.soil_moisture_0_to_1cm;
      }
      if (typeof soilJson.current.soil_temperature_0cm === 'number') {
        omJson.current.soil_temperature_0cm = soilJson.current.soil_temperature_0cm;
      }
    }
  }

  const gfsTemp: number | null = typeof omJson.current?.temperature_2m === 'number' ? omJson.current.temperature_2m : null;

  const activeServers: string[] = [];
  if (gfsTemp !== null) activeServers.push("GFS Seamless (Global)");
  if (ecmwfTemp !== null) activeServers.push("ECMWF IFS (Europe)");
  if (iconTemp !== null) activeServers.push("DWD ICON-EU (Środk. Europa)");

  /**
   * ARCHITECTURAL NOTE:
   * Pure Numerical Forecast Multi-model Weighted Consensus Engine:
   * Base Weights: ECMWF_IFS 50%, DWD_ICON_EU 30%, GFS_SEAMLESS 20%.
   * 
   * Dynamic Renormalization: Missing or failed model queries (po HARD TIMEOUT 8s) są wykluczane,
   * a wagi pozostałych aktywnych modeli renormalizowane do 100%.
   */
  const candidateSources: {
    name: string;
    label: string;
    temp: number | null;
    baseWeight: number;
  }[] = [
    {
      name: "ECMWF_IFS",
      label: "ECMWF IFS (Europe)",
      temp: typeof ecmwfTemp === 'number' && !isNaN(ecmwfTemp) ? ecmwfTemp : null,
      baseWeight: 0.50
    },
    {
      name: "DWD_ICON_EU",
      label: "DWD ICON-EU (Środk. Europa)",
      temp: typeof iconTemp === 'number' && !isNaN(iconTemp) ? iconTemp : null,
      baseWeight: 0.30
    },
    {
      name: "GFS_SEAMLESS",
      label: "GFS Seamless (Global)",
      temp: typeof gfsTemp === 'number' && !isNaN(gfsTemp) ? gfsTemp : null,
      baseWeight: 0.20
    }
  ];

  const activeSources = candidateSources.filter(s => s.temp !== null);
  const missingSources = candidateSources.filter(s => s.temp === null);
  const sumBaseWeights = activeSources.reduce((acc, s) => acc + s.baseWeight, 0);

  const isFullConsensus = activeSources.length === 3;
  const quality: 'FULL' | 'PARTIAL' = isFullConsensus ? 'FULL' : 'PARTIAL';

  let consensusTemp: number | null = null;
  const appliedFilters: string[] = [];

  if (activeSources.length > 0 && sumBaseWeights > 0) {
    let weightedSum = 0;
    for (const src of activeSources) {
      const normWeight = src.baseWeight / sumBaseWeights;
      const pct = Math.round(normWeight * 100);
      appliedFilters.push(`${src.name} (${pct}%)`);
      weightedSum += src.temp! * normWeight;
    }
    consensusTemp = Number(weightedSum.toFixed(1));
  } else {
    consensusTemp = gfsTemp;
    appliedFilters.push("GFS_SEAMLESS (100%)");
  }

  if (omJson.current && consensusTemp !== null) {
    omJson.current.temperature_2m = consensusTemp;
  }

  const consensusMeta = {
    quality,
    isFullConsensus,
    activeModels: activeSources.map(s => s.name),
    missingModels: missingSources.map(s => s.name),
    modelsCount: `${activeSources.length}/3`,
    rawConsensusTemp: consensusTemp,
    timestamp: ts,
    sources: candidateSources.map(s => ({
      name: s.name,
      label: s.label,
      temp: s.temp,
      baseWeight: s.baseWeight,
      effectiveWeightPct: s.temp !== null && sumBaseWeights > 0 ? Math.round((s.baseWeight / sumBaseWeights) * 100) : 0,
      status: (s.temp !== null ? 'SUCCESS' : 'TIMEOUT/ERROR') as 'SUCCESS' | 'TIMEOUT/ERROR'
    }))
  };

  // Compute source-specific freshness metadata
  const omAgeSeconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  const omStatus: 'FRESH' | 'STALE' | 'ERROR' = omJson ? (omAgeSeconds < 180 ? 'FRESH' : 'STALE') : 'ERROR';
  const omForecastTimestamp = omJson?.current?.time || undefined;

  const geoKey = `${lat.toFixed(2)}_${lng.toFixed(2)}`;
  const cachedImgwEntry = lastImgwReportCache.get(geoKey);
  const currentImgwMeasurementTime = (imgwStation as any)?.measurementTimeIso || (imgwStation as any)?.rawMeasurementTime || imgwStation?.measurementTime || null;
  const reportComparison = isNewImgwReport(cachedImgwEntry?.measurementTime, currentImgwMeasurementTime);

  if (imgwStation && currentImgwMeasurementTime) {
    lastImgwReportCache.set(geoKey, {
      stationName: imgwStation.stationName || null,
      measurementTime: currentImgwMeasurementTime,
      fetchedAt: Date.now(),
      data: imgwStation
    });
  }

  const freshnessMetadata = {
    omFetchTimestamp: ts,
    omAgeSeconds,
    omStatus,
    omForecastTimestamp,
    imgwMeasurementTime: currentImgwMeasurementTime || undefined,
    previousImgwMeasurementTime: cachedImgwEntry?.measurementTime || undefined,
    imgwFetchTimestamp: Date.now(),
    imgwReportAgeMinutes: null,
    imgwFreshnessStatus: 'FRESH',
    hasNewImgwReport: reportComparison.isNewReport,
    imgwReportChangeStatus: reportComparison.changeStatus
  };

  const serverPayload = {
    weather: omJson,
    current: omJson.current,
    hourly: omJson.hourly,
    daily: omJson.daily,
    imgwStation,
    freshnessMetadata,
    activeServers,
    consensusMeta,
    fusion_metadata: {
      applied_filters: appliedFilters,
      candidateSources: activeSources.map(s => ({
        name: s.name,
        temp: s.temp,
        weightPct: Math.round((s.baseWeight / sumBaseWeights) * 100)
      }))
    }
  };

  return { serverPayload, omJson };
}
