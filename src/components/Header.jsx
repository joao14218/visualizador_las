import React from "react";
import { Upload, FileText, Undo2, Redo2, Download, Sun, Moon } from "lucide-react";

export default function Header({
  handleFile,
  setShowSidebar,
  handleUndo,
  handleRedo,
  activeFile,
  exportCsv,
  darkMode,
  setDarkMode,
}) {
  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 px-6 flex items-center justify-between shadow-xs z-30 flex-shrink-0">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-sm font-bold tracking-tight m-0 text-slate-900 dark:text-white">LAS Seismic Viewer</h1>
        </div>
      </div>

      {/* Unified compact toolbar */}
      <div className="flex items-center gap-3">
        {/* File input "+" button */}
        <label className="flex items-center gap-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 dark:bg-cyan-400 dark:hover:bg-cyan-300 text-slate-950 px-3.5 py-2 text-xs font-bold transition shadow-xs cursor-pointer">
          <Upload size={14} />
          <span>Abrir LAS</span>
          <input type="file" accept=".las,.txt" multiple className="hidden" onChange={handleFile} />
        </label>

        {/* Selecionar curvas */}
        <button
          onClick={() => setShowSidebar(true)}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-3.5 py-2 text-xs font-bold transition hover:bg-slate-50 dark:hover:bg-slate-700 shadow-xs cursor-pointer"
        >
          <FileText size={14} />
          <span>Selecionar curvas</span>
        </button>

        {/* Undo/Redo Word-like buttons */}
        <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 overflow-hidden shadow-xs">
          <button
            onClick={handleUndo}
            disabled={!activeFile || !activeFile.undoStack || activeFile.undoStack.length === 0}
            title="Desfazer (Undo)"
            className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white disabled:opacity-20 disabled:cursor-not-allowed border-r border-slate-200 dark:border-slate-700 cursor-pointer"
          >
            <Undo2 size={15} />
          </button>
          <button
            onClick={handleRedo}
            disabled={!activeFile || !activeFile.redoStack || activeFile.redoStack.length === 0}
            title="Refazer (Redo)"
            className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
          >
            <Redo2 size={15} />
          </button>
        </div>

        {/* CSV Export */}
        <button
          onClick={exportCsv}
          disabled={!activeFile}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-3.5 py-2 text-xs font-bold transition hover:bg-slate-50 dark:hover:bg-slate-700 shadow-xs disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <Download size={14} />
          <span>Exportar CSV</span>
        </button>

        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer shadow-xs"
          title={darkMode ? "Modo Claro" : "Modo Escuro"}
        >
          {darkMode ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );
}
