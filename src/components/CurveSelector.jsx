import React, { useState, useMemo } from "react";
import { X, LineChart as LineChartIcon, Search } from "lucide-react";

export default function CurveSelector({
  showSidebar,
  setShowSidebar,
  files,
  sidebarWellId,
  setSidebarWellId,
  activeFileId,
  selectedCurves,
  toggleCurve,
  getCurveColor,
}) {
  const [query, setQuery] = useState("");

  const selectedSidebarWell = useMemo(() => {
    return files.find(f => f.id === (sidebarWellId || activeFileId)) ?? files[0];
  }, [files, sidebarWellId, activeFileId]);

  const curveOptions = useMemo(() => {
    if (!selectedSidebarWell) return [];
    // Filtra curvas que só têm valores nulos
    return selectedSidebarWell.parsed.curves.slice(1).filter(c => {
      return selectedSidebarWell.parsed.data.some(row => {
        const val = row[c.mnemonic];
        return typeof val === "number" && !isNaN(val) && val !== selectedSidebarWell.nullValue;
      });
    });
  }, [selectedSidebarWell]);

  const filteredCurves = useMemo(() => {
    return curveOptions.filter(c =>
      `${c.mnemonic} ${c.unit} ${c.description}`.toLowerCase().includes(query.toLowerCase())
    );
  }, [curveOptions, query]);

  if (!showSidebar) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex">
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity" onClick={() => setShowSidebar(false)} />

      <div className="relative flex w-80 max-w-sm flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 text-slate-800 dark:text-slate-100 shadow-2xl transition-transform h-full">
        <button onClick={() => setShowSidebar(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-650 dark:hover:text-white p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer">
          <X size={18} />
        </button>
        <h2 className="text-sm font-bold mb-4 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
          <LineChartIcon className="text-cyan-600 dark:text-cyan-400" size={16} />
          <span>Selecionar Curvas</span>
        </h2>

        {files.length > 0 && (
          <div className="mb-4">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Poço Selecionado</label>
            <select
              value={sidebarWellId || activeFileId || ""}
              onChange={e => setSidebarWellId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5 text-xs text-slate-850 dark:text-slate-200 font-bold outline-none cursor-pointer"
            >
              {files.map(f => (
                <option key={f.id} value={f.id}>
                  {f.parsed.metadata?.well?.WELL?.value || f.name.replace(/\.las$/i, "")}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2">
            <Search size={14} className="text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar curva..."
              className="w-full bg-transparent text-xs outline-none text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {filteredCurves.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-4">Nenhuma curva encontrada.</p>
            )}
            {selectedSidebarWell && filteredCurves.map(curve => {
              const key = `${curve.mnemonic}__${selectedSidebarWell.id}`;
              const isSelected = selectedCurves.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleCurve(curve.mnemonic, selectedSidebarWell.id)}
                  className={"w-full rounded-xl border p-2.5 text-left transition cursor-pointer text-xs " +
                    (isSelected
                      ? "border-cyan-500 bg-cyan-500/5 text-cyan-600 dark:text-cyan-400 font-semibold"
                      : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-350 dark:hover:border-slate-700")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      {isSelected && (
                        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: getCurveColor(key), flexShrink: 0 }} />
                      )}
                      <span className="font-bold">{curve.mnemonic}</span>
                    </div>
                    <span className="text-[10px] text-slate-450">{curve.unit || "—"}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[10px] text-slate-450 font-normal leading-normal">{curve.description || "Sem descrição"}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
