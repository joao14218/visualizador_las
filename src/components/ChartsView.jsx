import React from "react";
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

export default function ChartsView({
  activeWellsTitle,
  zoomDomain,
  resetZoom,
  colWidth,
  setColWidth,
  selectedCurves,
  trackDataWithMeta,
  moveCurve,
  curveReversed,
  setCurveReversed,
  curveFilled,
  setCurveFilled,
  curveColors,
  setCurveColors,
  curveFillColors,
  setCurveFillColors,
  activeDomain,
  containerRef,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  selectStart,
  selectEnd,
  files,
  darkMode,
}) {
  return (
    <div className="bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-xs flex flex-col p-4">
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
              min={120}
              max={800}
              step={10}
              value={colWidth}
              onChange={e => setColWidth(Number(e.target.value))}
              className="w-16 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-1 text-xs text-slate-800 dark:text-slate-100 outline-none text-center font-semibold"
            />
            <span className="text-[9px] text-slate-400">px</span>
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
        {trackDataWithMeta.length === 0 ? (
          <div className="flex h-full min-h-[400px] items-center justify-center text-center text-slate-400 text-xs">
            {files.length === 0 ? "Abra um arquivo LAS para começar." : "Selecione uma ou mais curvas na barra lateral para visualizar."}
          </div>
        ) : (
          <div className="grid gap-x-4 gap-y-0" style={{ gridTemplateColumns: `repeat(${trackDataWithMeta.length}, minmax(220px, ${colWidth}px))` }}>
            {/* Headers */}
            {trackDataWithMeta.map((track, trackIndex) => (
              <div key={`header-${track.id}`} className="rounded-t-xl border-x border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-3 pb-1.5 flex flex-col justify-end">
                <div className="flex flex-col gap-2">
                  {track.metas.map((meta, metaIndex) => (
                    <div key={meta.key} className="text-center rounded-xl bg-slate-50 dark:bg-slate-950/50 p-2 relative group border border-slate-200 dark:border-slate-850">
                      <div className="absolute top-2 left-2 opacity-30 hover:opacity-100 transition-opacity z-10">
                        <button
                          onClick={() => moveCurve(trackIndex, metaIndex, -1)}
                          disabled={trackIndex === 0}
                          title="Mover para track anterior"
                          className="p-1 hover:bg-slate-250 dark:hover:bg-slate-700 bg-slate-105 dark:bg-slate-850 rounded text-cyan-600 dark:text-cyan-400 disabled:opacity-20 cursor-pointer text-[10px]"
                        >
                          {"<"}
                        </button>
                      </div>
                      <div className="absolute top-2 right-2 opacity-30 hover:opacity-100 transition-opacity z-10">
                        <button
                          onClick={() => moveCurve(trackIndex, metaIndex, 1)}
                          disabled={trackIndex === trackDataWithMeta.length - 1}
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
                            <div className="flex items-center gap-1 text-[9px] text-slate-400">
                              <span>Preench.:</span>
                              <select
                                value={curveFilled[meta.key] ?? "left"}
                                onChange={e => setCurveFilled(p => ({ ...p, [meta.key]: e.target.value }))}
                                className="rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1 py-0.5 outline-none font-semibold text-[9px] cursor-pointer"
                              >
                                <option value="none">Nenhum</option>
                                <option value="left">Esquerda</option>
                                <option value="right">Direita</option>
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
            {trackDataWithMeta.map((track, trackIndex) => {
              const maxCurves = Math.max(1, ...trackDataWithMeta.map(t => t.metas.length));
              const extraMarginTop = (maxCurves - track.metas.length) * 20;

              return (
                <div key={`chart-${track.id}`} className="rounded-b-xl border-x border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-3 pt-0 relative min-h-[460px] flex flex-col flex-1">
                  <div className="relative flex-1" style={{ userSelect: "none" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={track.mergedData} layout="vertical" margin={{ top: 10 + extraMarginTop, right: 20, left: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.15)" />

                        {track.metas.map((meta, i) => {
                          const isReversed = !!curveReversed[meta.key];
                          return (
                            <XAxis
                              key={meta.key}
                              xAxisId={meta.key}
                              type="number"
                              dataKey={meta.key}
                              orientation="top"
                              stroke={meta.color}
                              tick={{ fontSize: 9, fill: meta.color }}
                              domain={["auto", "auto"]}
                              scale="auto"
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
                          contentStyle={{ background: darkMode ? "#020617" : "#f4f5f8", border: "1px solid rgba(148,163,184,0.3)", borderRadius: 12 }}
                          labelStyle={{ color: darkMode ? "#e2e8f0" : "#0f172a" }}
                          isAnimationActive={false}
                        />

                        {track.metas.map((meta, i) => {
                          const displayName = files.length > 1
                            ? `${meta.mnemonic} (${meta.fileName.replace(/\.las$/i, "")})`
                            : meta.mnemonic;
                          const fillType = curveFilled[meta.key] ?? "left";
                          const opacity = fillType === "none" ? 0 : 0.15;
                          const baseVal = fillType === "right" ? "dataMax" : "dataMin";
                          return (
                            <Area
                              key={meta.key}
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

                    <div
                      ref={trackIndex === 0 ? containerRef : null}
                      onMouseDown={onMouseDown}
                      onMouseMove={onMouseMove}
                      onMouseUp={onMouseUp}
                      onMouseLeave={onMouseUp}
                      style={{ position: "absolute", inset: 0, cursor: "crosshair" }}
                    />
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
