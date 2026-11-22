import "server-only";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db";
import { invoiceCounters, invoices, type Invoice } from "@/db/schema";
import { financialYear, gstReady, gstSeller, invoiceNumber, isGstin, isSeries, placeOfSupply, seriesStart, splitExclusive, splitInclusive, type GstSeller } from "@/lib/gst";
import { invoiceHtml, invoiceText } from "@/lib/invoice-html";
import { billUrl } from "@/lib/signing";
import { sendMail } from "./mailer";

export type IssueInput = {
  series: string;
  /** The app's payment id: one invoice per payment in a series. Optional for manual bills. */
  paymentRef?: string | null;
  paymentMethod?: string | null;
  orderId?: string | null;
  customerRef?: string | null;
  product: string;
  description: string;
  /** Amount paid, GST included (or the price before GST when amountIncludesGst is false). */
  amountPaise: number;
  amountIncludesGst?: boolean;
  buyerName: string;
  buyerEmail?: string | null;
  buyerPhone?: string | null;
  /** GST state code ("32" Kerala). */
  buyerState?: string | null;
  buyerGstin?: string | null;
  buyerAddress?: string | null;
  /** Defaults to the seller's SAC and rate. */
  sac?: string | null;
  ratePercent?: number | null;
  /** Email the bill to the buyer (default true when an email is given). */
  sendEmail?: boolean;
};

export class NotReadyError extends Error {
  constructor() {
    super("GST_GSTIN and GST_ADDRESS are not set, so no bills can be issued");
  }
}

/** Bill amounts are stored as integer paise; one bill is capped at ₹1 crore. */
export const MAX_PAISE = 1_000_000_000;

/**
 * Issue a GST tax invoice and email it. Safe to call twice for the same
 * payment (an app may retry, or call from both checkout and webhook): the
 * second call returns the first invoice. Numbers stay consecutive per series
 * because they are taken under a per-series lock in the same transaction as
 * the insert.
 */
export async function issueInvoice(
  input: IssueInput,
  d: DB = defaultDb,
  seller: GstSeller = gstSeller(),
  now = new Date(),
): Promise<{ invoice: Invoice; created: boolean }> {
  if (!gstReady(seller)) throw new NotReadyError();
  if (!isSeries(input.series)) throw new Error(`Bad series ${input.series}`);
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0 || input.amountPaise > MAX_PAISE) throw new Error("Amount must be a whole number of paise, above 0 and at most ₹1 crore");
  const paymentRef = input.paymentRef?.trim() || null;

  if (paymentRef) {
    const [existing] = await d.select().from(invoices).where(and(eq(invoices.series, input.series), eq(invoices.paymentRef, paymentRef)));
    if (existing) return { invoice: existing, created: false };
  }

  const buyerGstin = input.buyerGstin?.trim().toUpperCase() || null;
  if (buyerGstin && !isGstin(buyerGstin)) throw new Error(`Bad buyer GSTIN ${buyerGstin}`);
  const pos = placeOfSupply(input.buyerState, seller, buyerGstin);
  const rate = input.ratePercent ?? seller.ratePercent;
  if (!Number.isInteger(rate) || rate < 0 || rate > 28) throw new Error("Bad GST rate");
  const sac = input.sac?.trim() || seller.sac;
  if (!/^\d{4,8}$/.test(sac)) throw new Error("Bad SAC");
  const intra = pos === seller.state;
  const split = input.amountIncludesGst === false ? splitExclusive(input.amountPaise, rate, intra) : splitInclusive(input.amountPaise, rate, intra);
  if (split.totalPaise > MAX_PAISE) throw new Error("Amount must be at most ₹1 crore");
  const fy = financialYear(now);

  const result = await d.transaction(async (tx) => {
    // One writer per series at a time, so two payments never take the same
    // number and a payment seen twice never takes two.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invoices:${input.series}`}))`);
    if (paymentRef) {
      const [again] = await tx.select().from(invoices).where(and(eq(invoices.series, input.series), eq(invoices.paymentRef, paymentRef)));
      if (again) return { invoice: again, created: false };
    }
    const [counter] = await tx
      .insert(invoiceCounters)
      // The first bill of a series and year starts at 1, or right after the
      // last number used before this service took over the series (SERIES_START).
      .values({ series: input.series, fy, last: seriesStart(input.series, fy) + 1 })
      .onConflictDoUpdate({ target: [invoiceCounters.series, invoiceCounters.fy], set: { last: sql`${invoiceCounters.last} + 1` } })
      .returning({ last: invoiceCounters.last });
    const [row] = await tx
      .insert(invoices)
      .values({
        series: input.series,
        number: invoiceNumber(input.series, fy, counter.last),
        fy,
        seq: counter.last,
        issuedAt: now,
        paymentRef,
        paymentMethod: input.paymentMethod?.trim() || null,
        orderId: input.orderId?.trim() || null,
        customerRef: input.customerRef?.trim() || null,
        product: input.product.trim(),
        description: input.description.trim(),
        buyerName: input.buyerName.trim() || "Customer",
        buyerEmail: input.buyerEmail?.trim() || null,
        buyerPhone: input.buyerPhone?.trim() || null,
        buyerGstin,
        buyerAddress: input.buyerAddress?.trim() || null,
        placeOfSupply: pos,
        sellerGstin: seller.gstin!,
        sellerState: seller.state,
        sac,
        ratePercent: rate,
        ...split,
      })
      .returning();
    return { invoice: row, created: true };
  });

  if (result.created && result.invoice.buyerEmail && input.sendEmail !== false) {
    result.invoice = await emailInvoice(result.invoice, d, seller);
  }
  return result;
}

/** Email a bill to its buyer. A failure is only logged: the bill is saved and its link still works. */
export async function emailInvoice(inv: Invoice, d: DB = defaultDb, seller: GstSeller = gstSeller()): Promise<Invoice> {
  if (!inv.buyerEmail) return inv;
  const link = billUrl(inv.id);
  try {
    const res = await sendMail({
      to: inv.buyerEmail,
      subject: `Tax invoice ${inv.number} from ${seller.legalName}`,
      text: `${invoiceText(inv, seller)}\n\nView or print: ${link}`,
      html: `${invoiceHtml(inv, seller)}<p style="text-align:center;font-family:system-ui,sans-serif"><a href="${link}">View or print this bill</a></p>`,
    });
    if (!res.ok) {
      console.error(`invoices: ${inv.number} email failed: ${res.error ?? ""}`);
      return inv;
    }
    const [row] = await d.update(invoices).set({ emailed: true }).where(eq(invoices.id, inv.id)).returning();
    return row ?? inv;
  } catch (e) {
    console.error(`invoices: ${inv.number} email failed`, e);
    return inv;
  }
}

export function getInvoice(id: string, d: DB = defaultDb): Promise<Invoice | undefined> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return Promise.resolve(undefined);
  return d
    .select()
    .from(invoices)
    .where(eq(invoices.id, id))
    .then((r) => r[0]);
}

/** One app's bills for one of its buyers, newest first. */
export function listCustomerInvoices(series: string, customerRef: string, d: DB = defaultDb) {
  return d
    .select()
    .from(invoices)
    .where(and(eq(invoices.series, series), eq(invoices.customerRef, customerRef)))
    .orderBy(desc(invoices.issuedAt))
    .limit(200);
}

/** One app's bill for a payment, if issued. */
export function findByPayment(series: string, paymentRef: string, d: DB = defaultDb) {
  return d
    .select()
    .from(invoices)
    .where(and(eq(invoices.series, series), eq(invoices.paymentRef, paymentRef)))
    .then((r) => r[0]);
}

/** Bills issued in a month ("2026-11", India time), optionally one series, in number order. */
export function invoicesForPeriod(period: string, series?: string | null, d: DB = defaultDb): Promise<Invoice[]> {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return Promise.resolve([]);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  // Midnight India time is 18:30 UTC the day before.
  const from = new Date(Date.UTC(y, mo - 1, 1) - 5.5 * 3600_000);
  const to = new Date(Date.UTC(y, mo, 1) - 5.5 * 3600_000);
  const range = and(gte(invoices.issuedAt, from), lt(invoices.issuedAt, to));
  return d
    .select()
    .from(invoices)
    .where(series ? and(range, eq(invoices.series, series)) : range)
    .orderBy(invoices.series, invoices.fy, invoices.seq);
}
