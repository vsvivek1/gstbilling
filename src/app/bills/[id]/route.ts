import { gstSeller } from "@/lib/gst";
import { invoiceHtml } from "@/lib/invoice-html";
import { billTokenOk } from "@/lib/signing";
import { isAdmin } from "@/lib/admin-auth";
import { getInvoice } from "@/server/invoices";

/** A bill as a printable page: for anyone with its signed link (?t=...), or the admin. */
export async function GET(req: Request, ctx: RouteContext<"/bills/[id]">) {
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get("t");
  const inv = await getInvoice(id);
  if (!inv || !(billTokenOk(id, token) || (await isAdmin()))) return new Response("Not found", { status: 404 });
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Tax invoice ${inv.number}</title>
<style>body{margin:0;padding:24px 16px;background:#fff}.print{display:block;margin:16px auto 0;max-width:640px;text-align:right}@media print{.print{display:none}}</style></head>
<body>${invoiceHtml(inv, gstSeller())}<div class="print"><button onclick="window.print()">Print or save as PDF</button></div></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "referrer-policy": "no-referrer" } });
}
