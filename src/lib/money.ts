/** "1,180.50" → 118050 paise; null when not a positive amount with at most 2 decimals. */
export function rupeesToPaise(v: string): number | null {
  const s = v.replace(/[,\s₹]/g, "");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  const [r, p = ""] = s.split(".");
  const paise = Number(r) * 100 + Number(p.padEnd(2, "0"));
  return paise > 0 ? paise : null;
}
