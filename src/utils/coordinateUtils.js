export function parseCoordinate(raw) {
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

export function utmToLatLng(easting, northing, zone, northern = true) {
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

export function getWellCoordinates(wellMeta, utmZone, northern = false) {
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

export function guessUtmSettings(wellName, wellMeta) {
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
