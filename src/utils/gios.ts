import { getDistanceKm } from "./distance";
import { smartFetch } from "./fetch";
import { cachedFetch, CACHE_TTLS } from "./cache";
import { Capacitor } from '@capacitor/core';

function getEaqiLabel(eaqi: number): string {
  if (eaqi <= 20) return "Bardzo dobry";
  if (eaqi <= 40) return "Dobry";
  if (eaqi <= 60) return "Umiarkowany";
  if (eaqi <= 80) return "Dostateczny";
  if (eaqi <= 100) return "Zły";
  return "Bardzo zły";
}

/**
 * Fallback air quality provider using Open-Meteo Air Quality API (EEA / CAMS model).
 * Has full CORS support (*), making it completely safe for browser/GitHub Pages usage.
 */
async function fetchOpenMeteoAirQuality(lat: number, lng: number) {
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone`;
    const res = await smartFetch(url, {}, 4000);
    if (!res.ok) return null;
    const data = await res.json();
    const curr = data?.current;
    if (!curr) return null;

    const eaqi = typeof curr.european_aqi === 'number' ? curr.european_aqi : 0;
    const aqiLabel = getEaqiLabel(eaqi);

    return {
      stationName: "Stacja tła / EEA",
      distanceKm: 0,
      aqi: aqiLabel,
      pm10: typeof curr.pm10 === 'number' ? Math.round(curr.pm10).toString() : undefined,
      pm25: typeof curr.pm2_5 === 'number' ? Math.round(curr.pm2_5).toString() : undefined,
      o3: typeof curr.ozone === 'number' ? Math.round(curr.ozone).toString() : undefined,
      no2: typeof curr.nitrogen_dioxide === 'number' ? Math.round(curr.nitrogen_dioxide).toString() : undefined,
      source: "Open-Meteo / Europejska Agencja Środowiska"
    };
  } catch {
    return null;
  }
}

export async function fetchNearestGiosAirQuality(userLat: number, userLng: number) {
  const cacheKey = `aqi_${userLat.toFixed(2)}_${userLng.toFixed(2)}`;
  return cachedFetch(cacheKey, async () => {
    // 1. If running in browser / Web (e.g. GitHub Pages)
    if (!Capacitor.isNativePlatform()) {
      const isGitHubPages = typeof window !== 'undefined' && (window.location.hostname.endsWith('github.io') || window.location.hostname === 'localhost' && !window.location.port);
      
      // Only attempt local proxy if NOT running on GitHub Pages (e.g. Cloud Run, VPS with Express backend)
      if (!isGitHubPages && typeof window !== 'undefined' && !window.location.hostname.endsWith('github.io')) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1500);
          const proxyRes = await fetch(`/api/gios/air-quality?lat=${userLat}&lng=${userLng}`, {
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (proxyRes.ok) {
            const proxyData = await proxyRes.json();
            if (proxyData && proxyData.stationName && proxyData.aqi !== "Brak danych") {
              return proxyData;
            }
          }
        } catch {
          // Expected on static hosting
        }
      }

      // On static web host (GitHub Pages), direct calls to api.gios.gov.pl are blocked by CORS.
      // Fetch high-fidelity Open-Meteo air quality to provide real PM and AQI data without console 404 or CORS errors.
      return await fetchOpenMeteoAirQuality(userLat, userLng);
    }

    // 2. If running on Native Platform (Capacitor Android/iOS)
    try {
      // Find all stations directly from GIOŚ API using native HTTP (bypasses browser CORS)
      const stationsRes = await smartFetch("https://api.gios.gov.pl/pjp-api/rest/station/findAll", {}, 5000);
      if (!stationsRes.ok) throw new Error("GIOŚ stations fetch not ok");
      const stations = await stationsRes.json();

      let nearest: any = null;
      let minDistance = Infinity;

      for (const s of stations) {
        const lat = parseFloat(s.gegrLat);
        const lng = parseFloat(s.gegrLon);
        if (isNaN(lat) || isNaN(lng)) continue;

        const dist = getDistanceKm(userLat, userLng, lat, lng);
        if (dist < minDistance) {
          minDistance = dist;
          nearest = { ...s, distanceKm: dist };
        }
      }

      if (!nearest) return await fetchOpenMeteoAirQuality(userLat, userLng);

      // Get AQI for the nearest station
      const aqiRes = await smartFetch(`https://api.gios.gov.pl/pjp-api/rest/aqindex/getIndex/${nearest.id}`, {}, 5000);
      if (!aqiRes.ok) return await fetchOpenMeteoAirQuality(userLat, userLng);
      const aqiData = await aqiRes.json();

      // Mapping GIOŚ levels to a readable string
      const aqiLabel = aqiData.stIndexLevel?.indexLevelName || "Brak danych";

      return {
        stationName: nearest.stationName,
        address: nearest.addressStreet,
        distanceKm: nearest.distanceKm,
        aqi: aqiLabel,
        pm10: aqiData.pm10IndexLevel?.indexLevelName,
        pm25: aqiData.pm25IndexLevel?.indexLevelName,
        o3: aqiData.o3IndexLevel?.indexLevelName,
        no2: aqiData.no2IndexLevel?.indexLevelName,
        source: "GIOŚ (Główny Inspektorat Ochrony Środowiska)"
      };
    } catch {
      // Fallback if native GIOŚ fails or is unreachable
      return await fetchOpenMeteoAirQuality(userLat, userLng);
    }
  }, CACHE_TTLS.AQI);
}

