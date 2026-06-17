import React, { useState, useEffect, useRef } from "react";
import { LineChart as LineChartIcon, ZoomIn } from "lucide-react";
import ColorPicker from "./ColorPicker";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from "recharts";

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

function generateTicks(domain, extraTicks) {
  const [minD, maxD] = domain;
  if (minD === Infinity || maxD === -Infinity || maxD <= minD) return [];
  const diff = maxD - minD;
  const rawStep = diff / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  let step = Math.ceil(rawStep / mag) * mag;
  if (step / mag === 3) step = 2 * mag;
  if (step / mag === 7) step = 5 * mag;
  if (step / mag === 8 || step / mag === 9) step = 10 * mag;

  const ticks = [];
  let curr = minD;
  while (curr <= maxD) {
    ticks.push(curr);
    curr += step;
  }
  if (!ticks.includes(maxD)) ticks.push(maxD);

  const threshold = diff * 0.05;
  const allImportant = [...extraTicks, minD, maxD];
  const finalTicks = [...extraTicks];

  ticks.forEach(t => {
    const isExtremity = (t === minD || t === maxD);

    // Se o tick for o limite do gráfico (maxD/minD) e bater com a curva, a curva vence.
    // Se for um tick cinza normal no meio do gráfico, e bater com a curva OU com os limites, ele é deletado para não poluir.
    if (isExtremity) {
      if (!extraTicks.some(ext => Math.abs(ext - t) < threshold)) finalTicks.push(t);
    } else {
      if (!allImportant.some(imp => Math.abs(imp - t) < threshold)) finalTicks.push(t);
    }
  });

  return Array.from(new Set(finalTicks)).sort((a, b) => a - b);
}

const CustomTooltip = ({ active, payload, label, isLastTrack, darkMode }) => {
  if (!active || !payload || !payload.length) return null;

  const containerStyle = {
    background: darkMode ? "#020617" : "#ffffff",
    border: darkMode ? "1px solid rgba(226, 232, 240, 0.1)" : "1px solid rgba(148, 163, 184, 0.2)",
    borderRadius: "12px",
    padding: "8px 12px",
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
    pointerEvents: "none",
    transform: isLastTrack ? "translateX(-100%)" : "none",
    marginLeft: isLastTrack ? "-15px" : "15px",
  };

  // Filtrar itens duplicados pelo nome da curva no payload para não repetir valores na interface
  const uniquePayload = [];
  const seenNames = new Set();
  payload.forEach(item => {
    if (!seenNames.has(item.name)) {
      seenNames.add(item.name);
      uniquePayload.push(item);
    }
  });

  return (
    <div style={containerStyle} className="flex flex-col gap-1 text-[11px]">
      <p className="font-bold text-slate-400 dark:text-slate-500">
        Prof.: {typeof label === "number" ? label.toFixed(1) : label}
      </p>
      {uniquePayload.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <span className="font-bold text-slate-800 dark:text-slate-200">
            {item.name}:
          </span>
          <span className="font-mono text-cyan-600 dark:text-cyan-400">
            {typeof item.value === "number" ? item.value.toFixed(4) : item.value}
          </span>
        </div>
      ))}
    </div>
  );
};

function useIntersectionObserver() {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, {
      rootMargin: "100px 300px", // Load charts slightly before they scroll into view
    });

    observer.observe(el);

    return () => {
      observer.unobserve(el);
    };
  }, []);

  return [ref, isIntersecting];
}

/**
 * Generates logarithmic axis configuration following the API Log Grid standard.
 * For resistivity-type curves: fixed 4-decade domain [0.2, 2000].
 * For other curves: dynamically calculates decades from data range.
 * Returns { domain, ticks, tickFormatter, majorTicks } where:
 *  - ticks: every integer 1-9 within each decade (produces the compacting grid lines)
 *  - tickFormatter: only shows labels at major decade boundaries to avoid clutter
 *  - majorTicks: Set of decade boundary values for drawing strong grid lines
 */
function getLogAxisProps(meta) {
  const minVal = meta.stats?.min > 0 ? meta.stats.min : 0.1;
  const maxVal = meta.stats?.max > 0 ? meta.stats.max : 1000;

  const mnemonic = (meta.mnemonic || "").toUpperCase();
  const isResistivity = /^(IL|LL|RT|RX|RES|SFL|ILD|ILM|LLD|LLS|MSFL|SFLU|RFOC|RILD|RILM)/i.test(mnemonic);

  let domain;
  let ticks = [];
  let labeledTicks = new Set();
  let majorTicks = new Set();

  if (isResistivity) {
    // Standard 4-decade resistivity grid: 0.2 to 2000
    domain = [0.2, 2000];

    // Fractional decade: 0.2 to 1.0
    for (let i = 2; i <= 10; i++) ticks.push(Number((i * 0.1).toFixed(1)));
    // Decade 1→10
    for (let i = 1; i <= 10; i++) ticks.push(i);
    // Decade 10→100
    for (let i = 1; i <= 10; i++) ticks.push(i * 10);
    // Decade 100→1000
    for (let i = 1; i <= 10; i++) ticks.push(i * 100);
    // Stretch to 2000
    ticks.push(2000);

    labeledTicks = new Set([0.2, 1, 10, 100, 1000, 2000]);
    majorTicks = new Set([0.2, 1, 10, 100, 1000, 2000]);
  } else {
    // Dynamic decades based on data range
    const powStart = Math.floor(Math.log10(minVal));
    const powEnd = Math.ceil(Math.log10(maxVal));
    const startDecade = Math.pow(10, powStart);
    const endDecade = Math.pow(10, powEnd);
    domain = [startDecade, endDecade];

    const numDecades = powEnd - powStart;

    if (numDecades <= 1) {
      // Narrow range within a single decade — use finer subdivisions
      const base = Math.pow(10, powStart);
      for (let i = 1; i <= 10; i++) {
        ticks.push(base * i);
        labeledTicks.add(base * i);
      }
      majorTicks.add(base);
      majorTicks.add(base * 10);
    } else {
      // Multiple decades: generate 1-9 per decade (creates the compacting grid effect)
      for (let p = powStart; p < powEnd; p++) {
        const base = Math.pow(10, p);
        for (let i = 1; i <= 9; i++) ticks.push(base * i);
      }
      ticks.push(endDecade);

      // Label only decade boundaries + optional 2 and 5 for readability
      for (let p = powStart; p <= powEnd; p++) {
        const base = Math.pow(10, p);
        labeledTicks.add(base);
        majorTicks.add(base);
        if (numDecades <= 3) {
          labeledTicks.add(base * 2);
          labeledTicks.add(base * 5);
        }
      }
    }
  }

  ticks = Array.from(new Set(ticks)).sort((a, b) => a - b);

  const tickFormatter = (val) => {
    const match = Array.from(labeledTicks).find(t => Math.abs(t - val) < val * 0.001);
    if (match !== undefined) {
      if (match >= 1000) return match.toFixed(0);
      if (match >= 1) return Number(match.toFixed(2)).toString();
      return match.toString();
    }
    return "";
  };

  return { domain, ticks, tickFormatter, majorTicks };
}

const TrackChartWrapper = ({
  track,
  trackIndex,
  well,
  extraMarginTop,
  containerRef,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  activeDomain,
  darkMode,
  curveReversed,
  curveFilled,
  curveScale,
  setCurveScale,
  files,
  selectStart,
  selectEnd,
  colWidth,
  curveColors,
  setCurveColors,
  curveFillColors,
  setCurveFillColors,
  setCurveReversed,
  setCurveFilled,
  moveCurve,
}) => {
  const [ref, inView] = useIntersectionObserver();

  // Check if the primary (first) curve in this track is in log mode
  const primaryMeta = track.metas[0];
  const primaryIsLog = primaryMeta && curveScale?.[primaryMeta.key] === "log";
  const primaryLogProps = primaryIsLog ? getLogAxisProps(primaryMeta) : null;

  const adjustedData = track.mergedData.map(row => {
    const newRow = { ...row };
    track.metas.forEach(meta => {
      const isLog = curveScale?.[meta.key] === "log";
      if (isLog && typeof newRow[meta.key] === "number") {
        if (newRow[meta.key] <= 0) {
          newRow[meta.key] = null;
        }
      }
    });
    return newRow;
  });

  return (
    <div
      ref={ref}
      className="rounded-b-xl border-x border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-3 pt-0 relative min-h-[460px] flex flex-col flex-1"
    >
      {inView ? (
        <div
          ref={trackIndex === 0 ? containerRef : null}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          className="relative flex-1"
          style={{ userSelect: "none", cursor: "crosshair" }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={adjustedData} layout="vertical" margin={{ top: 10 + extraMarginTop, right: 20, left: 10, bottom: 20 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(148,163,184,.15)"
                vertical={!primaryIsLog}
              />

              {track.metas.map((meta, i) => {
                const isReversed = !!curveReversed[meta.key];
                const isLog = curveScale?.[meta.key] === "log";
                const logProps = isLog ? getLogAxisProps(meta) : null;
                return (
                  <XAxis
                    key={meta.key}
                    xAxisId={meta.key}
                    type="number"
                    dataKey={meta.key}
                    orientation="top"
                    stroke={meta.color}
                    tick={{ fontSize: 9, fill: meta.color }}
                    domain={isLog ? logProps.domain : ["auto", "auto"]}
                    scale={isLog ? "log" : "auto"}
                    ticks={isLog ? logProps.ticks : undefined}
                    tickFormatter={isLog ? logProps.tickFormatter : undefined}
                    reversed={isReversed}
                    allowDataOverflow={true}
                    axisLine={false}
                    tickLine={false}
                    height={20}
                  />
                );
              })}

              <YAxis
                yAxisId={0}
                type="number"
                dataKey="depth"
                reversed={false}
                width={48}
                domain={activeDomain}
                allowDataOverflow
                interval={0}
                ticks={generateTicks(activeDomain, track.metas.flatMap(m => m.stats ? [m.stats.minDepth, m.stats.maxDepth] : []))}
                tick={(props) => {
                  const { x, y, payload } = props;
                  const val = payload.value;
                  const extraTicks = track.metas.flatMap(m => m.stats ? [m.stats.minDepth, m.stats.maxDepth] : []);
                  const isExtra = extraTicks.includes(val);
                  return (
                    <text
                      x={x}
                      y={y}
                      dy={4}
                      textAnchor="end"
                      fill={isExtra ? (darkMode ? "#22d3ee" : "#0e7490") : "#94a3b8"}
                      fontSize={9}
                      fontWeight={isExtra ? "bold" : "normal"}
                    >
                      {val.toFixed(1)}
                    </text>
                  );
                }}
              />

              <Tooltip
                content={<CustomTooltip isLastTrack={trackIndex === well.tracks.length - 1} darkMode={darkMode} />}
                isAnimationActive={false}
                allowEscapeViewBox={{ x: true, y: true }}
                wrapperStyle={{ zIndex: 1000 }}
              />

              {track.metas.flatMap((meta, i) => {
                const displayName = files.length > 1
                  ? `${meta.mnemonic} (${meta.fileName.replace(/\.las$/i, "")})`
                  : meta.mnemonic;
                const fillType = curveFilled[meta.key] ?? "left";
                const hasPattern = fillType.includes("-") && fillType !== "none";
                const patternType = hasPattern ? fillType.split("-")[0] : null;
                const fillDir = hasPattern ? fillType.split("-")[1] : fillType;

                const opacity = fillType === "none" ? 0 : 0.15;
                const baseVal = fillDir === "right" ? "dataMax" : "dataMin";

                const areas = [
                  <Area
                    key={`${meta.key}-solid`}
                    xAxisId={meta.key}
                    yAxisId={0}
                    type="monotone"
                    dataKey={meta.key}
                    name={displayName}
                    stroke={meta.color}
                    fill={meta.fillColor}
                    fillOpacity={opacity}
                    baseValue={baseVal}
                    dot={false}
                    strokeWidth={1.5}
                    connectNulls
                    isAnimationActive={false}
                  />
                ];

                if (hasPattern) {
                  areas.push(
                    <Area
                      key={`${meta.key}-pattern`}
                      xAxisId={meta.key}
                      yAxisId={0}
                      type="monotone"
                      dataKey={meta.key}
                      name={displayName}
                      stroke="none"
                      fill={`url(#pattern-${patternType}-${darkMode ? "dark" : "light"})`}
                      fillOpacity={1}
                      baseValue={baseVal}
                      dot={false}
                      strokeWidth={0}
                      connectNulls
                      isAnimationActive={false}
                      tooltipType="none"
                    />
                  );
                }

                return areas;
              })}

              {/* Logarithmic Grid Lines — drawn manually with differentiated opacity */}
              {primaryIsLog && primaryLogProps && primaryLogProps.ticks.map(tickVal => {
                const isMajor = primaryLogProps.majorTicks.has(tickVal);
                return (
                  <ReferenceLine
                    key={`log-grid-${tickVal}`}
                    xAxisId={primaryMeta.key}
                    x={tickVal}
                    yAxisId={0}
                    stroke={darkMode ? "rgba(148,163,184,.35)" : "rgba(100,116,139,.3)"}
                    strokeOpacity={isMajor ? 1 : 0.35}
                    strokeWidth={isMajor ? 1 : 0.5}
                    strokeDasharray={isMajor ? "none" : "none"}
                  />
                );
              })}

              {/* Ref Lines */}
              {track.metas.map((meta, i) => meta.stats && (
                <React.Fragment key={`refs-${meta.key}`}>
                  <ReferenceLine y={meta.stats.minDepth} yAxisId={0} stroke={meta.color} strokeOpacity={0.4} strokeDasharray="3 3" />
                  <ReferenceLine y={meta.stats.maxDepth} yAxisId={0} stroke={meta.color} strokeOpacity={0.4} strokeDasharray="3 3" />
                </React.Fragment>
              ))}

              {/* Selection Area */}
              {selectStart != null && selectEnd != null && (
                <ReferenceArea
                  yAxisId={0}
                  y1={Math.min(selectStart, selectEnd)}
                  y2={Math.max(selectStart, selectEnd)}
                  fill="rgba(34,211,238,0.1)"
                  stroke="#22d3ee"
                  strokeOpacity={0.5}
                  strokeDasharray="4 2"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-slate-50/20 dark:bg-slate-950/10 rounded-xl">
          <span className="text-[10px] text-slate-400 font-bold uppercase animate-pulse">Carregando...</span>
        </div>
      )}
    </div>
  );
};

export default function ChartsView({
  activeWellsTitle,
  zoomDomain,
  resetZoom,
  colWidth,
  setColWidth,
  selectedCurves,
  wellsData,
  moveCurve,
  curveReversed,
  setCurveReversed,
  curveFilled,
  setCurveFilled,
  curveColors,
  setCurveColors,
  curveFillColors,
  setCurveFillColors,
  curveScale,
  setCurveScale,
  activeDomain,
  containerRef,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  selectStart,
  selectEnd,
  files,
  darkMode,
  maxCurvesLimit,
  setMaxCurvesLimit,
}) {
  return (
    <div className="bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-xs flex flex-col p-4">
      {/* Definições globais de hachuras (Padrões SVG) */}
      <svg width="0" height="0" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
        <defs>
          {/* Pontilhado (Dotted) */}
          <pattern id="pattern-dotted-light" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="1.2" fill="rgba(0, 0, 0, 0.22)" />
            <circle cx="12" cy="12" r="1.2" fill="rgba(0, 0, 0, 0.22)" />
            <circle cx="12" cy="4" r="0.8" fill="rgba(0, 0, 0, 0.14)" />
            <circle cx="4" cy="12" r="0.8" fill="rgba(0, 0, 0, 0.14)" />
            <circle cx="8" cy="8" r="1" fill="rgba(0, 0, 0, 0.18)" />
          </pattern>
          <pattern id="pattern-dotted-dark" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="1.2" fill="rgba(255, 255, 255, 0.3)" />
            <circle cx="12" cy="12" r="1.2" fill="rgba(255, 255, 255, 0.3)" />
            <circle cx="12" cy="4" r="0.8" fill="rgba(255, 255, 255, 0.18)" />
            <circle cx="4" cy="12" r="0.8" fill="rgba(255, 255, 255, 0.18)" />
            <circle cx="8" cy="8" r="1" fill="rgba(255, 255, 255, 0.24)" />
          </pattern>

          {/* Tracejado (Dashed) */}
          <pattern id="pattern-dashed-light" width="14" height="8" patternUnits="userSpaceOnUse">
            <line x1="0" y1="4" x2="14" y2="4" stroke="rgba(107, 114, 128, 0.75)" strokeWidth="1" strokeDasharray="5,2" />
          </pattern>
          <pattern id="pattern-dashed-dark" width="14" height="8" patternUnits="userSpaceOnUse">
            <line x1="0" y1="4" x2="14" y2="4" stroke="rgba(156, 163, 175, 0.6)" strokeWidth="1" strokeDasharray="5,2" />
          </pattern>

          {/* Linhas Horizontais (Horizontal) */}
          <pattern id="pattern-horizontal-light" width="20" height="10" patternUnits="userSpaceOnUse">
            <line x1="0" y1="3" x2="20" y2="3" stroke="rgba(107, 114, 128, 0.65)" strokeWidth="1" />
            <line x1="0" y1="8" x2="20" y2="8" stroke="rgba(107, 114, 128, 0.65)" strokeWidth="1" />
          </pattern>
          <pattern id="pattern-horizontal-dark" width="20" height="10" patternUnits="userSpaceOnUse">
            <line x1="0" y1="3" x2="20" y2="3" stroke="rgba(156, 163, 175, 0.5)" strokeWidth="1" />
            <line x1="0" y1="8" x2="20" y2="8" stroke="rgba(156, 163, 175, 0.5)" strokeWidth="1" />
          </pattern>

          {/* Linhas Diagonais (Diagonal) */}
          <pattern id="pattern-diagonal-light" width="12" height="12" patternUnits="userSpaceOnUse">
            <line x1="0" y1="12" x2="12" y2="0" stroke="rgba(107, 114, 128, 0.65)" strokeWidth="1" />
          </pattern>
          <pattern id="pattern-diagonal-dark" width="12" height="12" patternUnits="userSpaceOnUse">
            <line x1="0" y1="12" x2="12" y2="0" stroke="rgba(156, 163, 175, 0.5)" strokeWidth="1" />
          </pattern>
        </defs>
      </svg>
      {/* Visualizer header/toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <LineChartIcon className="text-cyan-600 dark:text-cyan-400" size={18} />
          <div>
            <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Curvas do Poço {activeWellsTitle ? `(${activeWellsTitle})` : ""}
            </h2>
            <p className="text-[9px] text-slate-400">
              {zoomDomain
                ? `Zoom: ${numberFormat.format(zoomDomain.min)} – ${numberFormat.format(zoomDomain.max)}`
                : "Clique e arraste no gráfico para zoom"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          {/* Largura máxima */}
          <div className="flex items-center gap-1.5">
            <label className="text-[9px] text-slate-400 whitespace-nowrap">Largura máx.</label>
            <input
              type="number"
              min={50}
              max={800}
              step={10}
              value={colWidth}
              onChange={e => setColWidth(Number(e.target.value))}
              className="w-14 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1 py-1 text-xs text-slate-800 dark:text-slate-100 outline-none text-center font-semibold"
            />
            <span className="text-[9px] text-slate-400">px</span>
          </div>

          {/* Limite de curvas */}
          <div className="flex items-center gap-1.5">
            <label className="text-[9px] text-slate-400 whitespace-nowrap">Lim. Curvas</label>
            <input
              type="number"
              min={3}
              max={30}
              step={1}
              value={maxCurvesLimit}
              onChange={e => setMaxCurvesLimit(Math.max(3, Number(e.target.value)))}
              className="w-12 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1 py-1 text-xs text-slate-800 dark:text-slate-100 outline-none text-center font-semibold"
            />
          </div>

          {/* Reset zoom button */}
          <button
            onClick={resetZoom}
            disabled={!zoomDomain}
            className={"inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition " +
              (zoomDomain
                ? "border-cyan-400/30 bg-cyan-50 dark:bg-cyan-950/20 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-950/40 cursor-pointer"
                : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-660 cursor-not-allowed")}
          >
            <ZoomIn size={12} />
            <span>Resetar zoom</span>
          </button>

          <p className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-660 dark:text-slate-350 px-3 py-1 font-bold text-[9px]">
            {selectedCurves.length} ativa(s)
          </p>
        </div>
      </div>

      {/* Grid dos Perfis */}
      <div className="w-full bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-850 rounded-xl p-4 overflow-x-auto custom-scrollbar">
        {wellsData.length === 0 ? (
          <div className="flex h-full min-h-[400px] items-center justify-center text-center text-slate-400 text-xs">
            {files.length === 0 ? "Abra um arquivo LAS para começar." : "Selecione uma ou mais curvas na barra lateral para visualizar."}
          </div>
        ) : (
          <div className="flex items-start gap-6 pb-2">
            {wellsData.map(well => {
              const maxVisible = Math.min(well.tracks.length, maxCurvesLimit);
              const wellMaxWidth = maxVisible * colWidth + (maxVisible - 1) * 16 + 34;

              return (
                <div
                  key={well.wellId}
                  className="flex flex-col border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 rounded-2xl p-4 flex-shrink-0"
                  style={{ width: `${wellMaxWidth}px`, maxWidth: `${wellMaxWidth}px` }}
                >
                  {/* Well Name Header */}
                  <div className="text-center font-bold text-xs text-cyan-600 dark:text-cyan-400 mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                    {well.wellName}
                  </div>

                  {/* Columns Scroll Container */}
                  <div className="overflow-x-auto custom-scrollbar pb-2">
                    <div
                      className="grid gap-x-4 gap-y-0"
                      style={{ gridTemplateColumns: `repeat(${well.tracks.length}, ${colWidth}px)`, width: 'max-content' }}
                    >
                      {/* Headers */}
                      {well.tracks.map((track, trackIndex) => (
                        <div key={`header-${track.id}`} className="rounded-t-xl border-x border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-3 pb-1.5 flex flex-col justify-end">
                          <div className="flex flex-col gap-2">
                            {track.metas.map((meta, metaIndex) => (
                              <div key={meta.key} className="text-center rounded-xl bg-slate-50 dark:bg-slate-950/50 p-2 relative group border border-slate-200 dark:border-slate-850">
                                <div className="absolute top-2 left-2 opacity-30 hover:opacity-100 transition-opacity z-10">
                                  <button
                                    onClick={() => moveCurve(well.wellId, trackIndex, metaIndex, -1)}
                                    disabled={trackIndex === 0}
                                    title="Mover para track anterior"
                                    className="p-1 hover:bg-slate-250 dark:hover:bg-slate-700 bg-slate-105 dark:bg-slate-850 rounded text-cyan-600 dark:text-cyan-400 disabled:opacity-20 cursor-pointer text-[10px]"
                                  >
                                    {"<"}
                                  </button>
                                </div>
                                <div className="absolute top-2 right-2 opacity-30 hover:opacity-100 transition-opacity z-10">
                                  <button
                                    onClick={() => moveCurve(well.wellId, trackIndex, metaIndex, 1)}
                                    disabled={trackIndex === well.tracks.length - 1}
                                    title="Mover para próxima track"
                                    className="p-1 hover:bg-slate-250 dark:hover:bg-slate-700 bg-slate-105 dark:bg-slate-850 rounded text-cyan-600 dark:text-cyan-400 disabled:opacity-20 cursor-pointer text-[10px]"
                                  >
                                    {">"}
                                  </button>
                                </div>

                                <div className="flex flex-col items-center gap-1.5">
                                  <h3 className="font-bold text-sm text-slate-800 dark:text-cyan-200">{meta.mnemonic}</h3>
                                  <div className="flex items-center gap-2 bg-slate-100/60 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-850 rounded-lg px-2 py-0.5 mt-0.5">
                                    <div className="flex items-center gap-1" title="Cor da linha">
                                      <span className="text-[8px] text-slate-400 font-bold uppercase">Linha:</span>
                                      <ColorPicker value={meta.color} onCommit={c => setCurveColors(prev => ({ ...prev, [meta.key]: c }))} />
                                    </div>
                                    <div className="flex items-center gap-1" title="Cor do preenchimento">
                                      <span className="text-[8px] text-slate-400 font-bold uppercase">Preench.:</span>
                                      <ColorPicker value={meta.fillColor} onCommit={c => setCurveFillColors(prev => ({ ...prev, [meta.key]: c }))} />
                                    </div>
                                  </div>
                                </div>
                                {files.length > 1 && (
                                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold truncate mt-1">
                                    {meta.fileName}
                                  </p>
                                )}
                                <p className="text-[10px] text-slate-400 mt-0.5">{meta.curveInfo?.unit || "—"}</p>

                                {meta.stats && (
                                  <div className="mt-1 flex flex-col items-center gap-0.5">
                                    <div className="text-[9px] font-semibold text-cyan-650 dark:text-cyan-400/90 bg-cyan-100/50 dark:bg-cyan-950/30 rounded px-1.5 py-0.5 mb-1 w-full flex justify-center items-center gap-1">
                                      <span>↧</span>
                                      {meta.stats.minDepth.toFixed(1)} – {meta.stats.maxDepth.toFixed(1)}
                                    </div>
                                    <div className="text-[9px] text-slate-500 flex justify-between w-full px-2">
                                      <span>min: {meta.stats.min.toFixed(2)}</span>
                                      <span>max: {meta.stats.max.toFixed(2)}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 mt-1">
                                      <label className="flex items-center gap-0.5 cursor-pointer text-[9px] text-slate-400 hover:text-cyan-550 transition-colors">
                                        <input
                                          type="checkbox"
                                          checked={!!curveReversed[meta.key]}
                                          onChange={e => setCurveReversed(p => ({ ...p, [meta.key]: e.target.checked }))}
                                          className="accent-cyan-500 scale-75"
                                        />
                                        Inverter
                                      </label>
                                      <label className="flex items-center gap-0.5 cursor-pointer text-[9px] text-slate-400 hover:text-cyan-550 transition-colors">
                                        <input
                                          type="checkbox"
                                          checked={curveScale?.[meta.key] === "log"}
                                          onChange={e => setCurveScale(p => ({ ...p, [meta.key]: e.target.checked ? "log" : "linear" }))}
                                          className="accent-cyan-500 scale-75"
                                        />
                                        Escala Log
                                      </label>
                                      <div className="flex items-center gap-1 text-[9px] text-slate-400">
                                        <span>Preench.:</span>
                                        <select
                                          value={curveFilled[meta.key] ?? "left"}
                                          onChange={e => setCurveFilled(p => ({ ...p, [meta.key]: e.target.value }))}
                                          className="rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1 py-0.5 outline-none font-semibold text-[9px] cursor-pointer"
                                        >
                                          <option value="none">Nenhum</option>
                                          <option value="left">Esquerda (Sólido)</option>
                                          <option value="right">Direita (Sólido)</option>
                                          <optgroup label="Hachuras">
                                            <option value="dotted-left">Pontilhado (Esquerda)</option>
                                            <option value="dotted-right">Pontilhado (Direita)</option>
                                            <option value="dashed-left">Tracejado (Esquerda)</option>
                                            <option value="dashed-right">Tracejado (Direita)</option>
                                            <option value="horizontal-left">Linhas Horizontais (Esquerda)</option>
                                            <option value="horizontal-right">Linhas Horizontais (Direita)</option>
                                            <option value="diagonal-left">Linhas Diagonais (Esquerda)</option>
                                            <option value="diagonal-right">Linhas Diagonais (Direita)</option>
                                          </optgroup>
                                        </select>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      {/* Charts */}
                      {well.tracks.map((track, trackIndex) => {
                        const maxCurves = Math.max(1, ...well.tracks.map(t => t.metas.length));
                        const extraMarginTop = (maxCurves - track.metas.length) * 20;

                        return (
                          <TrackChartWrapper
                            key={`chart-${track.id}`}
                            track={track}
                            trackIndex={trackIndex}
                            well={well}
                            extraMarginTop={extraMarginTop}
                            containerRef={containerRef}
                            onMouseDown={onMouseDown}
                            onMouseMove={onMouseMove}
                            onMouseUp={onMouseUp}
                            activeDomain={activeDomain}
                            darkMode={darkMode}
                            curveReversed={curveReversed}
                            curveFilled={curveFilled}
                            curveScale={curveScale}
                            setCurveScale={setCurveScale}
                            files={files}
                            selectStart={selectStart}
                            selectEnd={selectEnd}
                            colWidth={colWidth}
                            curveColors={curveColors}
                            setCurveColors={setCurveColors}
                            curveFillColors={curveFillColors}
                            setCurveFillColors={setCurveFillColors}
                            setCurveReversed={setCurveReversed}
                            setCurveFilled={setCurveFilled}
                            moveCurve={moveCurve}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
