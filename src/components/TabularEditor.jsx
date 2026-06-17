import React, { useState, useCallback, useEffect } from "react";
import { Search, X } from "lucide-react";

export default function TabularEditor({
  activeFile,
  files,
  setActiveFileId,
  onSaveEdit,
  onBulkReplace,
}) {
  const [tablePage, setTablePage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [editingCell, setEditingCell] = useState(null); // { rowIndex, mnemonic }
  const [editValue, setEditValue] = useState("");
  const [depthSearchQuery, setDepthSearchQuery] = useState("");
  const [bulkReplaceConfig, setBulkReplaceConfig] = useState({
    curve: "",
    targetVal: "",
    newVal: "",
    isNull: false,
  });

  // Reset page and editing cell when active file changes
  useEffect(() => {
    setTablePage(0);
    setEditingCell(null);
  }, [activeFile?.id]);

  const handleDepthSearch = useCallback(() => {
    if (!activeFile || !depthSearchQuery.trim()) return;
    const targetDepth = parseFloat(depthSearchQuery);
    if (isNaN(targetDepth)) {
      alert("Por favor, insira um número válido para a profundidade.");
      return;
    }

    let closestIndex = 0;
    let minDiff = Infinity;
    const depthCurve = activeFile.depthCurve;
    activeFile.parsed.data.forEach((row, idx) => {
      const d = row[depthCurve];
      if (typeof d === "number") {
        const diff = Math.abs(d - targetDepth);
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = idx;
        }
      }
    });

    const page = Math.floor(closestIndex / pageSize);
    setTablePage(page);

    setTimeout(() => {
      const el = document.getElementById(`row-${closestIndex}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("bg-cyan-500/20");
        setTimeout(() => {
          el.classList.remove("bg-cyan-500/20");
        }, 3000);
      }
    }, 100);
  }, [activeFile, depthSearchQuery, pageSize]);

  const handleStartEdit = useCallback((rowIndex, mnemonic, currentVal) => {
    setEditingCell({ rowIndex, mnemonic });
    setEditValue(currentVal == null || isNaN(currentVal) ? "" : String(currentVal));
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingCell || !activeFile) return;
    const { rowIndex, mnemonic } = editingCell;
    const floatVal = editValue.trim() === "" ? activeFile.nullValue : parseFloat(editValue);
    const finalVal = isNaN(floatVal) ? activeFile.nullValue : floatVal;

    onSaveEdit(rowIndex, mnemonic, finalVal);
    setEditingCell(null);
  }, [editingCell, editValue, activeFile, onSaveEdit]);

  const runBulkReplace = useCallback(() => {
    if (!activeFile || !bulkReplaceConfig.curve) return;
    const { curve, targetVal, newVal, isNull } = bulkReplaceConfig;
    const nVal = parseFloat(newVal);
    if (isNaN(nVal)) return;

    onBulkReplace(curve, targetVal, nVal, isNull);
    setBulkReplaceConfig({ curve: "", targetVal: "", newVal: "", isNull: false });
  }, [activeFile, bulkReplaceConfig, onBulkReplace]);

  if (!activeFile) {
    return (
      <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-xs flex flex-col p-4">
        <div className="flex h-[350px] items-center justify-center text-slate-400 text-sm">
          Carregue um arquivo LAS para utilizar o Editor Tabular.
        </div>
      </div>
    );
  }

  const curvesList = activeFile.parsed.curves.slice(1);
  const dataLength = activeFile.parsed.data.length;
  const totalPages = Math.ceil(dataLength / pageSize);

  return (
    <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-xs flex flex-col p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 flex-shrink-0">
          <div>
            <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Editor Tabular do Poço {activeFile ? `(${activeFile.parsed.metadata?.well?.WELL?.value || activeFile.name.replace(/\.las$/i, "")})` : ""}
            </h2>
            <p className="text-[10px] text-slate-400">
              Edite valores clicando duas vezes nas células. As alterações atualizam os gráficos instantaneamente.
            </p>
          </div>

          {/* Well Selector */}
          {files && files.length > 1 && setActiveFileId && (
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Poço:</label>
              <select
                value={activeFile.id}
                onChange={e => setActiveFileId(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-bold outline-none cursor-pointer min-w-[140px]"
              >
                {files.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.parsed.metadata?.well?.WELL?.value || f.name.replace(/\.las$/i, "")}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Controls row */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-1.5">
            <Search size={14} className="text-slate-400" />
            <input
              type="text"
              value={depthSearchQuery}
              onChange={e => setDepthSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") handleDepthSearch();
              }}
              placeholder="Buscar profundidade..."
              className="w-full bg-transparent text-xs outline-none text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
            />
            <button
              onClick={handleDepthSearch}
              className="rounded bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20 cursor-pointer"
            >
              Buscar
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Registros por página:</span>
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setTablePage(0);
              }}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-800 dark:text-slate-200 outline-none font-bold"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>
        </div>

        {/* Bulk Replace Card */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-3">
          <h3 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Substituição em Lote</h3>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 text-[10px]">Curva:</span>
              <select
                value={bulkReplaceConfig.curve}
                onChange={e => setBulkReplaceConfig(prev => ({ ...prev, curve: e.target.value }))}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 outline-none text-xs text-slate-800 dark:text-slate-200 font-bold"
              >
                <option value="">Selecione...</option>
                {curvesList.map(c => (
                  <option key={c.mnemonic} value={c.mnemonic}>{c.mnemonic}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 text-[10px]">Alvo:</span>
              <input
                type="text"
                value={bulkReplaceConfig.targetVal}
                disabled={bulkReplaceConfig.isNull}
                onChange={e => setBulkReplaceConfig(prev => ({ ...prev, targetVal: e.target.value }))}
                placeholder="ex: -999"
                className="w-20 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-slate-800 dark:text-slate-200 outline-none disabled:opacity-40 text-xs font-semibold"
              />
              <label className="flex items-center gap-1 cursor-pointer text-[10px] text-slate-550 font-bold">
                <input
                  type="checkbox"
                  checked={bulkReplaceConfig.isNull}
                  onChange={e => setBulkReplaceConfig(prev => ({ ...prev, isNull: e.target.checked }))}
                  className="accent-cyan-500 scale-75"
                />
                <span>Nulo</span>
              </label>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 text-[10px]">Novo:</span>
              <input
                type="number"
                step="any"
                value={bulkReplaceConfig.newVal}
                onChange={e => setBulkReplaceConfig(prev => ({ ...prev, newVal: e.target.value }))}
                placeholder="ex: 0"
                className="w-20 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-slate-800 dark:text-slate-200 outline-none text-xs font-semibold"
              />
            </div>
            <button
              onClick={runBulkReplace}
              disabled={!bulkReplaceConfig.curve || (!bulkReplaceConfig.isNull && !bulkReplaceConfig.targetVal) || bulkReplaceConfig.newVal === ""}
              className="rounded-lg bg-purple-500/10 border border-purple-500/20 px-3 py-1 text-xs font-semibold text-purple-650 dark:text-purple-400 hover:bg-purple-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
            >
              Substituir Tudo
            </button>
          </div>
        </div>

        {/* Table spreadsheets */}
        <div className="overflow-auto max-h-[420px] border border-slate-200 dark:border-slate-800/80 rounded-xl bg-white dark:bg-slate-950 custom-scrollbar">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2 font-bold text-cyan-600 dark:text-cyan-400 w-32 border-r border-slate-100 dark:border-slate-800/50">
                  Profundidade ({activeFile.depthCurve})
                </th>
                {curvesList.map(c => (
                  <th key={c.mnemonic} className="px-4 py-2 font-semibold text-slate-700 dark:text-slate-200 border-r border-slate-100 dark:border-slate-800/50">
                    <div>{c.mnemonic}</div>
                    <div className="text-[9px] text-slate-400 font-normal">{c.unit || "—"}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeFile.parsed.data.slice(tablePage * pageSize, Math.min((tablePage + 1) * pageSize, dataLength)).map((row, relativeIdx) => {
                const globalIdx = (tablePage * pageSize) + relativeIdx;
                const depthVal = row[activeFile.depthCurve];

                return (
                  <tr key={globalIdx} id={`row-${globalIdx}`} className="border-b border-slate-100 dark:border-slate-900 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                    <td className="px-4 py-2 font-mono text-[11px] text-cyan-600 dark:text-cyan-400 bg-slate-50/50 dark:bg-slate-900/20 border-r border-slate-150 dark:border-slate-800/50">
                      {typeof depthVal === "number" ? depthVal.toFixed(2) : depthVal}
                    </td>

                    {curvesList.map(c => {
                      const val = row[c.mnemonic];
                      const isNull = val === activeFile.nullValue || val == null || isNaN(val);
                      const isEditing = editingCell && editingCell.rowIndex === globalIdx && editingCell.mnemonic === c.mnemonic;

                      const origRow = activeFile.originalData?.[globalIdx];
                      const origVal = origRow ? origRow[c.mnemonic] : undefined;
                      const isModified = origVal !== undefined && val !== origVal;

                      return (
                        <td
                          key={c.mnemonic}
                          onDoubleClick={() => handleStartEdit(globalIdx, c.mnemonic, val)}
                          className={`px-4 py-2 font-mono text-[11px] border-r border-slate-100 dark:border-slate-800/50 cursor-pointer relative group transition-colors ${
                            isModified ? "bg-amber-500/5 text-amber-600 dark:text-amber-250" : isNull ? "text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-200"
                          } hover:bg-slate-100/50 dark:hover:bg-slate-800/40`}
                        >
                          {isEditing ? (
                            <input
                              type="number"
                              step="any"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={handleSaveEdit}
                              onKeyDown={e => {
                                if (e.key === "Enter") handleSaveEdit();
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              className="w-full bg-slate-105 dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-[11px] px-1 py-0.5 rounded border border-cyan-400 outline-none"
                              autoFocus
                              onFocus={e => e.target.select()}
                            />
                          ) : (
                            <div className="flex items-center justify-between">
                              <span>{isNull ? "—" : typeof val === "number" ? val.toFixed(4) : val}</span>
                              {isModified && (
                                <span className="w-1 h-1 rounded-full bg-amber-500" title={`Original: ${origVal}`} />
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
          <div>
            Exibindo <span className="text-slate-700 dark:text-slate-200 font-bold">{(tablePage * pageSize) + 1}</span>–
            <span className="text-slate-700 dark:text-slate-200 font-bold">{Math.min((tablePage + 1) * pageSize, dataLength)}</span> de{" "}
            <span className="text-slate-700 dark:text-slate-200 font-bold">{dataLength}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setTablePage(0)}
                disabled={tablePage === 0}
                className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Primeira
              </button>
              <button
                onClick={() => setTablePage(p => Math.max(0, p - 1))}
                disabled={tablePage === 0}
                className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Anterior
              </button>
              <span className="mx-2 text-slate-500">
                Página <span className="text-slate-800 dark:text-slate-200 font-bold">{tablePage + 1}</span> de <span className="text-slate-800 dark:text-slate-200 font-bold">{totalPages}</span>
              </span>
              <button
                onClick={() => setTablePage(p => Math.min(totalPages - 1, p + 1))}
                disabled={tablePage >= totalPages - 1}
                className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Próxima
              </button>
              <button
                onClick={() => setTablePage(totalPages - 1)}
                disabled={tablePage >= totalPages - 1}
                className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Última
              </button>
            </div>

            <div className="flex items-center gap-1">
              <span>Ir para:</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={tablePage + 1}
                onChange={e => {
                  const val = Number(e.target.value) - 1;
                  if (!isNaN(val) && val >= 0 && val < totalPages) {
                    setTablePage(val);
                  }
                }}
                className="w-10 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-1 py-0.5 text-center text-slate-800 dark:text-slate-200 font-semibold"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
