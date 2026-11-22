/**
 * GST tax invoices for everything Calecute Technologies sells in India, from
 * every app and by hand. Pure, so the server, pages and tests share it.
 *
 * - Every price we charge is treated as GST-inclusive: the invoice splits the
 *   amount actually paid into taxable value + tax, so the bill always matches
 *   the money received.
 * - Place of supply is the buyer's state from their profile (CBIC Circular
 *   242/36/2024-GST: for online services to unregistered buyers, the state
 *   recorded on the invoice is the address on record). Without one it is the
 *   seller's state (IGST Act s.12(2)(b)).
 * - Same state as the seller: CGST + SGST, half each. Other state: IGST.
 * - Each app has its own invoice series (QK, RC, MN for manual bills...). Rule
 *   46(b) allows several series under one GSTIN as long as each is consecutive
 *   per financial year (April to March, India time) and at most 16 characters:
 *   QK/26-27/000001. GSTR-1 Table 13 then lists each series.
 * - A buyer with a GSTIN (B2B) is taxed in the GSTIN's state and goes to GSTR-1
 *   Table 4; an unregistered buyer in another state paying over ₹1 lakh goes
 *   to Table 5 (B2C large); everything else is Table 7 (B2C others).
 */

/** GST state codes (first two digits of a GSTIN) and names. */
export const GST_STATES = [
  ["01", "Jammu and Kashmir"],
  ["02", "Himachal Pradesh"],
  ["03", "Punjab"],
  ["04", "Chandigarh"],
  ["05", "Uttarakhand"],
  ["06", "Haryana"],
  ["07", "Delhi"],
  ["08", "Rajasthan"],
  ["09", "Uttar Pradesh"],
  ["10", "Bihar"],
  ["11", "Sikkim"],
  ["12", "Arunachal Pradesh"],
  ["13", "Nagaland"],
  ["14", "Manipur"],
  ["15", "Mizoram"],
  ["16", "Tripura"],
  ["17", "Meghalaya"],
  ["18", "Assam"],
  ["19", "West Bengal"],
  ["20", "Jharkhand"],
  ["21", "Odisha"],
  ["22", "Chhattisgarh"],
  ["23", "Madhya Pradesh"],
  ["24", "Gujarat"],
  ["26", "Dadra and Nagar Haveli and Daman and Diu"],
  ["27", "Maharashtra"],
  ["29", "Karnataka"],
  ["30", "Goa"],
  ["31", "Lakshadweep"],
  ["32", "Kerala"],
  ["33", "Tamil Nadu"],
  ["34", "Puducherry"],
  ["35", "Andaman and Nicobar Islands"],
  ["36", "Telangana"],
  ["37", "Andhra Pradesh"],
  ["38", "Ladakh"],
] as const;

export type GstStateCode = (typeof GST_STATES)[number][0];

export const KERALA: GstStateCode = "32";

const STATE_NAMES = new Map<string, string>(GST_STATES);

export function isGstStateCode(v: unknown): v is GstStateCode {
  return typeof v === "string" && STATE_NAMES.has(v);
}

export function gstStateName(code: string | null | undefined): string {
  return (code && STATE_NAMES.get(code)) || "";
}

/** "32-Kerala", the way GSTR-1 names a place of supply. */
export function gstStateLabel(code: string): string {
  return `${code}-${gstStateName(code)}`;
}

export type GstSeller = {
  legalName: string;
  gstin: string | null;
  address: string;
  state: GstStateCode;
  sac: string;
  ratePercent: number;
  email: string;
};

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function isGstin(v: string | null | undefined): boolean {
  return !!v && GSTIN_RE.test(v);
}

/**
 * The seller's details from the environment. GST_GSTIN must be set (and valid)
 * before any invoice is issued; the rest have defaults.
 */
export function gstSeller(env: Record<string, string | undefined> = process.env): GstSeller {
  const gstin = env.GST_GSTIN?.trim().toUpperCase() || null;
  const stateFromGstin = gstin?.slice(0, 2);
  const state = isGstStateCode(env.GST_STATE_CODE?.trim()) ? (env.GST_STATE_CODE!.trim() as GstStateCode) : isGstStateCode(stateFromGstin) ? stateFromGstin : KERALA;
  const rate = Number(env.GST_RATE_PERCENT);
  return {
    legalName: env.GST_LEGAL_NAME?.trim() || "Calecute Technologies (OPC) Private Limited",
    gstin: isGstin(gstin) ? gstin : null,
    address: env.GST_ADDRESS?.trim() || "",
    state,
    sac: /^\d{6}$/.test(env.GST_SAC?.trim() ?? "") ? env.GST_SAC!.trim() : "999293",
    ratePercent: env.GST_RATE_PERCENT?.trim() && Number.isInteger(rate) && rate >= 0 && rate <= 28 ? rate : 18,
    email: env.GST_INVOICE_EMAIL?.trim() || "info@calecutech.com",
  };
}

/** Invoices can be issued: a valid GSTIN and an address are set. */
export function gstReady(s: GstSeller): boolean {
  return !!s.gstin && !!s.address;
}

/** An invoice series: 1 to 3 capital letters or digits, so numbers fit in 16 characters. */
export function isSeries(v: unknown): v is string {
  return typeof v === "string" && /^[A-Z0-9]{1,3}$/.test(v);
}

/**
 * Where the supply is taxed: a registered buyer's GSTIN state, else the
 * buyer's recorded state, else the seller's.
 */
export function placeOfSupply(buyerState: string | null | undefined, seller: Pick<GstSeller, "state">, buyerGstin?: string | null): GstStateCode {
  const fromGstin = isGstin(buyerGstin) ? buyerGstin!.slice(0, 2) : null;
  if (isGstStateCode(fromGstin)) return fromGstin;
  return isGstStateCode(buyerState) ? buyerState : seller.state;
}

export type GstSplit = {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
};

function withTax(taxablePaise: number, tax: number, intraState: boolean): GstSplit {
  const totalPaise = taxablePaise + tax;
  if (!intraState) return { taxablePaise, cgstPaise: 0, sgstPaise: 0, igstPaise: tax, totalPaise };
  const cgstPaise = Math.ceil(tax / 2);
  return { taxablePaise, cgstPaise, sgstPaise: tax - cgstPaise, igstPaise: 0, totalPaise };
}

/** Split a GST-inclusive amount into taxable value and tax (intra-state: CGST + SGST, else IGST). */
export function splitInclusive(totalPaise: number, ratePercent: number, intraState: boolean): GstSplit {
  const taxablePaise = Math.round((totalPaise * 100) / (100 + ratePercent));
  return withTax(taxablePaise, totalPaise - taxablePaise, intraState);
}

/** Add GST on top of a price before tax (bills quoted as "price + GST"). */
export function splitExclusive(taxablePaise: number, ratePercent: number, intraState: boolean): GstSplit {
  return withTax(taxablePaise, Math.round((taxablePaise * ratePercent) / 100), intraState);
}

/** India time parts of an instant. */
function istParts(d: Date): { y: number; m: number; day: number } {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth() + 1, day: ist.getUTCDate() };
}

/** "2026-27" for any date from 1 April 2026 to 31 March 2027, India time. */
export function financialYear(d: Date): string {
  const { y, m } = istParts(d);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** "2026-11" (India time), the GSTR-1 return period an invoice belongs to. */
export function gstPeriod(d: Date): string {
  const { y, m } = istParts(d);
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** QK/26-27/000001: unique and consecutive per series and financial year, at most 16 characters. */
export function invoiceNumber(series: string, fy: string, seq: number): string {
  const n = `${series}/${fy.slice(2)}/${String(seq).padStart(6, "0")}`;
  // CGST Rule 46(b): at most 16 characters, only letters, digits, "-" and "/".
  if (!/^[A-Za-z0-9/-]{1,16}$/.test(n)) throw new Error(`Invoice number ${n} breaks CGST Rule 46(b)`);
  return n;
}

/** Splits QK/26-27/000153 into its series, financial year ("2026-27") and number, or null. */
export function parseInvoiceNumber(n: string): { series: string; fy: string; seq: number } | null {
  const m = /^([A-Z0-9]{1,3})\/(\d{2})-(\d{2})\/(\d{6})$/.exec(n.trim().toUpperCase());
  if (!m || (Number(m[2]) + 1) % 100 !== Number(m[3])) return null;
  return { series: m[1], fy: `20${m[2]}-${m[3]}`, seq: Number(m[4]) };
}

/**
 * The last number already used for a series and year outside this service,
 * from SERIES_START ("QK/26-27/000153,RC/26-27/000020"). Bills here then
 * continue the series (000154...) instead of reusing a number.
 */
export function seriesStart(series: string, fy: string, env: Record<string, string | undefined> = process.env): number {
  let last = 0;
  for (const part of (env.SERIES_START ?? "").split(/[,;\s]+/)) {
    const p = parseInvoiceNumber(part);
    if (p && p.series === series && p.fy === fy) last = Math.max(last, p.seq);
  }
  return last;
}

/** Paise as "1180.00", for invoices and CSVs. */
export function rupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

/** Whole rupees and paise in words (Indian system), for the invoice total. */
export function amountInWords(paise: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n: number) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`);
  const three = (n: number) => [n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred` : "", two(n % 100)].filter(Boolean).join(" ");
  const words = (n: number): string => {
    if (n === 0) return "Zero";
    const parts: string[] = [];
    const crore = Math.floor(n / 10_000_000);
    const lakh = Math.floor((n % 10_000_000) / 100_000);
    const thousand = Math.floor((n % 100_000) / 1000);
    const rest = n % 1000;
    if (crore) parts.push(`${words(crore)} Crore`);
    if (lakh) parts.push(`${two(lakh)} Lakh`);
    if (thousand) parts.push(`${two(thousand)} Thousand`);
    if (rest) parts.push(three(rest));
    return parts.join(" ");
  };
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  return `Rupees ${words(r)}${p ? ` and ${two(p)} Paise` : ""} Only`;
}

export type GstInvoiceRow = {
  series: string;
  number: string;
  issuedAt: Date;
  buyerName: string;
  buyerGstin: string | null;
  placeOfSupply: string;
  sellerState: string;
  ratePercent: number;
  sac: string;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
};

/** An unregistered buyer in another state paying more than this is "B2C large" (GSTR-1 Table 5). */
export const B2CL_LIMIT_PAISE = 100_000_00;

/** Which GSTR-1 table an invoice belongs to. */
export function gstr1Kind(r: Pick<GstInvoiceRow, "buyerGstin" | "placeOfSupply" | "sellerState" | "totalPaise">): "B2B" | "B2CL" | "B2CS" {
  if (r.buyerGstin) return "B2B";
  if (r.placeOfSupply !== r.sellerState && r.totalPaise > B2CL_LIMIT_PAISE) return "B2CL";
  return "B2CS";
}

/** One line of GSTR-1 Table 7 (B2C others): per place of supply and rate. */
export type B2csLine = { placeOfSupply: string; ratePercent: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number };
/** One line of GSTR-1 Table 12 (HSN/SAC summary), reported separately for B2B and B2C. */
export type HsnLine = { kind: "B2B" | "B2C"; sac: string; ratePercent: number; count: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number };
/** One line of GSTR-1 Table 13: the number range of one series. */
export type DocsLine = { series: string; from: string; to: string; count: number };

/**
 * The month's figures GSTR-1 asks for: B2B and B2C-large invoices one by one,
 * B2C-others by state, the SAC summary and each series' number range.
 */
export function gstr1Summary<R extends GstInvoiceRow>(rows: R[]) {
  const b2b: R[] = [];
  const b2cl: R[] = [];
  const b2cs = new Map<string, B2csLine>();
  const hsn = new Map<string, HsnLine>();
  const docs = new Map<string, string[]>();
  for (const r of rows) {
    const kind = gstr1Kind(r);
    if (kind === "B2B") b2b.push(r);
    else if (kind === "B2CL") b2cl.push(r);
    else {
      const bk = `${r.placeOfSupply}|${r.ratePercent}`;
      const b = b2cs.get(bk) ?? { placeOfSupply: r.placeOfSupply, ratePercent: r.ratePercent, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
      b.taxablePaise += r.taxablePaise;
      b.cgstPaise += r.cgstPaise;
      b.sgstPaise += r.sgstPaise;
      b.igstPaise += r.igstPaise;
      b2cs.set(bk, b);
    }
    const hkind = kind === "B2B" ? "B2B" : "B2C";
    const hk = `${hkind}|${r.sac}|${r.ratePercent}`;
    const h = hsn.get(hk) ?? { kind: hkind, sac: r.sac, ratePercent: r.ratePercent, count: 0, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: 0 };
    h.count += 1;
    h.taxablePaise += r.taxablePaise;
    h.cgstPaise += r.cgstPaise;
    h.sgstPaise += r.sgstPaise;
    h.igstPaise += r.igstPaise;
    h.totalPaise += r.totalPaise;
    hsn.set(hk, h);
    docs.set(r.series, [...(docs.get(r.series) ?? []), r.number]);
  }
  const docsLines: DocsLine[] = [...docs.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([series, numbers]) => {
      numbers.sort();
      return { series, from: numbers[0], to: numbers.at(-1)!, count: numbers.length };
    });
  return {
    b2b,
    b2cl,
    b2cs: [...b2cs.values()].sort((a, b) => a.placeOfSupply.localeCompare(b.placeOfSupply) || a.ratePercent - b.ratePercent),
    hsn: [...hsn.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.sac.localeCompare(b.sac) || a.ratePercent - b.ratePercent),
    docs: docsLines,
  };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const day = (d: Date) => {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
};

/**
 * One CSV for the month across every app: each invoice, then the GSTR-1
 * tables (4 B2B, 5 B2C large, 7 B2C others, 12 SAC summary, 13 documents
 * issued), ready to copy into the GST portal or hand to the accountant.
 */
export function gstr1Csv(rows: (GstInvoiceRow & { description: string; paymentRef: string | null; app: string })[]): string {
  const s = gstr1Summary(rows);
  const lines: (string | number)[][] = [
    ["Invoices"],
    ["Invoice number", "Date", "App", "Buyer", "Buyer GSTIN", "Place of supply", "Description", "SAC", "Rate %", "Taxable value", "CGST", "SGST", "IGST", "Total", "Payment ref", "GSTR-1 table"],
    ...rows.map((r) => [
      r.number,
      day(r.issuedAt),
      r.app,
      r.buyerName,
      r.buyerGstin ?? "",
      gstStateLabel(r.placeOfSupply),
      r.description,
      r.sac,
      r.ratePercent,
      rupees(r.taxablePaise),
      rupees(r.cgstPaise),
      rupees(r.sgstPaise),
      rupees(r.igstPaise),
      rupees(r.totalPaise),
      r.paymentRef ?? "",
      gstr1Kind(r),
    ]),
    [],
    ["GSTR-1 Table 4A: B2B"],
    ["GSTIN of recipient", "Receiver name", "Invoice number", "Invoice date", "Invoice value", "Place of supply", "Reverse charge", "Invoice type", "Rate %", "Taxable value", "Cess"],
    ...s.b2b.map((r) => [r.buyerGstin!, r.buyerName, r.number, day(r.issuedAt), rupees(r.totalPaise), gstStateLabel(r.placeOfSupply), "N", "Regular B2B", r.ratePercent, rupees(r.taxablePaise), "0.00"]),
    [],
    ["GSTR-1 Table 5: B2C (large)"],
    ["Invoice number", "Invoice date", "Invoice value", "Place of supply", "Rate %", "Taxable value", "Cess"],
    ...s.b2cl.map((r) => [r.number, day(r.issuedAt), rupees(r.totalPaise), gstStateLabel(r.placeOfSupply), r.ratePercent, rupees(r.taxablePaise), "0.00"]),
    [],
    ["GSTR-1 Table 7: B2C (others)"],
    ["Type", "Place of supply", "Rate %", "Taxable value", "Integrated tax", "Central tax", "State tax", "Cess"],
    ...s.b2cs.map((b) => ["OE", gstStateLabel(b.placeOfSupply), b.ratePercent, rupees(b.taxablePaise), rupees(b.igstPaise), rupees(b.cgstPaise), rupees(b.sgstPaise), "0.00"]),
    [],
    ["GSTR-1 Table 12: HSN/SAC summary"],
    ["B2B/B2C", "HSN/SAC", "UQC", "Total quantity", "Rate %", "Taxable value", "Integrated tax", "Central tax", "State tax", "Cess", "Total value"],
    ...s.hsn.map((h) => [h.kind, h.sac, "NA", h.count, h.ratePercent, rupees(h.taxablePaise), rupees(h.igstPaise), rupees(h.cgstPaise), rupees(h.sgstPaise), "0.00", rupees(h.totalPaise)]),
    [],
    ["GSTR-1 Table 13: Documents issued"],
    ["Nature of document", "Sr. no. from", "Sr. no. to", "Total number", "Cancelled"],
    ...s.docs.map((d) => ["Invoices for outward supply", d.from, d.to, d.count, 0]),
  ];
  return lines.map((l) => l.map(csvCell).join(",")).join("\n") + "\n";
}
