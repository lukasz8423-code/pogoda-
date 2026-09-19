import React, { useState, useMemo } from "react";
import { Thermometer, CloudRain, Wind, TrendingUp, HelpCircle } from "lucide-react";
import AiWeatherIcon from "./AiWeatherIcon";
import { calculateOpticalCloudCover } from "../utils/weatherUtils";

export interface HourlyDataPoint {
  timeStr: string;
  hourLabel: string;
  temp: number | null;
  apparentTemp?: number | null;
  windSpeed?: number | null;
  windGusts?: number | null;
  code?: number;
  pop?: number;
  cloudCover?: number;
  precip?: number;
  isDay?: boolean;
}

interface HourlyChartProps {
  hourly?: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature?: number[];
    precipitation?: number[];
    precipitation_probability?: number[];
    wind_speed_10m?: number[];
    wind_gusts_10m?: number[];
    weather_code: number[];
    cloud_cover?: number[];
    cloud_cover_low?: number[];
    cloud_cover_mid?: number[];
    cloud_cover_high?: number[];
  };
  calibratedHours?: any[];
  tempBias?: number;
  currentIdx?: number;
}

function HourlyWeatherChartComponent({ hourly, calibratedHours, tempBias, currentIdx }: HourlyChartProps) {
  const [chartMode, setChartMode] = useState<"temperature" | "precipitation" | "wind">("temperature");

  const hoursData = useMemo(() => {
    // 1. If pre-calibrated hours are passed (guaranteeing 100% data consistency with horizontal timeline), use them!
    if (calibratedHours && Array.isArray(calibratedHours) && calibratedHours.length > 0) {
      return calibratedHours.map(item => {
        const isDay = typeof item.isDay === 'boolean'
          ? item.isDay
          : (new Date(item.timeStr).getHours() >= 6 && new Date(item.timeStr).getHours() < 20);

        return {
          hourLabel: item.hourLabel,
          temp: typeof item.temp === 'number' && !isNaN(item.temp) ? item.temp : null,
          apparent: typeof item.apparentTemp === 'number' && !isNaN(item.apparentTemp) ? item.apparentTemp : item.temp,
          precip: typeof item.precip === 'number' ? item.precip : 0,
          pop: typeof item.pop === 'number' ? item.pop : 0,
          wind: typeof item.windSpeed === 'number' ? item.windSpeed : 0,
          gusts: typeof item.windGusts === 'number' ? item.windGusts : item.windSpeed ?? 0,
          code: item.code ?? 0,
          cloud: typeof item.cloudCover === 'number' ? item.cloudCover : 0,
          isDay,
          timeStr: item.timeStr
        };
      });
    }

    // 2. Fallback: Parse from raw hourly object without any artificial numeric fallback (no fake 20°C!)
    if (!hourly || !hourly.time || !Array.isArray(hourly.time) || hourly.time.length === 0) {
      return [];
    }

    let startIndex = typeof currentIdx === 'number' && currentIdx >= 0 ? currentIdx : 0;
    if (startIndex < 0 || startIndex >= hourly.time.length) {
      const now = new Date();
      now.setMinutes(0, 0, 0);
      startIndex = hourly.time.findIndex(t => new Date(t).getTime() >= now.getTime());
      if (startIndex === -1) startIndex = 0;
    }

    return Array.from({ length: 24 }).map((_, i) => {
      const idx = startIndex + i;
      if (idx >= hourly.time.length) return null;
      const timeStr = hourly.time[idx];
      const hourLabel = new Date(timeStr).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
      
      const rawTemp = hourly.temperature_2m?.[idx];
      const temp = (typeof rawTemp === 'number' && !isNaN(rawTemp))
        ? (typeof tempBias === 'number' ? Number((rawTemp + tempBias).toFixed(1)) : rawTemp)
        : null; // Explicit null - NEVER substitute with 20 or any other fake number!

      const rawApparent = hourly.apparent_temperature?.[idx];
      const apparent = (typeof rawApparent === 'number' && !isNaN(rawApparent))
        ? (typeof tempBias === 'number' ? Number((rawApparent + tempBias).toFixed(1)) : rawApparent)
        : temp;

      const precip = typeof hourly.precipitation?.[idx] === 'number' ? hourly.precipitation[idx] : 0;
      const pop = typeof hourly.precipitation_probability?.[idx] === 'number' ? hourly.precipitation_probability[idx] : 0;
      const wind = typeof hourly.wind_speed_10m?.[idx] === 'number' ? hourly.wind_speed_10m[idx] : 0;
      const gusts = typeof hourly.wind_gusts_10m?.[idx] === 'number' ? hourly.wind_gusts_10m[idx] : wind;
      const code = hourly.weather_code?.[idx] ?? 0;
      const lowC = hourly.cloud_cover_low?.[idx];
      const midC = hourly.cloud_cover_mid?.[idx];
      const highC = hourly.cloud_cover_high?.[idx];
      const totalC = hourly.cloud_cover?.[idx];
      const cloud = calculateOpticalCloudCover(lowC, midC, highC, totalC);
      const isDay = new Date(timeStr).getHours() >= 6 && new Date(timeStr).getHours() < 20;

      return {
        hourLabel,
        temp,
        apparent,
        precip,
        pop,
        wind,
        gusts,
        code,
        cloud,
        isDay,
        timeStr
      };
    }).filter(item => item !== null) as Array<{
      hourLabel: string;
      temp: number | null;
      apparent: number | null;
      precip: number;
      pop: number;
      wind: number;
      gusts: number;
      code: number;
      cloud: number;
      isDay: boolean;
      timeStr: string;
    }>;
  }, [calibratedHours, hourly, tempBias, currentIdx]);

  if (hoursData.length === 0) return null;

  // Filter strictly valid numeric temperatures
  const validTemps = hoursData
    .map(d => d.temp)
    .filter((t): t is number => typeof t === 'number' && !isNaN(t));

  const validApparents = hoursData
    .map(d => d.apparent)
    .filter((t): t is number => typeof t === 'number' && !isNaN(t));

  const allValidTemps = [...validTemps, ...validApparents];
  const hasValidTemperatureData = validTemps.length > 0;

  const minTemp = allValidTemps.length > 0 ? Math.floor(Math.min(...allValidTemps) - 2) : 0;
  const maxTemp = allValidTemps.length > 0 ? Math.ceil(Math.max(...allValidTemps) + 2) : 30;
  const tempRange = Math.max(1, maxTemp - minTemp);

  const maxPrecip = Math.max(1, ...hoursData.map(d => d.precip || 0));
  const maxWind = Math.max(10, ...hoursData.map(d => Math.max(d.wind || 0, d.gusts || 0)));

  const totalPrecip24h = hoursData.reduce((acc, curr) => acc + (curr.precip || 0), 0);
  const maxPop24h = Math.max(0, ...hoursData.map(d => d.pop || 0));

  const getPrecipProbabilityLabel = (pop: number) => {
    if (pop < 15) {
      return { label: "Sucho", colorClass: "text-emerald-400", badgeBg: "bg-emerald-500/15 border-emerald-500/30" };
    } else if (pop < 40) {
      return { label: "Możliwy opad", colorClass: "text-amber-300", badgeBg: "bg-amber-500/15 border-amber-500/30" };
    } else if (pop < 70) {
      return { label: "Deszcz prawdopodobny", colorClass: "text-cyan-300", badgeBg: "bg-cyan-500/15 border-cyan-500/30" };
    } else {
      return { label: "Bardzo prawdopodobny", colorClass: "text-blue-300", badgeBg: "bg-blue-500/15 border-blue-500/30" };
    }
  };

  const overallPrecipInterpretation = getPrecipProbabilityLabel(maxPop24h);

  // SVG dimensions for curve chart
  const svgWidth = 960;
  const svgHeight = 160;
  const paddingX = 24;
  const paddingY = 24;
  const chartWidth = svgWidth - paddingX * 2;
  const chartHeight = svgHeight - paddingY * 2;

  // Generate SVG curve points
  const points = hoursData.map((d, i) => {
    const x = paddingX + (i / Math.max(1, hoursData.length - 1)) * chartWidth;
    const y = typeof d.temp === 'number'
      ? svgHeight - paddingY - ((d.temp - minTemp) / tempRange) * chartHeight
      : svgHeight / 2; // Midpoint for null values
    return {
      x,
      y,
      temp: d.temp,
      label: d.hourLabel,
      isNow: i === 0,
      precip: d.precip,
      pop: d.pop,
      hasTemp: typeof d.temp === 'number' && !isNaN(d.temp)
    };
  });

  // Smooth bezier curve generator for valid temperature points
  const createSmoothPath = (pts: Array<{ x: number; y: number; hasTemp: boolean }>) => {
    const validPts = pts.filter(p => p.hasTemp);
    if (validPts.length === 0) return "";
    if (validPts.length === 1) return `M ${validPts[0].x} ${validPts[0].y}`;

    let d = `M ${validPts[0].x} ${validPts[0].y}`;
    for (let i = 0; i < validPts.length - 1; i++) {
      const p0 = validPts[i === 0 ? 0 : i - 1];
      const p1 = validPts[i];
      const p2 = validPts[i + 1];
      const p3 = validPts[i + 2 < validPts.length ? i + 2 : i + 1];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  };

  const linePath = createSmoothPath(points);
  const validPoints = points.filter(p => p.hasTemp);
  const areaPath = validPoints.length > 0 && linePath
    ? `${linePath} L ${validPoints[validPoints.length - 1].x} ${svgHeight} L ${validPoints[0].x} ${svgHeight} Z`
    : "";

  return (
    <div className="max-w-4xl mx-auto my-8 p-5 sm:p-7 bg-gradient-to-b from-white/[0.09] via-white/[0.05] to-white/[0.02] border border-white/20 rounded-[34px] backdrop-blur-md shadow-[0_16px_40px_-10px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.25)] contain-paint">
      {/* Header with Visual Hierarchy */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/10">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/20 border border-cyan-400/35 text-cyan-300 shadow-inner">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs uppercase tracking-widest text-slate-100 font-black flex items-center gap-2">
                Wykres Dynamiki Pogody (24h)
              </h3>
              <span className="text-[11px] text-cyan-300/80 font-medium">Temperatura jako główna warstwa z nakładką opadów i wiatru</span>
            </div>
          </div>
        </div>

        {/* Mode Switcher Buttons */}
        <div className="flex items-center space-x-1.5 p-1.5 bg-black/30 border border-white/12 rounded-2xl w-full sm:w-auto shadow-inner">
          <button
            onClick={() => setChartMode("temperature")}
            className={`flex-1 sm:flex-none py-2 px-3.5 rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
              chartMode === "temperature"
                ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-500/40 border border-cyan-300/50 scale-[1.02]"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Thermometer className="w-3.5 h-3.5 text-cyan-300" />
            <span>Krzywa Temp.</span>
          </button>

          <button
            onClick={() => setChartMode("precipitation")}
            className={`flex-1 sm:flex-none py-2 px-3.5 rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
              chartMode === "precipitation"
                ? "bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-lg shadow-cyan-500/40 border border-teal-300/50 scale-[1.02]"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <CloudRain className="w-3.5 h-3.5 text-teal-300" />
            <span>Słupki Opadów</span>
          </button>

          <button
            onClick={() => setChartMode("wind")}
            className={`flex-1 sm:flex-none py-2 px-3.5 rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
              chartMode === "wind"
                ? "bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-lg shadow-teal-500/40 border border-emerald-300/50 scale-[1.02]"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Wind className="w-3.5 h-3.5 text-emerald-300" />
            <span>Wiatr & Porywy</span>
          </button>
        </div>
      </div>

      {/* 1. TEMPERATURE PRIMARY CURVE LAYER WITH PRECIPITATION UNDERLAY */}
      {chartMode === "temperature" && (
        <div className="relative pt-4 pb-2">
          {/* Scrollable Container */}
          <div className="overflow-x-auto no-scrollbar touch-pan-x -mx-2 px-2">
            <div className="min-w-[860px]">
              {/* SVG Curve Chart */}
              <div className="relative h-44 w-full">
                {hasValidTemperatureData ? (
                  <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="tempAreaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                        <stop offset="50%" stopColor="#2563eb" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.0" />
                      </linearGradient>
                      <linearGradient id="tempLineGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="50%" stopColor="#60a5fa" />
                        <stop offset="100%" stopColor="#a78bfa" />
                      </linearGradient>
                      <linearGradient id="precipUnderlayGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="#0891b2" stopOpacity="0.1" />
                      </linearGradient>
                    </defs>

                    {/* Precipitation Underlay Bars in Temperature Mode */}
                    {points.map((p, i) => {
                      const hData = hoursData[i];
                      if (!hData || hData.precip <= 0) return null;
                      const barH = Math.min(60, (hData.precip / maxPrecip) * 60 + 10);
                      const barW = 14;
                      return (
                        <rect
                          key={`precip-underlay-${i}`}
                          x={p.x - barW / 2}
                          y={svgHeight - barH}
                          width={barW}
                          height={barH}
                          rx="5"
                          fill="url(#precipUnderlayGradient)"
                        />
                      );
                    })}

                    {/* Grid Lines */}
                    <line x1={paddingX} y1={paddingY} x2={svgWidth - paddingX} y2={paddingY} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
                    <line x1={paddingX} y1={svgHeight / 2} x2={svgWidth - paddingX} y2={svgHeight / 2} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
                    <line x1={paddingX} y1={svgHeight - paddingY} x2={svgWidth - paddingX} y2={svgHeight - paddingY} stroke="rgba(255,255,255,0.1)" />

                    {/* Area fill */}
                    {areaPath && <path d={areaPath} fill="url(#tempAreaGradient)" />}

                    {/* Main Line */}
                    {linePath && (
                      <path
                        d={linePath}
                        fill="none"
                        stroke="url(#tempLineGradient)"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="filter drop-shadow-[0_4px_10px_rgba(56,189,248,0.5)]"
                      />
                    )}

                    {/* Data Points with Values */}
                    {points.map((p, i) => (
                      <g key={i} className="group cursor-pointer">
                        {/* Vertical guide line on hover */}
                        <line
                          x1={p.x}
                          y1={p.hasTemp ? p.y : svgHeight / 2}
                          x2={p.x}
                          y2={svgHeight}
                          stroke="rgba(255,255,255,0.15)"
                          strokeDasharray="2 2"
                        />

                        {p.hasTemp ? (
                          <>
                            {/* Outer Glow Ring for Current Hour */}
                            {p.isNow && (
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r="9"
                                fill="none"
                                stroke="#38bdf8"
                                strokeWidth="2"
                                className="animate-ping opacity-75"
                              />
                            )}

                            {/* Point Node */}
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={p.isNow ? "6" : "4.5"}
                              fill={p.isNow ? "#ffffff" : "#38bdf8"}
                              stroke="#0f172a"
                              strokeWidth="2"
                              className="transition-transform group-hover:scale-125"
                            />

                            {/* Temperature Label Above Node */}
                            <text
                              x={p.x}
                              y={p.y - 12}
                              textAnchor="middle"
                              className="fill-white font-black text-[13px] tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                            >
                              {Math.round(p.temp!)}°
                            </text>
                          </>
                        ) : (
                          <text
                            x={p.x}
                            y={svgHeight / 2 - 6}
                            textAnchor="middle"
                            className="fill-slate-400 font-bold text-[10px]"
                          >
                            Brak danych
                          </text>
                        )}

                        {/* Rain indicator if precip exists */}
                        {p.precip > 0 && (
                          <text
                            x={p.x}
                            y={svgHeight - 6}
                            textAnchor="middle"
                            className="fill-cyan-300 font-extrabold text-[10px]"
                          >
                            {p.precip < 0.1 ? p.precip.toFixed(2) : p.precip.toFixed(1)}mm
                          </text>
                        )}
                      </g>
                    ))}
                  </svg>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                    <HelpCircle className="w-8 h-8 text-slate-500" />
                    <span className="text-xs font-semibold">Brak danych temperatury dla tego okresu</span>
                  </div>
                )}
              </div>

              {/* Timeline Axis Below Curve */}
              <div className="flex justify-between items-center pt-3 border-t border-white/10 mt-2 px-1">
                {hoursData.map((h, idx) => {
                  const isNow = idx === 0;
                  return (
                    <div key={idx} className="flex flex-col items-center min-w-[34px]">
                      <div className="p-0.5 rounded-lg bg-white/[0.04] mb-1">
                        <AiWeatherIcon code={h.code} isDay={h.isDay} cloudCover={h.cloud} className="w-5 h-5 opacity-90" />
                      </div>
                      <span className={`text-[10px] font-extrabold tracking-tight ${isNow ? 'text-cyan-300 font-black' : 'text-slate-400'}`}>
                        {isNow ? 'Teraz' : h.hourLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Dynamic Legend */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-5 pt-3 border-t border-white/10 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 shadow-[0_0_8px_rgba(34,211,238,0.8)] inline-block" />
              <span className="font-semibold">
                Temperatura: {hasValidTemperatureData ? (
                  <>
                    <strong className="text-white">{Math.round(minTemp)}°C</strong> — <strong className="text-white">{Math.round(maxTemp)}°C</strong>
                  </>
                ) : (
                  <strong className="text-slate-400">Brak danych</strong>
                )}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-cyan-300 font-medium">
                <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400/50 border border-cyan-300 inline-block" />
                Niebieskie słupki: opad w danej godzinie (mm)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 2. PRECIPITATION DEDICATED LAYER */}
      {chartMode === "precipitation" && (
        <div className="relative pt-4 pb-2">
          <div className="overflow-x-auto no-scrollbar touch-pan-x -mx-2 px-2">
            <div className="flex items-end justify-between min-w-[800px] gap-2 h-48 border-b border-white/10 pb-2">
              {hoursData.map((h, idx) => {
                const pct = Math.max(8, Math.min(100, (h.precip / maxPrecip) * 100));
                const barHeight = h.precip > 0 ? pct : 3;
                const isNow = idx === 0;

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                    <div className="flex flex-col items-center mb-1.5">
                      <span className={`text-[11px] font-black whitespace-nowrap ${
                        h.pop >= 70 ? 'text-cyan-300' : h.pop >= 40 ? 'text-teal-300' : h.pop >= 15 ? 'text-amber-300' : 'text-slate-400'
                      }`}>
                        {Math.round(h.pop)}%
                      </span>
                      <span className={`text-[9.5px] font-bold whitespace-nowrap ${
                        h.precip > 0 ? 'text-white font-black' : 'text-slate-500 font-normal'
                      }`}>
                        {h.precip > 0 ? `${h.precip < 0.1 ? h.precip.toFixed(2) : h.precip.toFixed(1)} mm` : '0 mm'}
                      </span>
                    </div>

                    <div className="w-full max-w-[28px] bg-white/[0.05] rounded-t-xl h-full flex items-end p-0.5 relative border-x border-t border-white/10">
                      <div 
                        style={{ height: `${barHeight}%` }}
                        className={`w-full rounded-t-lg transition-all duration-500 bg-gradient-to-t from-cyan-700 via-cyan-500 to-teal-300 shadow-[0_0_12px_rgba(6,182,212,0.4)] ${isNow ? 'ring-2 ring-white/60' : ''}`}
                      />
                    </div>

                    <div className="flex flex-col items-center mt-3">
                      <AiWeatherIcon code={h.code} isDay={h.isDay} cloudCover={h.cloud} className="w-5 h-5 mb-1 opacity-80" />
                      <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{isNow ? 'Teraz' : h.hourLabel}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Precip Footer Stats */}
          <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white/[0.05] border border-white/12 text-xs text-slate-200 shadow-inner">
              <div className="flex items-center gap-2">
                <CloudRain className="w-4 h-4 text-cyan-400" />
                <span>Suma opadów (24h): <strong className="text-white font-bold">{totalPrecip24h.toFixed(1)} mm</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <span>Maks. ryzyko opadu: <strong className="text-white font-bold">{maxPop24h}%</strong></span>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${overallPrecipInterpretation.badgeBg} ${overallPrecipInterpretation.colorClass}`}>
                  {overallPrecipInterpretation.label}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-[11px] text-slate-300 font-medium">
              <span className="text-slate-400 font-bold mr-1">Interpretacja ryzyka:</span>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> &lt;15%: Sucho
              </span>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300">
                <span className="w-2 h-2 rounded-full bg-amber-400" /> 15–39%: Możliwy opad
              </span>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
                <span className="w-2 h-2 rounded-full bg-cyan-400" /> 40–69%: Deszcz prawdopodobny
              </span>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300">
                <span className="w-2 h-2 rounded-full bg-blue-400" /> ≥70%: Bardzo prawdopodobny
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3. WIND & GUSTS DEDICATED LAYER */}
      {chartMode === "wind" && (
        <div className="relative pt-4 pb-2">
          <div className="overflow-x-auto no-scrollbar touch-pan-x -mx-2 px-2">
            <div className="flex items-end justify-between min-w-[800px] gap-2 h-48 border-b border-white/10 pb-2">
              {hoursData.map((h, idx) => {
                const pct = Math.max(10, Math.min(100, (h.wind / maxWind) * 100));
                const barHeight = pct;
                const isNow = idx === 0;

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                    <div className="flex flex-col items-center mb-1.5">
                      <span className="text-[11px] font-black text-slate-100 whitespace-nowrap">
                        {Math.round(h.wind)} km/h
                      </span>
                      {h.gusts !== undefined && h.gusts !== null && (
                        <span className="text-[9px] text-teal-300 font-bold whitespace-nowrap">
                          por. {Math.round(h.gusts)}
                        </span>
                      )}
                    </div>

                    <div className="w-full max-w-[28px] bg-white/[0.05] rounded-t-xl h-full flex items-end p-0.5 relative border-x border-t border-white/10">
                      <div 
                        style={{ height: `${barHeight}%` }}
                        className={`w-full rounded-t-lg transition-all duration-500 bg-gradient-to-t from-teal-800 via-teal-500 to-emerald-300 shadow-[0_0_12px_rgba(20,184,166,0.4)] ${isNow ? 'ring-2 ring-white/60' : ''}`}
                      />
                    </div>

                    <div className="flex flex-col items-center mt-3">
                      <AiWeatherIcon code={h.code} isDay={h.isDay} cloudCover={h.cloud} className="w-5 h-5 mb-1 opacity-80" />
                      <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{isNow ? 'Teraz' : h.hourLabel}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10 text-xs text-slate-300">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 shadow-[0_0_8px_rgba(20,184,166,0.8)] inline-block" />
              <span>Prędkość średnia i maksymalne porywy wiatru w km/h</span>
            </div>
            <span className="text-teal-300 font-semibold">Maks. poryw: {Math.max(...hoursData.map(d => d.gusts || 0))} km/h</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(HourlyWeatherChartComponent);
