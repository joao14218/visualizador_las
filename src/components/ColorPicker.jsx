import React, { useRef, useState, useEffect } from "react";

export default function ColorPicker({ value, onCommit }) {
  const ref = useRef(null);
  const [localColor, setLocalColor] = useState(value);

  // Sincroniza a cor se ela mudar externamente (ex: desfazer/refazer)
  useEffect(() => {
    setLocalColor(value);
  }, [value]);

  // Aplica a mudança no gráfico apenas ao terminar o arrasto (evento nativo change)
  useEffect(() => {
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
    <input
      ref={ref}
      type="color"
      value={localColor}
      onChange={e => setLocalColor(e.target.value)}
      title="Escolher cor"
      style={{
        width: 18,
        height: 18,
        padding: 0,
        border: "2px solid rgba(255,255,255,0.3)",
        borderRadius: "50%",
        cursor: "pointer",
        background: "none",
        WebkitAppearance: "none",
        appearance: "none",
        overflow: "hidden"
      }}
    />
  );
}
