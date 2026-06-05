export function hslToHex(hsl) {
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

export function defaultHex(mnemonic) {
  let hash = 0;
  for (let i = 0; i < mnemonic.length; i++) {
    hash = (hash * 31 + mnemonic.charCodeAt(i)) >>> 0;
  }
  return hslToHex(`hsl(${hash % 360}, 75%, 60%)`);
}
