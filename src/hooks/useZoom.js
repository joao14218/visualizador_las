import { useCallback, useRef, useState } from "react";

export default function useZoom(activeDomainRef) {
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
  }, [activeDomainRef]);

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
