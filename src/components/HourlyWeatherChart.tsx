import React, { useState } from "react";
import { Thermometer, CloudRain, Wind, TrendingUp } from "lucide-react";
import AiWeatherIcon from "./AiWeatherIcon";
import { calculateOpticalCloudCover } from "../utils/weatherUtils";

interface HourlyChartProps {
  hourly: {
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
  tempBias?: number;
  currentIdx?: number;
}

export default function HourlyWeatherChart({ hourly, tempBias, currentIdx }: HourlyChartProps) {
  const [chartMode, setChartMode] = useState<"temperature" | "precipitation" | "wind">("temperature");

  if (!hourly || !hourly.time || !Array.isArray(hourly.time) || hourly.time.length === 0) {
    return null;
  }

  // Get next 24 hours slice starting from current index
  let startIndex = typeof currentIdx === 'number' && currentIdx >= 0 ? currentIdx : 0;
  if (startIndex < 0 || startIndex >= hourly.time.length) {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    startIndex = hourly.time.findIndex(t => new Date(t).getTime() >= now.getTime());
    if (startIndex === -1) startIndex = 0;
  }

  const hoursData = Array.from({ length: 24 }).map((_, i) => {
    const idx = startIndex + i;
    if (idx >= hourly.time.length) return null;
    const timeStr = hourly.time[idx];
    const hourLabel = new Date(timeStr).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    const rawTemp = hourly.temperature_2m?.[idx];
    const temp = (typeof rawTemp === 'number' && !isNaN(rawTemp))
      ? (typeof tempBias === 'number' ? Number((rawTemp + tempBias).toFixed(1)) : rawTemp)
      : 20;
    const rawApparent = hourly.apparent_temperature?.[idx];
    const apparent = (typeof rawApparent === 'number' && !isNaN(rawApparent))
      ? (typeof tempBias === 'number' ? Number((rawApparent + tempBias).toFixed(1)) : rawApparent)
      : temp;
    const precip = hourly.precipitation?.[idx] ?? 0;
    const pop = hourly.precipitation_probability?.[idx] ?? 0;
    const wind = hourly.wind_speed_10m?.[idx] ?? 10;
    const gusts = hourly.wind_gusts_10m?.[idx] ?? (wind ? Math.round(wind * 1.3) : wind);
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
  }).filter(item => item !== null) as any[];

  if (hoursData.length === 0) return null;

  // Min/Max for temperature scaling
  const temps = hoursData.map(d => d.temp);
  const apparents = hoursData.map(d => d.apparent);
  const allTemps = [...temps, ...apparents];
  const minTemp = Math.floor(Math.min(...allTemps) - 2);
  const maxTemp = Math.ceil(Math.max(...allTemps) + 2);
  const tempRange = Math.max(1, maxTemp - minTemp);

  const maxPrecip = Math.max(1, ...hoursData.map(d => d.precip));
  const maxWind = Math.max(10, ...hoursData.map(d => Math.max(d.wind, d.gusts || 0)));

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

  return (
    <div className="max-w-4xl mx-auto my-6 p-5 sm:p-6 bg-gradient-to-b from-white/[0.08] to-white/[0.03] border border-white/15 rounded-[32px] backdrop-blur-2xl shadow-xl">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div className="flex items-center space-x-2">
          <TrendingUp className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs uppercase tracking-widest text-slate-200 font-bold">Wykres Prognozy (24h)</h3>
        </div>

        {/* Mode Switcher Buttons */}
        <div className="flex items-center space-x-1.5 p-1 bg-white/[0.06] border border-white/10 rounded-2xl w-full sm:w-auto backdrop-blur-md">
          <button
            onClick={() => setChartMode("temperature")}
            className={`flex-1 sm:flex-none py-1.5 px-3.5 rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
              chartMode === "temperature"
                ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-blue-500/30 border border-cyan-400/30"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Thermometer className="w-3.5 h-3.5 text-cyan-300" />
            <span>Temperatura</span>
          </button>

          <button
            onClick={() => setChartMode("precipitation")}
            className={`flex-1 sm:flex-none py-1.5 px-3.5 rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
              chartMode === "precipitation"
                ? "bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-md shadow-cyan-500/30 border border-teal-400/30"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <CloudRain className="w-3.5 h-3.5 text-teal-300" />
            <span>Opady</span>
          </button>

          <button
            onClick={() => setChartMode("wind")}
            className={`flex-1 sm:flex-none py-1.5 px-3.5 rounded-xl text-xs font-black flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
              chartMode === "wind"
                ? "bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-500/30 border border-emerald-400/30"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Wind className="w-3.5 h-3.5 text-emerald-300" />
            <span>Wiatr i porywy</span>
          </button>
        </div>
      </div>

      {/* Chart Visual Container */}
      <div className="relative pt-6 pb-2 px-2 overflow-x-auto no-scrollbar touch-pan-x">
        <div className="flex items-end justify-between min-w-[750px] gap-3 h-48 border-b border-white/10 pb-2">
          {hoursData.map((h, idx) => {
            let barHeight = 0;
            let displayValue = "";
            let colorClass = "bg-blue-500";

            if (chartMode === "temperature") {
              const pct = Math.max(10, Math.min(100, ((h.temp - minTemp) / tempRange) * 100));
              barHeight = pct;
              displayValue = `${Math.round(h.temp)}°`;
              colorClass = "bg-gradient-to-t from-blue-600 to-cyan-400";
            } else if (chartMode === "precipitation") {
              const pct = Math.max(8, Math.min(100, (h.precip / maxPrecip) * 100));
              barHeight = h.precip > 0 ? pct : 3;
              colorClass = "bg-gradient-to-t from-cyan-700 to-teal-400";
            } else {
              const pct = Math.max(10, Math.min(100, (h.wind / maxWind) * 100));
              barHeight = pct;
              displayValue = `${Math.round(h.wind)}`;
              colorClass = "bg-gradient-to-t from-teal-700 to-emerald-400";
            }

            const isNow = idx === 0;

            return (
              <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                {chartMode === "precipitation" ? (
                  <div className="flex flex-col items-center mb-1">
                    <span className={`text-[10px] font-extrabold whitespace-nowrap ${
                      h.pop >= 70 ? 'text-cyan-300' : h.pop >= 40 ? 'text-teal-300' : h.pop >= 15 ? 'text-amber-300' : 'text-slate-400'
                    }`}>
                      {Math.round(h.pop)}%
                    </span>
                    <span className={`text-[9px] font-bold whitespace-nowrap ${
                      h.precip > 0 ? 'text-white font-extrabold' : 'text-slate-500 font-normal'
                    }`}>
                      {h.precip > 0 ? `${h.precip < 0.1 ? h.precip.toFixed(2) : h.precip.toFixed(1)} mm` : '0 mm'}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center mb-1">
                    <span className="text-[10px] font-bold text-slate-200 transition-opacity whitespace-nowrap">
                      {chartMode === "wind" ? `${displayValue} km/h` : displayValue}
                    </span>
                    {chartMode === "wind" && h.gusts !== undefined && h.gusts !== null && (
                      <span className="text-[8px] text-teal-300 font-semibold whitespace-nowrap">
                        por. {Math.round(h.gusts)}
                      </span>
                    )}
                  </div>
                )}

                <div className="w-full max-w-[28px] bg-white/5 rounded-t-xl h-full flex items-end p-0.5 relative">
                  <div 
                    style={{ height: `${barHeight}%` }}
                    className={`w-full rounded-t-lg transition-all duration-500 ${colorClass} ${isNow ? 'ring-2 ring-white/50' : ''}`}
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

        {chartMode === "temperature" && (
          <div className="flex items-center justify-center gap-6 mt-4 text-xs font-medium text-slate-400">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
              <span>Temperatura rzeczywista ({Math.round(minTemp)}°C — {Math.round(maxTemp)}°C)</span>
            </div>
          </div>
        )}

        {chartMode === "precipitation" && (
          <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-white/10">
            <div className="text-[10px] text-cyan-300/90 font-medium tracking-wide flex items-center gap-1.5">
              <span>ℹ️ Szansa opadu w ciągu danej godziny (60 min)</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl bg-white/[0.04] border border-white/10 text-xs text-slate-200">
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
              <span className="text-slate-400 font-bold mr-1">Interpretacja prawdopodobieństwa:</span>
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
        )}

        {chartMode === "wind" && (
          <div className="flex items-center justify-center gap-6 mt-4 text-xs font-medium text-slate-400">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-teal-500 inline-block" />
              <span>Prędkość wiatru i maksymalne porywy (km/h)</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
