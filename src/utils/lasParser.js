export function parseLAS(text) {
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
