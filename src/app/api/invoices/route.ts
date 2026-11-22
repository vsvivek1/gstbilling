import { appForRequest } from "@/lib/apps";
import { issueBody } from "@/lib/api-input";
import { invoiceJson } from "@/lib/invoice-json";
import { findByPayment, issueInvoice, listCustomerInvoices, NotReadyError } from "@/server/invoices";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

const origin = (req: Request) => process.env.PUBLIC_URL || new URL(req.url).origin;

/**
 * Issue a bill for a payment in the calling app's series. Safe to repeat: the
 * same paymentRef returns the first bill (200) instead of a new one (201).
 */
export async function POST(req: Request) {
  const app = appForRequest(req);
  if (!app) return json({ error: "Bad or missing API key" }, 401);
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const parsed = issueBody.safeParse(raw);
  if (!parsed.success) return json({ error: "Invalid bill", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
  const b = parsed.data;
  try {
    const { invoice, created } = await issueInvoice({
      series: app.series,
      paymentRef: b.paymentRef,
      paymentMethod: b.paymentMethod,
      orderId: b.orderId,
      customerRef: b.customerRef,
      product: b.product,
      description: b.description,
      amountPaise: b.amountPaise,
      amountIncludesGst: b.amountIncludesGst,
      buyerName: b.buyer.name,
      buyerEmail: b.buyer.email,
      buyerPhone: b.buyer.phone,
      buyerState: b.buyer.state,
      buyerGstin: b.buyer.gstin,
      buyerAddress: b.buyer.address,
      sendEmail: b.sendEmail,
    });
    return json({ invoice: invoiceJson(invoice, origin(req)), created }, created ? 201 : 200);
  } catch (e) {
    if (e instanceof NotReadyError) return json({ error: e.message }, 503);
    console.error("api/invoices: issue failed", e);
    return json({ error: e instanceof Error ? e.message : "Could not issue the bill" }, 500);
  }
}

/** The calling app's bills: ?customerRef=<buyer id> for a buyer's list, or ?paymentRef=<id> for one payment. */
export async function GET(req: Request) {
  const app = appForRequest(req);
  if (!app) return json({ error: "Bad or missing API key" }, 401);
  const q = new URL(req.url).searchParams;
  const paymentRef = q.get("paymentRef")?.trim();
  const customerRef = q.get("customerRef")?.trim();
  if (paymentRef) {
    const inv = await findByPayment(app.series, paymentRef);
    return inv ? json({ invoice: invoiceJson(inv, origin(req)) }) : json({ error: "Not found" }, 404);
  }
  if (customerRef) {
    const rows = await listCustomerInvoices(app.series, customerRef);
    return json({ invoices: rows.map((r) => invoiceJson(r, origin(req))) });
  }
  return json({ error: "Pass customerRef or paymentRef" }, 400);
}
