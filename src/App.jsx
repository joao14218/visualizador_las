import React, { useCallback, useMemo, useRef, useState } from "react";
import { Upload, FileText, LineChart as LineChartIcon, AlertCircle, Search, Download, X, ZoomIn, Undo2, Redo2, Sun, Moon } from "lucide-react";
import WellMap from "./components/WellMap";
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

function Card({ children, className }) {
  return <div className={className}>{children}</div>;
}
function CardContent({ children, className }) {
  return <div className={className}>{children}</div>;
}

function ColorPicker({ value, onCommit }) {
  const ref = useRef(null);
  const [localColor, setLocalColor] = useState(value);
  // Sincroniza a cor se ela mudar externamente (ex: desfazer/refazer)
  React.useEffect(() => {
    setLocalColor(value);
  }, [value]);
  // Aplica a mudança no gráfico apenas ao terminar o arrasto (evento nativo change)
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleChange = (e) => {
      onCommit(e.target.value);
    };
    el.addEventListener("change", handleChange);
    return () => {
      el.removeEventListener("change", handleChange);
    };
  }, [onCommit]);
  return (
    <input ref={ref} type="color" value={localColor}
      onChange={e => setLocalColor(e.target.value)}
      title="Escolher cor"
      style={{ width: 18, height: 18, padding: 0, border: "2px solid rgba(255,255,255,0.3)", borderRadius: "50%", cursor: "pointer", background: "none", WebkitAppearance: "none", appearance: "none", overflow: "hidden" }}
    />
  );
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

function hslToHex(hsl) {
  const [h, s, l] = hsl.match(/\d+/g).map(Number);
  const sl = s / 100, ll = l / 100;
  const a = sl * Math.min(ll, 1 - ll);
  const f = n => {
    const k = (n + h / 30) % 12;
    const val = ll - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * val).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function defaultHex(mnemonic) {
  let hash = 0;
  for (let i = 0; i < mnemonic.length; i++) {
    hash = (hash * 31 + mnemonic.charCodeAt(i)) >>> 0;
  }
  return hslToHex(`hsl(${hash % 360}, 75%, 60%)`);
}

// ─── Parser de Coordenadas ────────────────────────────────────────────────────

function parseCoordinate(raw) {
  if (raw == null) return null;
  const str = String(raw).trim();
  if (!str || str === "." || str === "0") return null;

  // Decimal simples: "-23.456" ou "23.456"
  const decimal = Number(str);
  if (!isNaN(decimal) && str.match(/^-?\d+\.?\d*$/)) {
    return Math.abs(decimal) <= 180 ? decimal : null;
  }

  // DMS: "28 13 45.2 N" ou "28d13'45.2\"S"
  const dms = str.match(/(-?\d+)[°d\s]+(\d+)['\'\s]+(\d+\.?\d*)[\"\"\s]*([NSEWnsew])?/);
  if (dms) {
    let deg = Math.abs(Number(dms[1])) + Number(dms[2]) / 60 + Number(dms[3]) / 3600;
    const dir = (dms[4] || "").toUpperCase();
    if (dir === "S" || dir === "W" || Number(dms[1]) < 0) deg = -deg;
    return Math.abs(deg) <= 180 ? deg : null;
  }

  return null;
}

function getWellCoordinates(wellMeta, utmZone, northern = false) {
  if (!wellMeta) return null;

  // 1. Tentar lat/lng direto
  const latKeys = ["LATI", "LAT", "LATITUDE", "XLAT"];
  const lngKeys = ["LONG", "LON", "LNG", "LONGITUDE", "XLON", "XLONG"];

  let lat = null, lng = null;
  for (const k of latKeys) {
    if (wellMeta[k]) { lat = parseCoordinate(wellMeta[k].value); if (lat != null) break; }
  }
  for (const k of lngKeys) {
    if (wellMeta[k]) { lng = parseCoordinate(wellMeta[k].value); if (lng != null) break; }
  }

  if (lat != null && lng != null) {
    return { lat, lng };
  }

  // 2. Tentar UTM
  const eastKeys = ["EAST", "EASTING", "X", "UTMX"];
  const northKeys = ["NORTH", "NORTHING", "Y", "UTMY"];

  let easting = null, northing = null;
  for (const k of eastKeys) {
    if (wellMeta[k]) {
      const v = Number(String(wellMeta[k].value).replace(/[^\d.-]/g, ""));
      if (!isNaN(v) && v > 0) { easting = v; break; }
    }
  }
  for (const k of northKeys) {
    if (wellMeta[k]) {
      const v = Number(String(wellMeta[k].value).replace(/[^\d.-]/g, ""));
      if (!isNaN(v) && v > 0) { northing = v; break; }
    }
  }

  // 3. Procurar em QUALQUER chave de metadados por padrões tipo "X = ... Y = ..." ou similar (ex: LOC)
  if (easting == null || northing == null) {
    for (const key of Object.keys(wellMeta)) {
      const valStr = String(wellMeta[key]?.value || "");
      const matchXY = valStr.match(/X\s*[:=]\s*([\d.-]+)[,\s]*Y\s*[:=]\s*([\d.-]+)/i) ||
        valStr.match(/X\s*[:=]\s*([\d.-]+).*?Y\s*[:=]\s*([\d.-]+)/i);
      if (matchXY) {
        const e = parseFloat(matchXY[1]);
        const n = parseFloat(matchXY[2]);
        if (!isNaN(e) && !isNaN(n)) {
          easting = e;
          northing = n;
          break;
        }
      }
    }
  }

  if (easting != null && northing != null) {
    return utmToLatLng(easting, northing, utmZone || 23, northern);
  }

  return null;
}

function utmToLatLng(easting, northing, zone, northern = true) {
  const sa = 6378137.0;
  const sb = 6356752.314245;

  const e2 = (Math.pow(sa, 2) - Math.pow(sb, 2)) / Math.pow(sa, 2);
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const x = easting - 500000.0;
  const y = northern ? northing : northing - 10000000.0;

  const k0 = 0.9996;

  const arc = y / k0;
  const mu = arc / (sa * (1 - e2 / 4.0 - 3.0 * e2 * e2 / 64.0 - 5.0 * e2 * e2 * e2 / 256.0));

  const phi1 = mu + (3.0 * e1 / 2.0 - 27.0 * Math.pow(e1, 3) / 32.0) * Math.sin(2.0 * mu)
    + (21.0 * e1 * e1 / 16.0 - 55.0 * Math.pow(e1, 4) / 32.0) * Math.sin(4.0 * mu)
    + (151.0 * Math.pow(e1, 3) / 96.0) * Math.sin(6.0 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const N1 = sa / Math.sqrt(1.0 - e2 * sinPhi1 * sinPhi1);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = e2 / (1.0 - e2) * cosPhi1 * cosPhi1;
  const R1 = sa * (1.0 - e2) / Math.pow(1.0 - e2 * sinPhi1 * sinPhi1, 1.5);
  const D = x / (N1 * k0);

  const lat = phi1 - (N1 * tanPhi1 / R1) * (
    Math.pow(D, 2) / 2.0
    - (5.0 + 3.0 * T1 + 10.0 * C1 - 4.0 * C1 * C1 - 9.0 * (e2 / (1.0 - e2))) * Math.pow(D, 4) / 24.0
    + (61.0 + 90.0 * T1 + 298.0 * C1 + 45.0 * T1 * T1 - 252.0 * (e2 / (1.0 - e2)) - 3.0 * C1 * C1) * Math.pow(D, 6) / 720.0
  );

  const lon0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180.0;
  const lng = lon0 + (
    D
    - (1.0 + 2.0 * T1 + C1) * Math.pow(D, 3) / 6.0
    + (5.0 - 2.0 * C1 + 28.0 * T1 - 3.0 * C1 * C1 + 8.0 * (e2 / (1.0 - e2)) + 24.0 * Math.pow(T1, 2)) * Math.pow(D, 5) / 120.0
  ) / cosPhi1;

  return { lat: lat * 180.0 / Math.PI, lng: lng * 180.0 / Math.PI };
}

// ─── Detector de UTM Automático ───────────────────────────────────────────────

function guessUtmSettings(wellName, wellMeta) {
  let zone = 23;
  let northern = false; // Default to Brazil (Zone 23S)

  if (!wellMeta) return { zone, northern };

  // 1. Tentar extrair de chaves conhecidas de UTM Zone
  const zoneKeys = ["ZONE", "UTMZ", "HZON", "UTM"];
  for (const k of zoneKeys) {
    if (wellMeta[k]) {
      const valStr = String(wellMeta[k].value).toUpperCase();
      const match = valStr.match(/(\d+)/);
      if (match) {
        zone = parseInt(match[1]);
        // Tenta detectar o hemisfério no valor da string
        if (valStr.includes("N")) {
          northern = true;
        } else if (valStr.includes("S")) {
          northern = false;
        } else {
          // Se não houver indicador, assume hemisfério norte para zonas comuns europeias (Mar do Norte)
          // Zonas do Mar do Norte / Europa são tipicamente 30N, 31N, 32N.
          // Zonas do Brasil são tipicamente 22S, 23S, 24S.
          if (zone >= 28 && zone <= 35) {
            northern = true;
          } else {
            northern = false;
          }
        }
        return { zone, northern };
      }
    }
  }

  // 2. Tentar deduzir pelo nome do poço se falhar a detecção acima
  const nameUpper = String(wellName).toUpperCase();
  if (nameUpper.includes("RJS") || nameUpper.includes("SPS") || nameUpper.includes("ESS") || nameUpper.includes("BRSA") || nameUpper.includes("CAMPOS") || nameUpper.includes("SANTOS")) {
    zone = 23;
    northern = false;
  } else if (nameUpper.startsWith("F0") || nameUpper.startsWith("F3") || nameUpper.startsWith("F-") || nameUpper.startsWith("F_") || nameUpper.includes("NORTHSEA")) {
    zone = 31;
    northern = true;
  }

  return { zone, northern };
}

// ─── Parser LAS ───────────────────────────────────────────────────────────────

function parseLAS(text) {
  console.log("Iniciando parseLAS. Tamanho do texto:", text.length);
  const lines = text.replace(/\r/g, "").split("\n");
  const curves = [], data = [];
  const metadata = { well: {}, version: {}, params: {} };
  let section = "", inAscii = false;

  const cleanValue = v => v ? v.trim().replace(/^\.|\s+$/g, "") : "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("~")) {
      section = line.toUpperCase();
      inAscii = section.startsWith("~A");
      continue;
    }
    if (inAscii) {
      const values = line.split(/\s+/).map(Number);
      if (!values.every(Number.isNaN) && values.length >= curves.length && curves.length > 0) {
        const row = {};
        curves.forEach((c, i) => { row[c.mnemonic] = values[i]; });
        data.push(row);
      }
      continue;
    }
    if (section.startsWith("~C")) {
      const m = line.match(/^([^\.\s]+)\s*\.([^\s]*)\s*(.*?)\s*:\s*(.*)$/);
      if (m) curves.push({ mnemonic: m[1].trim(), unit: m[2].trim(), apiCode: m[3].trim(), description: m[4].trim() });
    }
    if (section.startsWith("~W") || section.startsWith("~V") || section.startsWith("~P")) {
      const m = line.match(/^([^\.\s]+)\s*\.([^\s]*)\s*(.*?)\s*:\s*(.*)$/);
      if (m) {
        const target = section.startsWith("~W") ? metadata.well : section.startsWith("~V") ? metadata.version : metadata.params;
        target[m[1].trim()] = { unit: m[2].trim(), value: cleanValue(m[3]), description: m[4].trim() };
      }
    }
  }

  console.log("Finalizando parseLAS. Total de curvas:", curves.length, "Total de dados:", data.length, "Metadata:", metadata);
  return { curves, data, metadata };
}

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

// ─── Hook de zoom via DOM ─────────────────────────────────────────────────────
// Converte posição Y do mouse dentro do container em valor de profundidade

function useZoom(activeDomainRef) {
  const [zoomDomain, setZoomDomain] = useState(null);
  const dragging = useRef(false);
  const startY = useRef(null);
  const endY = useRef(null);
  const containerRef = useRef(null);

  // px → valor de profundidade
  const pxToDepth = useCallback((clientY) => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    // margem interna do LineChart (top:10, bottom:20) + altura do XAxis (~30px)
    const marginTop = 40;
    const marginBottom = 20;
    const chartH = rect.height - marginTop - marginBottom;
    const relY = Math.max(0, Math.min(clientY - rect.top - marginTop, chartH));
    const ratio = relY / chartH;
    const [dMin, dMax] = activeDomainRef.current;
    return dMin + ratio * (dMax - dMin);
  }, []);

  const [selectStart, setSelectStart] = useState(null);
  const [selectEnd, setSelectEnd] = useState(null);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    const d = pxToDepth(e.clientY);
    startY.current = d;
    endY.current = d;
    setSelectStart(d);
    setSelectEnd(d);
  }, [pxToDepth]);

  const onMouseMove = useCallback((e) => {
    if (!dragging.current) return;
    const d = pxToDepth(e.clientY);
    endY.current = d;
    setSelectEnd(d);
  }, [pxToDepth]);

  const onMouseUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    const a = startY.current, b = endY.current;
    if (a != null && b != null && Math.abs(a - b) > 0.1) {
      setZoomDomain({ min: Math.min(a, b), max: Math.max(a, b) });
    }
    setSelectStart(null);
    setSelectEnd(null);
  }, []);

  const resetZoom = useCallback(() => setZoomDomain(null), []);

  return { zoomDomain, resetZoom, containerRef, onMouseDown, onMouseMove, onMouseUp, selectStart, selectEnd };
}

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

// ─── Componente principal ─────────────────────────────────────────────────────

export default function VisualizadorLAS() {
  const [files, setFiles] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [curveColors, setCurveColors] = useState({});
  const [curveReversed, setCurveReversed] = useState({});
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [activeFileId, setActiveFileId] = useState(null);
  const [selectedWellIds, setSelectedWellIds] = useState([]);
  const [sidebarWellId, setSidebarWellId] = useState(null);

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
  React.useEffect(() => {
    if (activeFileId) {
      setSidebarWellId(activeFileId);
    }
  }, [activeFileId]);
  const [colWidth, setColWidth] = useState(300);
  const [curveFilled, setCurveFilled] = useState({});
  const [activeTab, setActiveTab] = useState("grafico"); // "grafico" | "tabela"
  const [tablePage, setTablePage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [editingCell, setEditingCell] = useState(null); // { rowIndex, mnemonic }
  const [editValue, setEditValue] = useState("");
  const [depthSearchQuery, setDepthSearchQuery] = useState("");
  const [bulkReplaceConfig, setBulkReplaceConfig] = useState({ curve: "", targetVal: "", newVal: "", isNull: false });
  const [wellCoords, setWellCoords] = useState({});
  const [pinningWellId, setPinningWellId] = useState(null);
  const [darkMode, setDarkMode] = useState(false); // Default to Light mode to match reference image
  const [showSidebar, setShowSidebar] = useState(false);
  const [wellSearchQuery, setWellSearchQuery] = useState("");

  const filteredFiles = React.useMemo(() => {
    return files.filter(f => {
      const wellName = f.parsed.metadata?.well?.WELL?.value || f.name;
      return String(wellName).toLowerCase().includes(wellSearchQuery.toLowerCase());
    });
  }, [files, wellSearchQuery]);

  // Sync dark class on document element
  React.useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  // Recalcular coordenadas automaticamente ao carregar arquivos ou alterar fuso/hemisfério individual do poço
  React.useEffect(() => {
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

  // Inicializar tracks padrão se o gráfico estiver vazio e houver arquivos carregados
  React.useEffect(() => {
    if (files.length > 0 && tracks.length === 0) {
      const file = files[files.length - 1]; // pega o último arquivo carregado para inicializar as tracks dele
      const defaultCurves = file.parsed.curves.slice(1, 4).map(c => c.mnemonic);
      const newTracks = defaultCurves.map(m => ({
        id: crypto.randomUUID(),
        curves: [`${m}__${file.id}`]
      }));
      setTracks(newTracks);
    }
  }, [files, tracks.length]);

  React.useEffect(() => {
    setTablePage(0);
    setEditingCell(null);
  }, [activeFileId]);

  const selectedCurves = useMemo(() => tracks.flatMap(t => t.curves), [tracks]);

  const activeFile = useMemo(() => files.find(f => f.id === activeFileId) ?? files[0], [files, activeFileId]);

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
  const filteredCurves = useMemo(() =>
    curveOptions.filter(c => `${c.mnemonic} ${c.unit} ${c.description}`.toLowerCase().includes(query.toLowerCase())),
    [curveOptions, query]);

  // ── Domínio global de profundidade ───────────────────────────────────────────

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

  // Ref sempre atualizado para o hook de zoom acessar sem re-criar callbacks
  const activeDomainRef = useRef(globalDepthDomain);

  const { zoomDomain, resetZoom, containerRef, onMouseDown, onMouseMove, onMouseUp, selectStart, selectEnd } =
    useZoom(activeDomainRef);

  const activeDomain = zoomDomain ? [zoomDomain.min, zoomDomain.max] : globalDepthDomain;
  activeDomainRef.current = activeDomain;

  // ── Cores ─────────────────────────────────────────────────────────────────────

  const getCurveColor = useCallback((key) => {
    return curveColors[key] ?? defaultHex(key.split("__")[0]);
  }, [curveColors]);

  // ── Toggle curva ──────────────────────────────────────────────────────────────

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
      return [...next, { id: crypto.randomUUID(), curves: [key] }];
    });
  }, []);

  const moveCurve = useCallback((trackIndex, curveIndex, direction) => {
    setTracks(prev => {
      const newTracks = JSON.parse(JSON.stringify(prev));
      const targetTrackIndex = trackIndex + direction;
      if (targetTrackIndex < 0 || targetTrackIndex >= newTracks.length) return prev;
      const curveKey = newTracks[trackIndex].curves[curveIndex];
      newTracks[trackIndex].curves.splice(curveIndex, 1);
      newTracks[targetTrackIndex].curves.push(curveKey);
      return newTracks.filter(t => t.curves.length > 0);
    });
  }, []);

  // ── Carregar arquivos ─────────────────────────────────────────────────────────

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
          // Las coordinates will be automatically extracted by the useEffect hook
        } catch (err) {
          console.error(err);
          setError(`Erro ao parsear ${file.name}`);
        }
      };
      reader.readAsText(file);
    });
    e.target.value = "";
  }, [resetZoom]);

  // ── Remover arquivo ───────────────────────────────────────────────────────────

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
    resetZoom();
  }, [activeFileId, resetZoom]);

  const handlePinCoord = useCallback((fileId, lat, lng) => {
    setWellCoords(prev => ({
      ...prev,
      [fileId]: { lat, lng }
    }));
    setPinningWellId(null);
  }, []);

  // ── Exportar CSV ──────────────────────────────────────────────────────────────

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

  // ── Handlers do Editor Tabular ──────────────────────────────────────────────

  const handleStartEdit = useCallback((rowIndex, mnemonic, currentVal) => {
    setEditingCell({ rowIndex, mnemonic });
    setEditValue(currentVal == null || isNaN(currentVal) ? "" : String(currentVal));
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingCell || !activeFile) return;
    const { rowIndex, mnemonic } = editingCell;
    const floatVal = editValue.trim() === "" ? activeFile.nullValue : parseFloat(editValue);
    const finalVal = isNaN(floatVal) ? activeFile.nullValue : floatVal;

    // Check if the value actually changed to avoid adding duplicate states to the undo history
    if (activeFile.parsed.data[rowIndex][mnemonic] === finalVal) {
      setEditingCell(null);
      return;
    }

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
    setEditingCell(null);
  }, [editingCell, editValue, activeFile]);

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
    setEditingCell(null);
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
    setEditingCell(null);
  }, [activeFile]);

  const handleBulkReplace = useCallback(() => {
    if (!activeFile || !bulkReplaceConfig.curve) return;
    const { curve, targetVal, newVal, isNull } = bulkReplaceConfig;
    const nVal = parseFloat(newVal);
    if (isNaN(nVal)) return;

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

    setBulkReplaceConfig({ curve: "", targetVal: "", newVal: "", isNull: false });
    alert("Substituição em lote concluída com sucesso!");
  }, [activeFile, bulkReplaceConfig]);

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

  // ── Metadados de curvas selecionadas e Tracks ─────────────────────────────────

  const trackDataWithMeta = useMemo(() => {
    return tracks.map(track => {
      const metas = track.curves.map(key => {
        const [mnemonic, fileId] = key.split("__");
        if (!selectedWellIds.includes(fileId)) return null;
        const file = files.find(f => f.id === fileId);
        if (!file) return null;

        const curveInfo = file.parsed.curves.find(c => c.mnemonic === mnemonic);

        const rawDepths = [];
        const rawValues = [];
        file.parsed.data.forEach(r => {
          const v = r[mnemonic];
          const d = r[file.depthCurve];
          if (typeof v === "number" && !isNaN(v) && v !== file.nullValue &&
            typeof d === "number" && !isNaN(d) && d !== file.nullValue) {
            rawValues.push(v);
            rawDepths.push(d);
          }
        });

        const stats = rawValues.length > 0 ? {
          min: Math.min(...rawValues),
          max: Math.max(...rawValues),
          minDepth: Math.min(...rawDepths),
          maxDepth: Math.max(...rawDepths)
        } : null;

        return { key, mnemonic, fileId, file, fileName: file.name, curveInfo, stats, color: getCurveColor(key) };
      }).filter(Boolean);

      const dataMap = new Map();
      metas.forEach(meta => {
        meta.file.parsed.data.forEach(row => {
          const d = row[meta.file.depthCurve];
          const val = row[meta.mnemonic];
          if (typeof d === "number" && !isNaN(d) && d !== meta.file.nullValue &&
            typeof val === "number" && !isNaN(val) && val !== meta.file.nullValue) {
            if (!dataMap.has(d)) dataMap.set(d, { depth: d });
            dataMap.get(d)[meta.key] = val;
          }
        });
      });

      let mergedData = Array.from(dataMap.values()).sort((a, b) => a.depth - b.depth);

      // Otimização extrema para renderização:
      // Navegadores sofrem muito para renderizar milhares de "nós" SVG ao mesmo tempo.
      // Como a resolução de uma tela raramente passa de 2000 pixels verticais, desenhar mais 
      // de 2000 pontos é um desperdício que apenas sobrepõe pixels e trava a máquina (lag).
      const MAX_POINTS = 2000;
      if (mergedData.length > MAX_POINTS) {
        const step = Math.ceil(mergedData.length / MAX_POINTS);
        mergedData = mergedData.filter((_, i) => i % step === 0);
      }

      return { ...track, metas, mergedData };
    }).filter(t => t.metas.length > 0);
  }, [tracks, files, curveColors, getCurveColor, selectedWellIds]);

  const selectedCurvesMeta = useMemo(() => trackDataWithMeta.flatMap(t => t.metas), [trackDataWithMeta]);

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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-300">

      {/* Sleek top header */}
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

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row h-[calc(100vh-64px)]">

        {/* Left Column: Well Map */}
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
              <button onClick={() => setWellSearchQuery("")} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex-shrink-0">
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
              onSelectWell={handleToggleWellSelection}
              pinningWellId={pinningWellId}
              onPinCoord={handlePinCoord}
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
                          <div className="flex items-center justify-between gap-2 cursor-pointer" onClick={() => handleToggleWellSelection(f.id)}>
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
                                  className={`px-1.5 py-0.5 rounded text-[8px] font-bold transition ${pinningWellId === f.id ? "bg-cyan-500 text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-655 dark:text-slate-350 hover:bg-slate-300 dark:hover:bg-slate-750"
                                    }`}
                                >
                                  Fixar
                                </button>
                              )}
                              <button
                                onClick={e => { e.stopPropagation(); removeFile(f.id); }}
                                className="p-0.5 hover:text-red-500 text-slate-400 transition"
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

        {/* Right Column: Visualizer Charts / Tabular Table */}
        <section className="flex-1 h-full flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950/40">

          {/* Tab Switcher */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 px-6 py-2.5 flex-shrink-0">
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl">
              <button
                onClick={() => setActiveTab("grafico")}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold transition ${activeTab === "grafico"
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm cursor-pointer"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  }`}
              >
                <LineChartIcon size={13} />
                <span>Visualização Gráfica</span>
              </button>
              <button
                onClick={() => setActiveTab("tabela")}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold transition ${activeTab === "tabela"
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm cursor-pointer"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  }`}
              >
                <FileText size={13} />
                <span>Editor Tabular</span>
              </button>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-2">
              {activeFile ? (
                <>
                  <span>Total de poços: <span className="text-slate-800 dark:text-slate-200">{files.length}</span></span>
                  <span className="text-slate-350 dark:text-slate-700">|</span>
                  <span>Poço ativo: <span className="text-cyan-600 dark:text-cyan-400 font-bold">{activeFile.parsed.metadata?.well?.WELL?.value || activeFile.name.replace(".las", "")}</span></span>
                </>
              ) : (
                <span>Nenhum poço carregado</span>
              )}
            </div>
          </div>

          {error && (
            <div className="m-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 dark:bg-red-950/40 p-3 text-xs text-red-650 dark:text-red-300 flex-shrink-0">
              <AlertCircle size={14} />
              <span>{error}</span>
              <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-600"><X size={12} /></button>
            </div>
          )}

          {/* Panel Scrollable Area */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">

            {activeTab === "grafico" ? (
              /* GRAPHIC CHARTS VIEW */
              <div className="bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-xs flex flex-col p-4">

                {/* Visualizer header/toolbar */}
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-3 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <LineChartIcon className="text-cyan-600 dark:text-cyan-400" size={18} />
                    <div>
                      <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200">Curvas do Poço {activeWellsTitle ? `(${activeWellsTitle})` : ""}</h2>
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
                        type="number" min={120} max={800} step={10} value={colWidth}
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
                          : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-600 cursor-not-allowed")}
                    >
                      <ZoomIn size={12} />
                      <span>Resetar zoom</span>
                    </button>

                    <p className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-350 px-3 py-1 font-bold text-[9px]">
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
                                  <button onClick={() => moveCurve(trackIndex, metaIndex, -1)} disabled={trackIndex === 0} title="Mover para track anterior" className="p-1 hover:bg-slate-250 dark:hover:bg-slate-700 bg-slate-100 dark:bg-slate-850 rounded text-cyan-600 dark:text-cyan-400 disabled:opacity-20 cursor-pointer text-[10px]">{"<"}</button>
                                </div>
                                <div className="absolute top-2 right-2 opacity-30 hover:opacity-100 transition-opacity z-10">
                                  <button onClick={() => moveCurve(trackIndex, metaIndex, 1)} disabled={trackIndex === trackDataWithMeta.length - 1} title="Mover para próxima track" className="p-1 hover:bg-slate-250 dark:hover:bg-slate-700 bg-slate-100 dark:bg-slate-850 rounded text-cyan-600 dark:text-cyan-400 disabled:opacity-20 cursor-pointer text-[10px]">{">"}</button>
                                </div>

                                <div className="flex items-center justify-center gap-1.5">
                                  <h3 className="font-bold text-xs text-slate-800 dark:text-cyan-200">{meta.mnemonic}</h3>
                                  <ColorPicker value={meta.color} onCommit={c => setCurveColors(prev => ({ ...prev, [meta.key]: c }))} />
                                </div>
                                {files.length > 1 && <p className="text-[8px] text-slate-400 truncate">{meta.fileName}</p>}
                                <p className="text-[10px] text-slate-400">{meta.curveInfo?.unit || "—"}</p>

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
                                        <input type="checkbox" checked={!!curveReversed[meta.key]}
                                          onChange={e => setCurveReversed(p => ({ ...p, [meta.key]: e.target.checked }))}
                                          className="accent-cyan-500 scale-75" />
                                        Inverter
                                      </label>
                                      <label className="flex items-center gap-0.5 cursor-pointer text-[9px] text-slate-400 hover:text-cyan-550 transition-colors">
                                        <input type="checkbox" checked={curveFilled[meta.key] !== false}
                                          onChange={e => setCurveFilled(p => ({ ...p, [meta.key]: e.target.checked }))}
                                          className="accent-cyan-500 scale-75" />
                                        Preencher
                                      </label>
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
                                      <XAxis key={meta.key} xAxisId={meta.key} type="number" dataKey={meta.key} orientation="top" stroke={meta.color} tick={{ fontSize: 9, fill: meta.color }} domain={["auto", "auto"]} scale="auto" reversed={isReversed} allowDataOverflow={true} axisLine={false} tickLine={false} height={20} />
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
                                        <text x={x} y={y} dy={4} textAnchor="end" fill={isExtra ? (darkMode ? "#22d3ee" : "#0e7490") : "#94a3b8"} fontSize={9} fontWeight={isExtra ? "bold" : "normal"}>
                                          {val.toFixed(1)}
                                        </text>
                                      );
                                    }}
                                  />

                                  <Tooltip contentStyle={{ background: darkMode ? "#020617" : "#f4f5f8", border: "1px solid rgba(148,163,184,0.3)", borderRadius: 12 }} labelStyle={{ color: darkMode ? "#e2e8f0" : "#0f172a" }} isAnimationActive={false} />

                                  {track.metas.map((meta, i) => {
                                    const displayName = files.length > 1
                                      ? `${meta.mnemonic} (${meta.fileName.replace(/\.las$/i, "")})`
                                      : meta.mnemonic;
                                    return (
                                      <Area key={meta.key} xAxisId={meta.key} yAxisId={0} type="monotone" dataKey={meta.key} name={displayName} stroke={meta.color} fill={meta.color} fillOpacity={curveFilled[meta.key] !== false ? 0.15 : 0} baseValue="dataMin" dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
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
                                    <ReferenceArea yAxisId={0} y1={Math.min(selectStart, selectEnd)} y2={Math.max(selectStart, selectEnd)} fill="rgba(34,211,238,0.1)" stroke="#22d3ee" strokeOpacity={0.5} strokeDasharray="4 2" />
                                  )}
                                </AreaChart>
                              </ResponsiveContainer>

                              <div ref={trackIndex === 0 ? containerRef : null} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} style={{ position: "absolute", inset: 0, cursor: "crosshair" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* TABULAR EDITOR VIEW */
              <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-xs flex flex-col p-4">
                {!activeFile ? (
                  <div className="flex h-[350px] items-center justify-center text-slate-400 text-sm">
                    Carregue um arquivo LAS para utilizar o Editor Tabular.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 flex-shrink-0">
                      <div>
                        <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200">Editor de Curvas Tabular</h2>
                        <p className="text-[10px] text-slate-400">
                          Edite valores clicando duas vezes nas células. As alterações atualizam os gráficos instantaneamente.
                        </p>
                      </div>
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
                            {activeFile.parsed.curves.slice(1).map(c => (
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
                          onClick={handleBulkReplace}
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
                        <thead className="sticky top-0 bg-slate-550 dark:bg-slate-900 z-10 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="px-4 py-2 font-bold text-cyan-600 dark:text-cyan-400 w-32 border-r border-slate-100 dark:border-slate-800/50">
                              Profundidade ({activeFile.depthCurve})
                            </th>
                            {activeFile.parsed.curves.slice(1).map(c => (
                              <th key={c.mnemonic} className="px-4 py-2 font-semibold text-slate-700 dark:text-slate-200 border-r border-slate-100 dark:border-slate-800/50">
                                <div>{c.mnemonic}</div>
                                <div className="text-[9px] text-slate-400 font-normal">{c.unit || "—"}</div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {activeFile.parsed.data.slice(tablePage * pageSize, Math.min((tablePage + 1) * pageSize, activeFile.parsed.data.length)).map((row, relativeIdx) => {
                            const globalIdx = (tablePage * pageSize) + relativeIdx;
                            const depthVal = row[activeFile.depthCurve];

                            return (
                              <tr key={globalIdx} id={`row-${globalIdx}`} className="border-b border-slate-100 dark:border-slate-900 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                                <td className="px-4 py-2 font-mono text-[11px] text-cyan-600 dark:text-cyan-400 bg-slate-550/50 dark:bg-slate-900/20 border-r border-slate-150 dark:border-slate-800/50">
                                  {typeof depthVal === "number" ? depthVal.toFixed(2) : depthVal}
                                </td>

                                {activeFile.parsed.curves.slice(1).map(c => {
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
                                      className={`px-4 py-2 font-mono text-[11px] border-r border-slate-100 dark:border-slate-800/50 cursor-pointer relative group transition-colors ${isModified ? "bg-amber-500/5 text-amber-600 dark:text-amber-200" : isNull ? "text-slate-400 dark:text-slate-650" : "text-slate-700 dark:text-slate-205"
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
                                          className="w-full bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-[11px] px-1 py-0.5 rounded border border-cyan-400 outline-none"
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
                        <span className="text-slate-700 dark:text-slate-200 font-bold">{Math.min((tablePage + 1) * pageSize, activeFile.parsed.data.length)}</span> de{" "}
                        <span className="text-slate-700 dark:text-slate-200 font-bold">{activeFile.parsed.data.length}</span>
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
                          <span className="mx-2 text-slate-550">
                            Página <span className="text-slate-800 dark:text-slate-200 font-bold">{tablePage + 1}</span> de <span className="text-slate-800 dark:text-slate-200 font-bold">{Math.ceil(activeFile.parsed.data.length / pageSize)}</span>
                          </span>
                          <button
                            onClick={() => setTablePage(p => Math.min(Math.ceil(activeFile.parsed.data.length / pageSize) - 1, p + 1))}
                            disabled={tablePage >= Math.ceil(activeFile.parsed.data.length / pageSize) - 1}
                            className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            Próxima
                          </button>
                          <button
                            onClick={() => setTablePage(Math.ceil(activeFile.parsed.data.length / pageSize) - 1)}
                            disabled={tablePage >= Math.ceil(activeFile.parsed.data.length / pageSize) - 1}
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
                            max={Math.ceil(activeFile.parsed.data.length / pageSize)}
                            value={tablePage + 1}
                            onChange={e => {
                              const val = Number(e.target.value) - 1;
                              const maxP = Math.ceil(activeFile.parsed.data.length / pageSize);
                              if (!isNaN(val) && val >= 0 && val < maxP) {
                                setTablePage(val);
                              }
                            }}
                            className="w-10 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-1 py-0.5 text-center text-slate-800 dark:text-slate-200 font-semibold"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Statistics Cards */}
            {summaryStats.length > 0 && (
              <section className="grid gap-3 grid-cols-1 md:grid-cols-3 flex-shrink-0">
                {summaryStats.map(item => (
                  <Card key={item.key} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 shadow-xs">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                        <h3 className="text-xs font-bold text-slate-800 dark:text-cyan-200 truncate" title={item.name}>{item.name}</h3>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[10px]">
                        <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-2 text-center border border-slate-150 dark:border-slate-900 shadow-xs">
                          <p className="text-slate-400">Mín</p>
                          <p className="font-bold text-slate-850 dark:text-slate-200">{numberFormat.format(item.min)}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-2 text-center border border-slate-150 dark:border-slate-900 shadow-xs">
                          <p className="text-slate-400">Média</p>
                          <p className="font-bold text-slate-850 dark:text-slate-200">{numberFormat.format(item.avg)}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-2 text-center border border-slate-150 dark:border-slate-900 shadow-xs">
                          <p className="text-slate-400">Máx</p>
                          <p className="font-bold text-slate-850 dark:text-slate-200">{numberFormat.format(item.max)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </section>
            )}

          </div>
        </section>
      </div>

      {/* Side Drawer for Curve Selection */}
      {showSidebar && (
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
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar curva..."
                  className="w-full bg-transparent text-xs outline-none text-slate-800 dark:text-slate-200 placeholder:text-slate-400" />
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {filteredCurves.length === 0 && (
                  <p className="text-center text-xs text-slate-400 py-4">Nenhuma curva encontrada.</p>
                )}
                {filteredCurves.map(curve => {
                  const key = `${curve.mnemonic}__${selectedSidebarWell.id}`;
                  const isSelected = selectedCurves.includes(key);
                  return (
                    <button key={key} onClick={() => toggleCurve(curve.mnemonic, selectedSidebarWell.id)}
                      className={"w-full rounded-xl border p-2.5 text-left transition cursor-pointer text-xs " +
                        (isSelected
                          ? "border-cyan-500 bg-cyan-500/5 text-cyan-600 dark:text-cyan-400 font-semibold"
                          : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-350 dark:hover:border-slate-700")}>
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
      )}
    </div>
  );
}
