import { useState, useEffect } from "react";
import { MapPin, Search, CloudSun, Loader2, AlertCircle } from "lucide-react";
import { detectUserLocation } from "../utils/geolocation";
import { Capacitor } from "@capacitor/core";

interface IntroScreenProps {
  onLocationSelected: (lat: number, lng: number, cityName?: string, silent?: boolean, isManual?: boolean) => void;
  isLoading: boolean;
  initialMessage?: string | null;
}

interface SearchResult {
  name: string;
  lat: number;
  lng: number;
  rawName: string;
  subLabel?: string;
}

export default function IntroScreen({ onLocationSelected, isLoading, initialMessage }: IntroScreenProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(initialMessage || null);

  // Sync initialMessage if it changes
  useEffect(() => {
    if (initialMessage) {
      setError(initialMessage);
    }
  }, [initialMessage]);

  // Live search debouncing for high precision Polish location lookup
  useEffect(() => {
    const query = searchQuery.trim();
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      console.log(`🔍 [City Search] Query: "${query}" (Native Platform: ${Capacitor.isNativePlatform()})`);
      setError(null);
      setIsSearching(true);
      
      try {
        const normQuery = query.toLowerCase();
        const candidateList: Array<{
          name: string;
          lat: number;
          lng: number;
          rawName: string;
          subLabel?: string;
          isPoland: boolean;
          population: number;
          isExactMatch: boolean;
        }> = [];

        // 1. Query Open-Meteo Geocoding API with 3.5s timeout
        const omPromise = (async () => {
          try {
            const omGeoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=pl&format=json`;
            const omController = new AbortController();
            const omTimeout = setTimeout(() => omController.abort(), 3500);
            const omGeoRes = await fetch(omGeoUrl, { signal: omController.signal });
            clearTimeout(omTimeout);

            if (omGeoRes.ok) {
              const omGeoData = await omGeoRes.json();
              if (omGeoData.results && Array.isArray(omGeoData.results)) {
                return omGeoData.results;
              }
            }
          } catch (e) {
            console.warn("🔍 [City Search] Open-Meteo fetch notice:", e);
          }
          return [];
        })();

        // 2. Query Nominatim API with 3.5s timeout & Polish country priority
        const nomPromise = (async () => {
          try {
            const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=10&countrycodes=pl`;
            const nomController = new AbortController();
            const nomTimeout = setTimeout(() => nomController.abort(), 3500);
            const res = await fetch(nomUrl, {
              headers: {
                'Accept-Language': 'pl'
              },
              signal: nomController.signal
            });
            clearTimeout(nomTimeout);

            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data) && data.length > 0) {
                return data;
              }
            }
          } catch (e) {
            console.warn("🔍 [City Search] Nominatim fetch notice:", e);
          }
          return [];
        })();

        // Execute both concurrently
        const [omResults, nomResults] = await Promise.all([omPromise, nomPromise]);

        // Process Open-Meteo results
        for (const item of omResults) {
          const lat = Number(item.latitude);
          const lng = Number(item.longitude);
          if (isNaN(lat) || isNaN(lng)) continue;

          const adminParts: string[] = [];
          if (item.admin3 && item.admin3.toLowerCase() !== item.name.toLowerCase()) {
            adminParts.push(item.admin3.replace(/^Gmina\s+/i, 'gm. '));
          }
          if (item.admin2) {
            adminParts.push(item.admin2.replace(/^Powiat\s+/i, 'pow. '));
          }
          if (item.admin1) {
            const a1 = item.admin1.replace(/^Województwo\s+/i, 'woj. ');
            adminParts.push(a1.startsWith('woj.') ? a1 : `woj. ${a1}`);
          }

          const subLabel = adminParts.join(' • ');
          const displayName = subLabel ? `${item.name} (${subLabel})` : item.name;
          const countryCode = (item.country_code || '').toLowerCase();
          const inPoland = countryCode === 'pl' || (lat >= 48.0 && lat <= 56.0 && lng >= 13.0 && lng <= 25.5);
          const exact = item.name.toLowerCase() === normQuery;

          candidateList.push({
            name: displayName,
            lat,
            lng,
            rawName: item.name,
            subLabel,
            isPoland: inPoland,
            population: Number(item.population) || 0,
            isExactMatch: exact
          });
        }

        // Process Nominatim results
        for (const item of nomResults) {
          const lat = Number(item.lat);
          const lng = Number(item.lon);
          if (isNaN(lat) || isNaN(lng)) continue;

          const address = item.address || {};
          const mainLocality = address.village || address.town || address.city || address.hamlet || address.locality || address.suburb || item.display_name.split(',')[0].trim();

          const adminDetails: string[] = [];
          if (address.municipality && address.municipality.toLowerCase() !== mainLocality.toLowerCase()) {
            adminDetails.push(`gm. ${address.municipality.replace(/^gmina\s+/i, '')}`);
          }
          if (address.county) {
            adminDetails.push(`pow. ${address.county.replace(/^powiat\s+/i, '')}`);
          }
          if (address.state) {
            adminDetails.push(`woj. ${address.state.replace(/^województwo\s+/i, '')}`);
          }

          const subLabel = adminDetails.join(' • ');
          const displayName = subLabel ? `${mainLocality} (${subLabel})` : item.display_name;
          const inPoland = (address.country_code || '').toLowerCase() === 'pl' || (lat >= 48.0 && lat <= 56.0 && lng >= 13.0 && lng <= 25.5);
          const exact = mainLocality.toLowerCase() === normQuery;

          candidateList.push({
            name: displayName,
            lat,
            lng,
            rawName: mainLocality,
            subLabel,
            isPoland: inPoland,
            population: 0,
            isExactMatch: exact
          });
        }

        // Deduplicate items that are geographically close (< 4km) and share the same rawName
        const deduplicated: typeof candidateList = [];
        for (const cand of candidateList) {
          const alreadyExists = deduplicated.some(d => {
            const dist = Math.hypot(d.lat - cand.lat, d.lng - cand.lng);
            return dist < 0.04 && d.rawName.toLowerCase() === cand.rawName.toLowerCase();
          });
          if (!alreadyExists) {
            deduplicated.push(cand);
          }
        }

        // Sort results:
        // 1. Exact name match first
        // 2. Starts with search query next
        // 3. Poland locations preferred
        // 4. Higher population first
        deduplicated.sort((a, b) => {
          const aExact = a.isExactMatch ? 1 : 0;
          const bExact = b.isExactMatch ? 1 : 0;
          if (aExact !== bExact) return bExact - aExact;

          const aStarts = a.rawName.toLowerCase().startsWith(normQuery) ? 1 : 0;
          const bStarts = b.rawName.toLowerCase().startsWith(normQuery) ? 1 : 0;
          if (aStarts !== bStarts) return bStarts - aStarts;

          const aPL = a.isPoland ? 1 : 0;
          const bPL = b.isPoland ? 1 : 0;
          if (aPL !== bPL) return bPL - aPL;

          return b.population - a.population;
        });

        console.log("🔍 [City Search Diagnostic]", {
          query,
          candidates: candidateList.length,
          deduplicated: deduplicated.length,
          topMatch: deduplicated[0]?.name
        });

        if (deduplicated.length > 0) {
          setSearchResults(
            deduplicated.map(d => ({
              name: d.name,
              lat: d.lat,
              lng: d.lng,
              rawName: d.rawName,
              subLabel: d.subLabel
            }))
          );
        } else {
          setSearchResults([]);
        }
      } catch (err: any) {
        console.error("🔍 [City Search] Search failed with exception:", err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleGetGPSLocation = async () => {
    setError(null);
    setIsSearching(true);

    try {
      console.log("📍 [IntroScreen] User clicked GPS location button");
      const loc = await detectUserLocation({ timeoutMs: 10000, allowFallback: false });
      console.log("📍 [IntroScreen] Detected location:", loc);
      setIsSearching(false);
      onLocationSelected(loc.lat, loc.lng, loc.cityName, false, false);
    } catch (err: any) {
      console.warn("📍 [IntroScreen] Location detection error:", err);
      setIsSearching(false);
      setError(err?.message || "Lokalizacja GPS jest niedostępna lub została zablokowana. Wybierz miejscowość z listy lub wpisz w wyszukiwarce.");
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    console.log("🔍 [City Search] User selected result:", result);
    if (isNaN(result.lat) || isNaN(result.lng)) {
      console.error("🔍 [City Search] Selected result has invalid coordinates!", result);
      setError("Wybrana miejscowość posiada nieprawidłowe współrzędne.");
      return;
    }
    setSearchResults([]);
    setSearchQuery("");
    onLocationSelected(result.lat, result.lng, result.rawName || result.name, false, true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchResults.length > 0) {
      e.preventDefault();
      handleSelectResult(searchResults[0]);
    }
  };

  const popularPlaces = [
    { name: "Warszawa", lat: 52.2297, lng: 21.0122 },
    { name: "Kraków", lat: 50.0647, lng: 19.9450 },
    { name: "Gdańsk", lat: 54.3520, lng: 18.6466 },
    { name: "Wrocław", lat: 51.1100, lng: 17.0325 },
    { name: "Poznań", lat: 52.4064, lng: 16.9252 },
    { name: "Katowice", lat: 50.2649, lng: 19.0238 },
    { name: "Łódź", lat: 51.7592, lng: 19.4560 },
    { name: "Szczecin", lat: 53.4285, lng: 14.5528 },
    { name: "Lublin", lat: 51.2465, lng: 22.5684 },
    { name: "Toruń", lat: 53.0138, lng: 18.5984 },
    { name: "Zakopane", lat: 49.2992, lng: 19.9496 },
  ];

  const showLoading = isLoading || isSearching;

  return (
    <div className="flex-1 flex flex-col justify-between p-6 bg-gradient-to-b from-[#070e24] via-[#0d1c3e] to-[#080d22] min-h-full relative overflow-hidden text-slate-100 selection:bg-blue-500/30 selection:text-white">
      
      {/* Dynamic atmospheric glowing orbs */}
      <div className="absolute -top-24 -right-24 w-80 h-80 bg-blue-500/25 rounded-full blur-[110px] pointer-events-none"></div>
      <div className="absolute -bottom-24 -left-24 w-88 h-88 bg-cyan-500/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-indigo-500/15 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Upper Logo / Icon Section */}
      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-5 my-auto z-10">
        <div className="relative">
          <div className="absolute -inset-2 rounded-full bg-blue-500/20 opacity-60 blur-2xl animate-pulse"></div>
          <div className="relative bg-gradient-to-b from-white/[0.12] to-white/[0.04] p-6 rounded-[32px] border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-2xl">
            <CloudSun className="w-16 h-16 text-cyan-300 animate-bounce" style={{ animationDuration: "3.5s" }} />
          </div>
        </div>

        <div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white drop-shadow-md">
            Aura <span className="font-extralight text-cyan-300">Pogoda</span>
          </h1>
          <p className="text-slate-300 text-xs mt-2 max-w-[280px] mx-auto uppercase tracking-widest font-semibold opacity-80">
            Inteligentna prognoza pogody &bull; IMGW &bull; Aura AI
          </p>
        </div>
      </div>

      {/* Input / Action Area */}
      <div className="space-y-4 z-10 max-w-md mx-auto w-full">
        
        {/* Informative Alert / Error if GPS was unavailable */}
        {error && (
          <div className="flex items-start space-x-2.5 p-3.5 bg-amber-500/15 border border-amber-500/30 rounded-2xl text-amber-200 text-xs leading-relaxed backdrop-blur-md shadow-lg">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-300" />
            <div className="flex-1">
              <span className="font-semibold block text-amber-200 mb-0.5">Wybór lokalizacji:</span>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* GPS Button */}
        <button
          onClick={handleGetGPSLocation}
          disabled={showLoading}
          className="w-full flex items-center justify-center space-x-2 py-3.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold rounded-2xl shadow-xl shadow-blue-900/30 border border-white/20 active:scale-98 transition-all duration-150 disabled:opacity-50 text-sm cursor-pointer"
          id="btn-gps-location"
        >
          {showLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <MapPin className="w-5 h-5 text-cyan-200 animate-pulse" />
          )}
          <span>{showLoading ? "Pobieranie telemetrii..." : "Użyj mojej lokalizacji (GPS)"}</span>
        </button>

        {/* Divider */}
        <div className="flex items-center space-x-3 text-slate-400 text-[10px] uppercase tracking-widest py-0.5">
          <div className="flex-1 h-px bg-white/10"></div>
          <span>LUB WYBIERZ MIEJSCOWOŚĆ</span>
          <div className="flex-1 h-px bg-white/10"></div>
        </div>

        {/* Search Bar with Live Suggestions Dropdown */}
        <div className="relative">
          <div className="relative flex items-center">
            <input
              type="text"
              placeholder="Wpisz miejscowość, np. Warszawa, Lipno, Hel"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className="w-full py-3.5 pl-4 pr-12 bg-white/[0.08] hover:bg-white/[0.12] focus:bg-white/[0.14] border border-white/15 focus:border-cyan-400/60 rounded-2xl focus:outline-none text-white placeholder-slate-400 transition-all text-sm shadow-inner backdrop-blur-xl"
              id="input-city-search"
            />
            <div className="absolute right-3.5 text-slate-300">
              {isSearching ? (
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </div>
          </div>

          {/* Search Dropdown Results */}
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#0c1630]/95 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden z-50 max-h-64 overflow-y-auto divide-y divide-white/10">
              {searchResults.map((res, idx) => (
                <button
                  key={`${res.lat}-${res.lng}-${idx}`}
                  type="button"
                  onClick={() => handleSelectResult(res)}
                  className="w-full text-left px-4 py-3 text-xs text-slate-200 hover:bg-blue-600/40 hover:text-white flex items-start space-x-2.5 transition-colors cursor-pointer"
                >
                  <MapPin className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div className="flex flex-col text-left">
                    <span className="font-bold text-white text-xs sm:text-sm">{res.rawName}</span>
                    {res.subLabel && (
                      <span className="text-[11px] text-slate-300 font-medium leading-snug">{res.subLabel}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Popular Suggestion Pills */}
        <div className="space-y-2 pt-1">
          <p className="text-slate-400 text-[10px] uppercase tracking-widest font-bold pl-1">Szybki wybór miast w Polsce:</p>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
            {popularPlaces.map((place) => (
              <button
                key={place.name}
                type="button"
                onClick={() => onLocationSelected(place.lat, place.lng, place.name, false, true)}
                disabled={showLoading}
                className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.14] border border-white/12 rounded-full text-xs text-slate-200 hover:text-white active:scale-95 transition-all cursor-pointer backdrop-blur-md"
                id={`btn-quick-place-${place.name.replace(/\s+/g, '-')}`}
              >
                {place.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

