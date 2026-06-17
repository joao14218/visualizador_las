import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { AlertCircle, X } from "lucide-react";
import Header from "./components/Header";
import WellManager from "./components/WellManager";
import ChartsView from "./components/ChartsView";
import TabularEditor from "./components/TabularEditor";
import StatsSection from "./components/StatsSection";
import CurveSelector from "./components/CurveSelector";
import useZoom from "./hooks/useZoom";
import { defaultHex } from "./utils/colorUtils";
import { getWellCoordinates, guessUtmSettings } from "./utils/coordinateUtils";
import { parseLAS } from "./utils/lasParser";

export default function VisualizadorLAS() {
  const [files, setFiles] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [curveColors, setCurveColors] = useState({});
  const [curveFillColors, setCurveFillColors] = useState({});
  const [curveReversed, setCurveReversed] = useState({});
  const [curveFilled, setCurveFilled] = useState({});
  const [curveScale, setCurveScale] = useState({});
  const [error, setError] = useState("");
  const [activeFileId, setActiveFileId] = useState(null);
  const [selectedWellIds, setSelectedWellIds] = useState([]);
  const [sidebarWellId, setSidebarWellId] = useState(null);
  const [colWidth, setColWidth] = useState(230);
  const [activeTab, setActiveTab] = useState("grafico"); // "grafico" | "tabela"
  const [wellCoords, setWellCoords] = useState({});
  const [pinningWellId, setPinningWellId] = useState(null);
  const [darkMode, setDarkMode] = useState(false); // Default to Light mode to match reference image
  const [showSidebar, setShowSidebar] = useState(false);
  const [maxCurvesLimit, setMaxCurvesLimit] = useState(6);

  const handleToggleWellSelection = useCallback((id) => {
    setSelectedWellIds(prev => {
      const isSelected = prev.includes(id);
      if (isSelected) {
        const next = prev.filter(wellId => wellId !== id);
        setActiveFileId(currentActive => {
          if (currentActive === id) {
            return next.length > 0 ? next[next.length - 1] : null;
          }
          return currentActive;
        });
        return next;
      } else {
        setActiveFileId(id);
        return [...prev, id];
      }
    });
  }, []);

  // Sync sidebarWellId when activeFileId changes
  useEffect(() => {
    if (activeFileId) {
      setSidebarWellId(activeFileId);
    }
  }, [activeFileId]);

  // Sync dark class on document element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  // Recalcular coordenadas automaticamente ao carregar arquivos ou alterar fuso/hemisfério individual do poço
  useEffect(() => {
    setWellCoords(prev => {
      const next = { ...prev };
      let changed = false;
      files.forEach(file => {
        const zone = file.utmZone ?? 23;
        const northern = file.utmNorthern ?? false;
        // Se a localização estiver nos metadados, recalculamos
        const coords = getWellCoordinates(file.parsed.metadata?.well, zone, northern);
        if (coords) {
          const key = file.id;
          const old = prev[key];
          if (!old || old.lat !== coords.lat || old.lng !== coords.lng) {
            next[key] = coords;
            changed = true;
          }
        }
      });
      return changed ? next : prev;
    });
  }, [files]);

  // Sincronizar e carregar automaticamente 3 curvas de cada poço selecionado
  useEffect(() => {
    if (files.length === 0 || selectedWellIds.length === 0) return;

    setTracks(prev => {
      let changed = false;
      const next = JSON.parse(JSON.stringify(prev));

      selectedWellIds.forEach(wellId => {
        const file = files.find(f => f.id === wellId);
        if (!file) return;

        // Pegar as 3 primeiras curvas (excluindo a profundidade)
        const defaultCurves = file.parsed.curves.slice(1, 4).map(c => c.mnemonic);

        defaultCurves.forEach(m => {
          const key = `${m}__${wellId}`;

          // Verificar se a curva já está em alguma track
          const alreadyExists = next.some(t => t.curves.includes(key));
          if (alreadyExists) return;

          next.push({
            id: crypto.randomUUID(),
            curves: [key]
          });
          changed = true;

          // Garantir que as cores padrão estejam configuradas
          setCurveColors(colors => colors[key] ? colors : { ...colors, [key]: defaultHex(m) });
          setCurveFillColors(fills => fills[key] ? fills : { ...fills, [key]: defaultHex(m) });
        });
      });

      return changed ? next : prev;
    });
  }, [selectedWellIds, files]);

  const selectedCurves = useMemo(() => tracks.flatMap(t => t.curves), [tracks]);

  const activeFile = useMemo(() => files.find(f => f.id === activeFileId) ?? files[0], [files, activeFileId]);

  // Domínio global de profundidade
  const globalDepthDomain = useMemo(() => {
    if (files.length === 0) return [0, 1000];
    const activeKeys = tracks.flatMap(t => t.curves);
    let gMin = Infinity, gMax = -Infinity, gStep = 0;

    if (activeKeys.length > 0) {
      activeKeys.forEach(key => {
        const [mnemonic, fileId] = key.split("__");
        const file = files.find(f => f.id === fileId);
        if (!file) return;
        const step = file.parsed.metadata?.well?.STEP ? Math.abs(Number(file.parsed.metadata.well.STEP.value)) : 0;
        if (step > 0) gStep = step;
        file.parsed.data.forEach(row => {
          const d = row[file.depthCurve];
          const val = row[mnemonic];
          if (typeof d === "number" && !isNaN(d) && d !== file.nullValue &&
            typeof val === "number" && !isNaN(val) && val !== file.nullValue) {
            if (d < gMin) gMin = d;
            if (d > gMax) gMax = d;
          }
        });
      });
    } else {
      files.forEach(f => {
        const step = f.parsed.metadata?.well?.STEP ? Math.abs(Number(f.parsed.metadata.well.STEP.value)) : 0;
        if (step > 0) gStep = step;
        f.parsed.data.forEach(row => {
          const d = row[f.depthCurve];
          if (typeof d === "number" && !isNaN(d) && d !== f.nullValue) {
            if (d < gMin) gMin = d;
            if (d > gMax) gMax = d;
          }
        });
      });
    }

    if (gMin === Infinity) return [0, 1000];
    if (gStep > 0) {
      gMin = Number((Math.floor(gMin / gStep) * gStep).toFixed(4));
      gMax = Number((Math.ceil(gMax / gStep) * gStep).toFixed(4));
    }
    return [gMin, gMax];
  }, [files, tracks]);

  const activeDomainRef = useRef(globalDepthDomain);

  const { zoomDomain, resetZoom, containerRef, onMouseDown, onMouseMove, onMouseUp, selectStart, selectEnd } =
    useZoom(activeDomainRef);

  const activeDomain = zoomDomain ? [zoomDomain.min, zoomDomain.max] : globalDepthDomain;
  activeDomainRef.current = activeDomain;

  const getCurveColor = useCallback((key) => {
    return curveColors[key] ?? defaultHex(key.split("__")[0]);
  }, [curveColors]);

  const getCurveFillColor = useCallback((key) => {
    return curveFillColors[key] ?? defaultHex(key.split("__")[0]);
  }, [curveFillColors]);

  const toggleCurve = useCallback((mnemonic, fileId) => {
    const key = `${mnemonic}__${fileId}`;
    setTracks(prev => {
      let found = false;
      const next = prev.map(t => {
        if (t.curves.includes(key)) {
          found = true;
          return { ...t, curves: t.curves.filter(c => c !== key) };
        }
        return t;
      }).filter(t => t.curves.length > 0);

      if (found) return next;

      setCurveColors(colors => colors[key] ? colors : { ...colors, [key]: defaultHex(mnemonic) });
      setCurveFillColors(fills => fills[key] ? fills : { ...fills, [key]: defaultHex(mnemonic) });
      return [...next, { id: crypto.randomUUID(), curves: [key] }];
    });
  }, []);

  const moveCurve = useCallback((wellId, trackIndex, curveIndex, direction) => {
    setTracks(prev => {
      const wellTrackIndices = [];
      prev.forEach((track, idx) => {
        if (track.curves.some(key => key.endsWith(`__${wellId}`))) {
          wellTrackIndices.push(idx);
        }
      });

      const targetWellTrackIndex = trackIndex + direction;
      if (targetWellTrackIndex < 0 || targetWellTrackIndex >= wellTrackIndices.length) return prev;

      const sourceGlobalIdx = wellTrackIndices[trackIndex];
      const targetGlobalIdx = wellTrackIndices[targetWellTrackIndex];

      const newTracks = JSON.parse(JSON.stringify(prev));
      const wellCurvesInSource = newTracks[sourceGlobalIdx].curves.filter(key => key.endsWith(`__${wellId}`));
      const curveKey = wellCurvesInSource[curveIndex];

      newTracks[sourceGlobalIdx].curves = newTracks[sourceGlobalIdx].curves.filter(c => c !== curveKey);
      newTracks[targetGlobalIdx].curves.push(curveKey);

      return newTracks.filter(t => t.curves.length > 0);
    });
  }, []);

  const handleFile = useCallback((e) => {
    Array.from(e.target.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const parsed = parseLAS(evt.target.result);
          const nullVal = parsed.metadata?.well?.NULL ? Number(parsed.metadata.well.NULL.value) : -9999;
          const id = crypto.randomUUID();
          const wellName = parsed.metadata?.well?.WELL?.value || file.name;
          const guessed = guessUtmSettings(wellName, parsed.metadata?.well);
          setFiles(prev => [...prev, {
            id,
            name: file.name,
            parsed,
            nullValue: nullVal,
            depthCurve: parsed.curves[0]?.mnemonic ?? "DEPT",
            originalData: JSON.parse(JSON.stringify(parsed.data)),
            undoStack: [],
            redoStack: [],
            utmZone: guessed.zone,
            utmNorthern: guessed.northern
          }]);
          setActiveFileId(id);
          setSelectedWellIds(prev => [...prev, id]);
          resetZoom();
        } catch (err) {
          console.error(err);
          setError(`Erro ao parsear ${file.name}`);
        }
      };
      reader.readAsText(file);
    });
    e.target.value = "";
  }, [resetZoom]);

  const removeFile = useCallback((id) => {
    setFiles(prev => {
      const remaining = prev.filter(f => f.id !== id);
      if (activeFileId === id && remaining.length > 0) setActiveFileId(remaining[remaining.length - 1].id);
      return remaining;
    });
    setSelectedWellIds(prev => prev.filter(wellId => wellId !== id));
    setWellCoords(prev => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    setTracks(prev => prev.map(t => ({ ...t, curves: t.curves.filter(k => !k.endsWith(`__${id}`)) })).filter(t => t.curves.length > 0));
    setCurveColors(prev => { const n = { ...prev }; Object.keys(n).forEach(k => { if (k.endsWith(`__${id}`)) delete n[k]; }); return n; });
    setCurveFillColors(prev => { const n = { ...prev }; Object.keys(n).forEach(k => { if (k.endsWith(`__${id}`)) delete n[k]; }); return n; });
    setCurveScale(prev => { const n = { ...prev }; Object.keys(n).forEach(k => { if (k.endsWith(`__${id}`)) delete n[k]; }); return n; });
    resetZoom();
  }, [activeFileId, resetZoom]);

  const handlePinCoord = useCallback((fileId, lat, lng) => {
    setWellCoords(prev => ({
      ...prev,
      [fileId]: { lat, lng }
    }));
    setPinningWellId(null);
  }, []);

  function exportCsv() {
    if (!activeFile) return;
    const { parsed, name, nullValue } = activeFile;
    const headers = parsed.curves.map(c => c.mnemonic);
    const rows = parsed.data.map(row => headers.map(h => {
      const val = row[h];
      return (val != null && val !== nullValue) ? val : "";
    }).join(","));
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name.replace(/\.las$/i, "") + ".csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const handleUndo = useCallback(() => {
    if (!activeFile || !activeFile.undoStack || activeFile.undoStack.length === 0) return;
    setFiles(prev => prev.map(f => {
      if (f.id !== activeFile.id) return f;
      const newUndoStack = [...f.undoStack];
      const previousData = newUndoStack.pop();
      const currentData = JSON.parse(JSON.stringify(f.parsed.data));
      const newRedoStack = [...(f.redoStack || []), currentData];
      return {
        ...f,
        undoStack: newUndoStack,
        redoStack: newRedoStack,
        parsed: { ...f.parsed, data: previousData }
      };
    }));
  }, [activeFile]);

  const handleRedo = useCallback(() => {
    if (!activeFile || !activeFile.redoStack || activeFile.redoStack.length === 0) return;
    setFiles(prev => prev.map(f => {
      if (f.id !== activeFile.id) return f;
      const newRedoStack = [...f.redoStack];
      const nextData = newRedoStack.pop();
      const currentData = JSON.parse(JSON.stringify(f.parsed.data));
      const newUndoStack = [...(f.undoStack || []), currentData];
      return {
        ...f,
        undoStack: newUndoStack,
        redoStack: newRedoStack,
        parsed: { ...f.parsed, data: nextData }
      };
    }));
  }, [activeFile]);

  const handleSaveEdit = useCallback((rowIndex, mnemonic, finalVal) => {
    if (!activeFile) return;
    setFiles(prev => prev.map(f => {
      if (f.id !== activeFile.id) return f;
      const currentData = JSON.parse(JSON.stringify(f.parsed.data));
      const newUndoStack = [...(f.undoStack || []), currentData];
      const newData = [...f.parsed.data];
      newData[rowIndex] = { ...newData[rowIndex], [mnemonic]: finalVal };
      return {
        ...f,
        undoStack: newUndoStack,
        redoStack: [], // clear redo
        parsed: {
          ...f.parsed,
          data: newData
        }
      };
    }));
  }, [activeFile]);

  const handleBulkReplace = useCallback((curve, targetVal, nVal, isNull) => {
    if (!activeFile) return;
    const targetValNum = parseFloat(targetVal);

    setFiles(prev => prev.map(f => {
      if (f.id !== activeFile.id) return f;

      const currentData = JSON.parse(JSON.stringify(f.parsed.data));
      const newUndoStack = [...(f.undoStack || []), currentData];

      const newData = f.parsed.data.map(row => {
        const currentVal = row[curve];
        let match = false;
        if (isNull) {
          match = currentVal === f.nullValue || currentVal == null || isNaN(currentVal);
        } else {
          match = currentVal === targetValNum;
        }

        if (match) {
          return { ...row, [curve]: nVal };
        }
        return row;
      });

      return {
        ...f,
        undoStack: newUndoStack,
        redoStack: [], // clear redo
        parsed: {
          ...f.parsed,
          data: newData
        }
      };
    }));
    alert("Substituição em lote concluída com sucesso!");
  }, [activeFile]);

  const wellsData = useMemo(() => {
    return selectedWellIds.map(wellId => {
      const file = files.find(f => f.id === wellId);
      if (!file) return null;

      // 1. Pre-filter tracks that contain curves for this well to avoid redundant evaluation
      const wellTracks = tracks
        .filter(track => track.curves.some(key => key.endsWith(`__${wellId}`)))
        .map(track => {
          const metas = track.curves
            .filter(key => key.endsWith(`__${wellId}`))
            .map(key => {
              const mnemonic = key.split("__")[0];
              const curveInfo = file.parsed.curves.find(c => c.mnemonic === mnemonic);

              // 2. Compute stats in a single pass without copying/allocating arrays
              let minVal = Infinity;
              let maxVal = -Infinity;
              let minDepth = Infinity;
              let maxDepth = -Infinity;
              let hasValid = false;

              const data = file.parsed.data;
              const n = data.length;
              const nullValue = file.nullValue;
              const depthCurve = file.depthCurve;

              for (let idx = 0; idx < n; idx++) {
                const r = data[idx];
                const v = r[mnemonic];
                const d = r[depthCurve];
                if (typeof v === "number" && !isNaN(v) && v !== nullValue &&
                  typeof d === "number" && !isNaN(d) && d !== nullValue) {
                  if (v < minVal) minVal = v;
                  if (v > maxVal) maxVal = v;
                  if (d < minDepth) minDepth = d;
                  if (d > maxDepth) maxDepth = d;
                  hasValid = true;
                }
              }

              const stats = hasValid ? {
                min: minVal,
                max: maxVal,
                minDepth,
                maxDepth
              } : null;

              return {
                key,
                mnemonic,
                fileId: wellId,
                file,
                fileName: file.name,
                curveInfo,
                stats,
                color: getCurveColor(key),
                fillColor: getCurveFillColor(key)
              };
            })
            .filter(Boolean);

          if (metas.length === 0) return null;

          // 3. Downsample data inline to at most 2,000 points during data mapping
          let mergedData = [];
          const data = file.parsed.data;
          const n = data.length;
          const MAX_POINTS = 2000;
          const step = n > MAX_POINTS ? Math.ceil(n / MAX_POINTS) : 1;

          if (metas.length === 1) {
            const meta = metas[0];
            const mnemonic = meta.mnemonic;
            const depthCurve = meta.file.depthCurve;
            const nullValue = meta.file.nullValue;
            const key = meta.key;

            for (let idx = 0; idx < n; idx += step) {
              const r = data[idx];
              if (!r) continue;
              const d = r[depthCurve];
              const val = r[mnemonic];
              if (typeof d === "number" && !isNaN(d) && d !== nullValue &&
                typeof val === "number" && !isNaN(val) && val !== nullValue) {
                mergedData.push({ depth: d, [key]: val });
              }
            }
          } else {
            // For multiple curves inside the same track, do inline downsampling as well
            const dataMap = new Map();
            metas.forEach(meta => {
              const mnemonic = meta.mnemonic;
              const depthCurve = meta.file.depthCurve;
              const nullValue = meta.file.nullValue;
              const key = meta.key;

              for (let idx = 0; idx < n; idx += step) {
                const r = data[idx];
                if (!r) continue;
                const d = r[depthCurve];
                const val = r[mnemonic];
                if (typeof d === "number" && !isNaN(d) && d !== nullValue &&
                  typeof val === "number" && !isNaN(val) && val !== nullValue) {
                  if (!dataMap.has(d)) dataMap.set(d, { depth: d });
                  dataMap.get(d)[key] = val;
                }
              }
            });
            mergedData = Array.from(dataMap.values()).sort((a, b) => a.depth - b.depth);
          }

          return { ...track, metas, mergedData };
        }).filter(Boolean);

      return {
        wellId,
        wellName: file.parsed.metadata?.well?.WELL?.value || file.name.replace(/\.las$/i, ""),
        tracks: wellTracks
      };
    }).filter(Boolean).filter(w => w.tracks.length > 0);
  }, [tracks, files, getCurveColor, getCurveFillColor, selectedWellIds]);

  const selectedCurvesMeta = useMemo(() => {
    return wellsData.flatMap(w => w.tracks.flatMap(t => t.metas));
  }, [wellsData]);

  const activeWellsTitle = useMemo(() => {
    const selectedFiles = files.filter(f => selectedWellIds.includes(f.id));
    if (selectedFiles.length === 0) return "";
    const names = selectedFiles.map(f => f.parsed.metadata?.well?.WELL?.value || f.name.replace(/\.las$/i, ""));
    return names.join(" / ");
  }, [files, selectedWellIds]);

  const summaryStats = useMemo(() => {
    return selectedCurvesMeta.map(meta => {
      if (!meta.stats) return null;
      const file = files.find(f => f.id === meta.fileId);
      if (!file) return null;
      const values = file.parsed.data.map(r => r[meta.mnemonic]).filter(v => typeof v === "number" && v !== file.nullValue);
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      return { key: meta.key, name: files.length > 1 ? `${meta.mnemonic} (${meta.fileName.replace(".las", "")})` : meta.mnemonic, min: meta.stats.min, max: meta.stats.max, avg, color: meta.color };
    }).filter(Boolean);
  }, [selectedCurvesMeta, files]);

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-300">
      
      {/* Top Header */}
      <Header
        handleFile={handleFile}
        setShowSidebar={setShowSidebar}
        handleUndo={handleUndo}
        handleRedo={handleRedo}
        activeFile={activeFile}
        exportCsv={exportCsv}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
      />

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row h-[calc(100vh-64px)]">
        {/* Left Column: Well Map & Coordinate Manager */}
        <WellManager
          files={files}
          wellCoords={wellCoords}
          selectedWellIds={selectedWellIds}
          activeFileId={activeFileId}
          onSelectWell={handleToggleWellSelection}
          pinningWellId={pinningWellId}
          setPinningWellId={setPinningWellId}
          onPinCoord={handlePinCoord}
          removeFile={removeFile}
          setFiles={setFiles}
          darkMode={darkMode}
        />

        {/* Right Column: Visualizer Charts / Tabular Table */}
        <section className="flex-1 h-full flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950/40">
          {/* Tab Switcher */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 px-6 py-2.5 flex-shrink-0">
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl">
              <button
                onClick={() => setActiveTab("grafico")}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold transition ${
                  activeTab === "grafico"
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm cursor-pointer"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                }`}
              >
                <span>Visualização Gráfica</span>
              </button>
              <button
                onClick={() => setActiveTab("tabela")}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold transition ${
                  activeTab === "tabela"
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm cursor-pointer"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                }`}
              >
                <span>Editor Tabular</span>
              </button>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-2">
              {activeFile ? (
                <>
                  <span>Total de poços: <span className="text-slate-800 dark:text-slate-200">{files.length}</span></span>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <span>Poço ativo: <span className="text-cyan-600 dark:text-cyan-400 font-bold">{activeFile.parsed.metadata?.well?.WELL?.value || activeFile.name.replace(".las", "")}</span></span>
                </>
              ) : (
                <span>Nenhum poço carregado</span>
              )}
            </div>
          </div>

          {error && (
            <div className="m-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 dark:bg-red-950/40 p-3 text-xs text-red-600 dark:text-red-300 flex-shrink-0">
              <AlertCircle size={14} />
              <span>{error}</span>
              <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-650"><X size={12} /></button>
            </div>
          )}

          {/* Panel Scrollable Area */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
            {activeTab === "grafico" ? (
              <ChartsView
                activeWellsTitle={activeWellsTitle}
                zoomDomain={zoomDomain}
                resetZoom={resetZoom}
                colWidth={colWidth}
                setColWidth={setColWidth}
                selectedCurves={selectedCurves}
                wellsData={wellsData}
                moveCurve={moveCurve}
                curveReversed={curveReversed}
                setCurveReversed={setCurveReversed}
                curveFilled={curveFilled}
                setCurveFilled={setCurveFilled}
                curveColors={curveColors}
                setCurveColors={setCurveColors}
                curveFillColors={curveFillColors}
                setCurveFillColors={setCurveFillColors}
                curveScale={curveScale}
                setCurveScale={setCurveScale}
                activeDomain={activeDomain}
                containerRef={containerRef}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                selectStart={selectStart}
                selectEnd={selectEnd}
                files={files}
                darkMode={darkMode}
                maxCurvesLimit={maxCurvesLimit}
                setMaxCurvesLimit={setMaxCurvesLimit}
              />
            ) : (
              <TabularEditor
                activeFile={activeFile}
                files={files}
                setActiveFileId={setActiveFileId}
                onSaveEdit={handleSaveEdit}
                onBulkReplace={handleBulkReplace}
              />
            )}

            {/* Statistics Cards */}
            <StatsSection summaryStats={summaryStats} />
          </div>
        </section>
      </div>

      {/* Side Drawer for Curve Selection */}
      <CurveSelector
        showSidebar={showSidebar}
        setShowSidebar={setShowSidebar}
        files={files}
        sidebarWellId={sidebarWellId}
        setSidebarWellId={setSidebarWellId}
        activeFileId={activeFileId}
        selectedCurves={selectedCurves}
        toggleCurve={toggleCurve}
        getCurveColor={getCurveColor}
      />
    </div>
  );
}
