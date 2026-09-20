import React from "react";
import { motion } from "motion/react";
import { CloudRain, CloudOff, AlertTriangle, Clock, Droplets, ArrowRight } from "lucide-react";
import { WeatherResponse } from "../types";
import { checkStormStatus } from "../utils/weatherUtils";

interface RainAlertNowcastCardProps {
  data: WeatherResponse;
}

export default function RainAlertNowcastCard({ data }: RainAlertNowcastCardProps) {
  if (!data?.weather) return null;
  const { minutely_15, hourly, current, daily } = data.weather;

  // Helper ensuring ISO date-time comparison from Open-Meteo local timezone is consistent
  const parseOMTimeToMinutes = (timeStr: string): number => {
    const normalized = timeStr.length === 16 ? `${timeStr}:00Z` : (timeStr.endsWith("Z") ? timeStr : `${timeStr}Z`);
    const ms = Date.parse(normalized);
    return isNaN(ms) ? 0 : Math.floor(ms / 60000);
  };

  // Extract upcoming 2-3 hours of precipitation intervals
  let timelineItems: Array<{
    timeLabel: string;
    precipMm: number;
    probPercent: number | null;
    isNow?: boolean;
  }> = [];

  const currentTimeStr = current?.time || minutely_15?.time?.[0] || hourly?.time?.[0] || "";

  if (minutely_15 && minutely_15.time && minutely_15.time.length > 0) {
    let startIdx = -1;
    if (currentTimeStr) {
      const currentMin = parseOMTimeToMinutes(currentTimeStr);
      let minDiff = Infinity;
      minutely_15.time.forEach((t, i) => {
        const diff = Math.abs(parseOMTimeToMinutes(t) - currentMin);
        if (diff < minDiff) {
          minDiff = diff;
          startIdx = i;
        }
      });
    }
    if (startIdx < 0) startIdx = 0;

    for (let i = startIdx; i < Math.min(minutely_15.time.length, startIdx + 10); i++) {
      const itemTimeStr = minutely_15.time[i];
      const timeParts = itemTimeStr.split("T")[1]?.split(":") || [];
      const timeStr = timeParts.length >= 2 ? `${timeParts[0]}:${timeParts[1]}` : itemTimeStr.slice(11, 16);
      
      const precipMm = Number(minutely_15.precipitation?.[i] || 0);
      
      // Prawdopodobieństwo wyłącznie z odpowiadającego kroku hourly.precipitation_probability (bez sztucznych fallbacków)
      let prob: number | null = null;
      if (hourly?.precipitation_probability && Array.isArray(hourly.time)) {
        const hourTimePrefix = itemTimeStr.slice(0, 13);
        const matchedHourIdx = hourly.time.findIndex(ht => ht.startsWith(hourTimePrefix));
        if (
          matchedHourIdx >= 0 &&
          typeof hourly.precipitation_probability[matchedHourIdx] === "number" &&
          !isNaN(hourly.precipitation_probability[matchedHourIdx])
        ) {
          prob = Number(hourly.precipitation_probability[matchedHourIdx]);
        }
      }

      timelineItems.push({
        timeLabel: timeStr,
        precipMm: Math.max(0, precipMm),
        probPercent: prob,
        isNow: timelineItems.length === 0,
      });
    }
  }

  // Fallback to hourly if minutely_15 not available or empty
  if (timelineItems.length === 0 && hourly && hourly.time) {
    let startIdx = -1;
    if (currentTimeStr) {
      const currentMin = parseOMTimeToMinutes(currentTimeStr);
      let minDiff = Infinity;
      hourly.time.forEach((t, i) => {
        const diff = Math.abs(parseOMTimeToMinutes(t) - currentMin);
        if (diff < minDiff) {
          minDiff = diff;
          startIdx = i;
        }
      });
    }
    if (startIdx < 0) startIdx = 0;

    for (let i = startIdx; i < Math.min(hourly.time.length, startIdx + 8); i++) {
      const itemTimeStr = hourly.time[i];
      const timeParts = itemTimeStr.split("T")[1]?.split(":") || [];
      const timeStr = timeParts.length >= 2 ? `${timeParts[0]}:${timeParts[1]}` : itemTimeStr.slice(11, 16);
      const precipMm = Number(hourly.precipitation?.[i] || 0);
      const prob = (typeof hourly.precipitation_probability?.[i] === "number" && !isNaN(hourly.precipitation_probability[i]))
        ? Number(hourly.precipitation_probability[i])
        : null;

      timelineItems.push({
        timeLabel: timeStr,
        precipMm: Math.max(0, precipMm),
        probPercent: prob,
        isNow: timelineItems.length === 0,
      });
    }
  }

  // Determine storm and rain status & alert message
  const stormInfo = checkStormStatus(current, hourly);
  const isRainWeatherCode = (current?.weather_code !== undefined && [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(current.weather_code));
  const currentPrecipVal = Number(current?.precipitation || 0);
  const imgwPrecip10Min = typeof current?.imgw_precipitation_10min_mm === "number" ? current.imgw_precipitation_10min_mm : 0;
  const imgwTelemetryIsFresh = typeof current?.imgw_freshness_minutes === "number" && current.imgw_freshness_minutes < 30;
  const isCurrentlyRaining = currentPrecipVal > 0.05 || (imgwTelemetryIsFresh && imgwPrecip10Min > 0.05) || (timelineItems[0]?.precipMm || 0) > 0.05 || stormInfo.isStorm || isRainWeatherCode;
  
  const upcomingRainItem = timelineItems.find((item, idx) => idx > 0 && (item.precipMm > 0.05 || (item.probPercent !== null && item.probPercent >= 40)));
  const validPops = timelineItems.filter(t => t.probPercent !== null).map(t => t.probPercent as number);
  const maxTimelinePop = validPops.length > 0 ? Math.max(...validPops) : 0;
  const maxTimelinePrecip = timelineItems.length > 0 ? Math.max(...timelineItems.map(t => t.precipMm)) : 0;

  let alertBadgeText = "";
  let alertHeadline = "";
  let alertTheme: "dry" | "rainSoon" | "rainingNow" | "storm" = "dry";

  if (stormInfo.isStorm) {
    alertTheme = "storm";
    alertBadgeText = "⚡ WYKRYTO BURZĘ Z PIORUNAMI";
    alertHeadline = stormInfo.message;
  } else if (stormInfo.isStormRisk) {
    alertTheme = "rainSoon";
    alertBadgeText = "🌩️ RYZYKO BURZY Z PORYWAMI";
    alertHeadline = stormInfo.message;
  } else if (isCurrentlyRaining) {
    alertTheme = "rainingNow";
    const stoppingItem = timelineItems.find((item, idx) => idx > 0 && item.precipMm < 0.05 && (item.probPercent === null || item.probPercent < 20));
    alertBadgeText = "TRWAJĄ OPADY DESZCZU";
    alertHeadline = stoppingItem 
      ? `Możliwe osłabienie opadów ok. godz. ${stoppingItem.timeLabel}` 
      : "Aktywne opady deszczu / mżawki na stacji";
  } else if (upcomingRainItem) {
    alertTheme = "rainSoon";
    alertBadgeText = `OPADY OK. GODZ. ${upcomingRainItem.timeLabel}${upcomingRainItem.probPercent !== null ? ` (${upcomingRainItem.probPercent}%)` : ""}`;
    alertHeadline = `Możliwy opad deszczu (~${upcomingRainItem.precipMm > 0 ? upcomingRainItem.precipMm.toFixed(1) + ' mm' : 'przelotny'})`;
  } else if (maxTimelinePop >= 20 || maxTimelinePrecip > 0) {
    alertTheme = "dry";
    alertBadgeText = `SZANSA W NAJBLIŻSZYCH 2H: ${maxTimelinePop}%`;
    alertHeadline = `Niskie ryzyko opadu w najbliższych 2 godzinach (do ${maxTimelinePop}%)`;
  } else {
    alertTheme = "dry";
    alertBadgeText = "BRAK OPADÓW W NAJBLIŻSZYCH 2H";
    alertHeadline = "Brak opadów deszczu przez najbliższe 2 godziny";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-5 rounded-3xl border backdrop-blur-md shadow-xl relative overflow-hidden transition-all ${
        alertTheme === "storm"
          ? "bg-gradient-to-br from-purple-950/90 via-red-950/80 to-slate-900/90 border-red-500/50"
          : alertTheme === "rainingNow"
          ? "bg-gradient-to-br from-blue-950/90 via-slate-900/90 to-blue-900/80 border-blue-500/40"
          : alertTheme === "rainSoon"
          ? "bg-gradient-to-br from-amber-950/80 via-slate-900/90 to-slate-900/90 border-amber-500/40"
          : "bg-slate-900/80 border-slate-700/60"
      }`}
    >
      {/* Background ambient glow */}
      <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl opacity-20 bg-blue-500 pointer-events-none" />

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2.5">
          <div
            className={`p-2.5 rounded-2xl border ${
              alertTheme === "rainingNow"
                ? "bg-blue-500/20 border-blue-400/40 text-blue-300"
                : alertTheme === "rainSoon"
                ? "bg-amber-500/20 border-amber-400/40 text-amber-300"
                : "bg-emerald-500/20 border-emerald-400/40 text-emerald-300"
            }`}
          >
            {alertTheme === "dry" ? (
              <CloudOff className="w-5 h-5" />
            ) : (
              <CloudRain className="w-5 h-5 animate-bounce" />
            )}
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              Radar Opadowy Nowcast
            </span>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <span>Alert Opadowy</span>
            </h3>
          </div>
        </div>

        <span
          className={`text-[10px] font-black px-2.5 py-1 rounded-full border uppercase tracking-wider ${
            alertTheme === "rainingNow"
              ? "bg-blue-500/30 text-blue-200 border-blue-400/50"
              : alertTheme === "rainSoon"
              ? "bg-amber-500/30 text-amber-200 border-amber-400/50"
              : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
          }`}
        >
          {alertBadgeText}
        </span>
      </div>

      {/* Main Alert Message Banner */}
      <div className="p-3.5 rounded-2xl bg-black/30 border border-white/10 mb-4 flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="text-sm font-extrabold text-white">{alertHeadline}</p>
          <p className="text-[11px] text-slate-300 flex items-center space-x-1">
            <Clock className="w-3 h-3 text-cyan-400 inline" />
            <span>Prognoza minutowa na najbliższe 120 minut (Open-Meteo Radar)</span>
          </p>
        </div>
        {alertTheme === "rainSoon" && (
          <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 ml-2 animate-pulse" />
        )}
      </div>

      {/* Minutely / Hourly Precipitation Bar Chart Timeline */}
      {timelineItems.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 px-1">
            <span>Oś Czasu (Opad (mm / 15 min))</span>
            <span className="text-cyan-300/90 font-medium">Szansa opadu w okienku 15 min</span>
          </div>

          <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5 pt-1">
            {timelineItems.map((item, idx) => {
              const maxBarHeight = 36; // px
              const heightPx = Math.min(maxBarHeight, Math.max(6, item.precipMm * 15));
              const hasPrecip = item.precipMm > 0.05 || (item.probPercent !== null && item.probPercent >= 40);

              return (
                <div
                  key={idx}
                  className={`flex flex-col items-center p-1.5 rounded-xl border transition-all ${
                    item.isNow
                      ? "bg-blue-600/20 border-blue-400/50 shadow-md"
                      : hasPrecip
                      ? "bg-amber-500/10 border-amber-500/30"
                      : "bg-slate-800/40 border-slate-700/40"
                  }`}
                >
                  <span className="text-[9px] font-bold text-slate-300 mb-1">{item.timeLabel}</span>

                  <div className="w-full h-9 flex items-end justify-center my-0.5">
                    <div
                      style={{ height: `${heightPx}px` }}
                      className={`w-3 rounded-t-sm transition-all ${
                        hasPrecip
                          ? "bg-gradient-to-t from-blue-500 to-cyan-300"
                          : "bg-slate-700/50"
                      }`}
                    />
                  </div>

                  <div className="flex flex-col items-center mt-1">
                    <span
                      className={`text-[9px] font-mono font-bold ${
                        hasPrecip ? "text-cyan-300" : "text-slate-500"
                      }`}
                    >
                      {item.probPercent !== null ? `${item.probPercent}%` : "—"}
                    </span>
                    {item.precipMm > 0 && (
                      <span className="text-[8px] font-bold text-blue-300">
                        {item.precipMm < 0.1 ? item.precipMm.toFixed(2) : item.precipMm.toFixed(1)}mm
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}
