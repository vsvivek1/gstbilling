import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// GST tax invoices from every Calecute app and from the admin (manual bills).
// Never edited or deleted: these are the sales records for GSTR-1 and 3B.
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Invoice series, one per app ("QK" QuizKerala, "RC" Recallio, "MN" manual...).
    series: text("series").notNull(),
    // QK/26-27/000001: consecutive within the series and financial year.
    number: text("number").notNull().unique(),
    // "2026-27"
    fy: text("fy").notNull(),
    seq: integer("seq").notNull(),
    issuedAt: ts("issued_at").notNull().defaultNow(),
    // The app's payment id (e.g. Razorpay pay_...): one invoice per payment per series.
    paymentRef: text("payment_ref"),
    paymentMethod: text("payment_method"),
    orderId: text("order_id"),
    // The buyer's id in the app, so the app can list a buyer's bills.
    customerRef: text("customer_ref"),
    product: text("product").notNull(),
    description: text("description").notNull(),
    buyerName: text("buyer_name").notNull(),
    buyerEmail: text("buyer_email"),
    buyerPhone: text("buyer_phone"),
    buyerGstin: text("buyer_gstin"),
    buyerAddress: text("buyer_address"),
    // GST state code of the place of supply.
    placeOfSupply: text("place_of_supply").notNull(),
    sellerGstin: text("seller_gstin").notNull(),
    sellerState: text("seller_state").notNull(),
    sac: text("sac").notNull(),
    ratePercent: integer("rate_percent").notNull(),
    taxablePaise: integer("taxable_paise").notNull(),
    cgstPaise: integer("cgst_paise").notNull(),
    sgstPaise: integer("sgst_paise").notNull(),
    igstPaise: integer("igst_paise").notNull(),
    totalPaise: integer("total_paise").notNull(),
    emailed: boolean("emailed").notNull().default(false),
  },
  (t) => [
    uniqueIndex("invoices_series_fy_seq_idx").on(t.series, t.fy, t.seq),
    uniqueIndex("invoices_series_payment_idx").on(t.series, t.paymentRef).where(sql`${t.paymentRef} is not null`),
    index("invoices_issued_idx").on(t.issuedAt),
    index("invoices_customer_idx").on(t.series, t.customerRef),
  ],
);

// The last invoice number used in each series and financial year.
export const invoiceCounters = pgTable(
  "invoice_counters",
  {
    series: text("series").notNull(),
    fy: text("fy").notNull(),
    last: integer("last").notNull(),
  },
  (t) => [primaryKey({ columns: [t.series, t.fy] })],
);

export type Invoice = typeof invoices.$inferSelect;
