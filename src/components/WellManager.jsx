import React, { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import WellMap from "./WellMap";

export default function WellManager({
  files,
  wellCoords,
  selectedWellIds,
  activeFileId,
  onSelectWell,
  pinningWellId,
  setPinningWellId,
  onPinCoord,
  removeFile,
  setFiles,
  darkMode,
}) {
  const [wellSearchQuery, setWellSearchQuery] = useState("");

  const filteredFiles = useMemo(() => {
    return files.filter(f => {
      const wellName = f.parsed.metadata?.well?.WELL?.value || f.name;
      return String(wellName).toLowerCase().includes(wellSearchQuery.toLowerCase());
    });
  }, [files, wellSearchQuery]);

  return (
    <section className="w-full lg:w-[35%] xl:w-[30%] h-[350px] lg:h-full relative flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0">
      {/* Well search floating box */}
      <div className="absolute top-3 left-12 z-[1000] w-64 shadow-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center px-3 py-1.5">
        <Search size={13} className="text-slate-400 mr-2 flex-shrink-0" />
        <input
          type="text"
          value={wellSearchQuery}
          onChange={e => setWellSearchQuery(e.target.value)}
          placeholder="Search Wells..."
          className="w-full bg-transparent border-none text-xs outline-none text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500"
        />
        {wellSearchQuery && (
          <button onClick={() => setWellSearchQuery("")} className="text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 flex-shrink-0 cursor-pointer">
            <X size={12} />
          </button>
        )}
      </div>

      <div className="w-full h-full relative flex-1">
        <WellMap
          files={filteredFiles}
          wellCoords={wellCoords}
          selectedWellIds={selectedWellIds}
          activeFileId={activeFileId}
          onSelectWell={onSelectWell}
          pinningWellId={pinningWellId}
          onPinCoord={onPinCoord}
          darkMode={darkMode}
        />

        {/* Collapsible Coordinates Manager and Well List */}
        {files.length > 0 && (
          <div className="absolute bottom-4 left-4 right-4 z-[1000] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-3 shadow-xl backdrop-blur-xs max-h-[180px] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2 mb-2">
              <h3 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Gerenciar Coordenadas</h3>
            </div>
            <div className="space-y-2">
              {filteredFiles.length === 0 ? (
                <div className="text-[10px] text-slate-400 dark:text-slate-500 text-center py-2">
                  Nenhum poço encontrado
                </div>
              ) : (
                filteredFiles.map(f => {
                  const coordsVal = wellCoords[f.id];
                  const isSelected = selectedWellIds.includes(f.id);
                  const isActive = f.id === activeFileId;
                  const wellName = f.parsed.metadata?.well?.WELL?.value || f.name.replace(/\.las$/i, "");
                  return (
                    <div
                      key={f.id}
                      className={`flex flex-col gap-1.5 rounded-xl p-2 transition text-[10px] ${isSelected
                        ? "bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-800"
                        : "bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-900 hover:border-slate-300 dark:hover:border-slate-750"
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2 cursor-pointer" onClick={() => onSelectWell(f.id)}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${coordsVal ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-600"}`} />
                          <span className="font-bold text-slate-750 dark:text-slate-250 truncate">
                            {wellName} {isActive && <span className="text-[9px] text-cyan-600 dark:text-cyan-400 ml-1 font-normal">(Ativo)</span>}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {!coordsVal && (
                            <button
                              onClick={e => { e.stopPropagation(); setPinningWellId(prev => prev === f.id ? null : f.id); }}
                              className={`px-1.5 py-0.5 rounded text-[8px] font-bold transition cursor-pointer ${pinningWellId === f.id ? "bg-cyan-500 text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-750"
                                }`}
                            >
                              Fixar
                            </button>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); removeFile(f.id); }}
                            className="p-0.5 hover:text-red-500 text-slate-400 transition cursor-pointer"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      </div>

                      {/* Controls for this specific well */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 dark:border-slate-800/80 pt-1.5 mt-0.5">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">UTM Fuso:</span>
                          <input
                            type="number"
                            value={f.utmZone ?? 23}
                            onChange={e => {
                              const val = Number(e.target.value);
                              setFiles(prev => prev.map(file => file.id === f.id ? { ...file, utmZone: val } : file));
                            }}
                            className="w-12 px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] text-slate-800 dark:text-slate-200 text-center outline-none font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                        {coordsVal && (
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 truncate ml-auto font-mono">
                            📍 {coordsVal.lat.toFixed(4)}, {coordsVal.lng.toFixed(4)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
