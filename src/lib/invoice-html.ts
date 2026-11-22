import { amountInWords, gstStateLabel, rupees } from "./gst";

/** What the printed invoice needs (an invoices row plus the seller's address). */
export type InvoiceView = {
  number: string;
  issuedAt: Date;
  description: string;
  buyerName: string;
  buyerEmail: string | null;
  buyerPhone: string | null;
  buyerGstin: string | null;
  buyerAddress: string | null;
  placeOfSupply: string;
  sellerGstin: string;
  sellerState: string;
  sac: string;
  ratePercent: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  paymentRef: string | null;
  paymentMethod: string | null;
};

/** "Razorpay pay_123", "Bank transfer", or "" when neither is known. */
export function paymentLabel(inv: Pick<InvoiceView, "paymentMethod" | "paymentRef">): string {
  return [inv.paymentMethod, inv.paymentRef].filter(Boolean).join(" ");
}

export type InvoiceSellerView = { legalName: string; address: string; email: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const dateIn = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/**
 * A tax invoice with the particulars of CGST Rule 46: seller name, address and
 * GSTIN; a consecutive number and date; buyer name and state (place of
 * supply); SAC and description; taxable value; rate and amount of CGST/SGST
 * or IGST; total; and an electronic signature line. Self-contained HTML, for
 * the email body and the printable bill page.
 */
export function invoiceHtml(inv: InvoiceView, seller: InvoiceSellerView): string {
  const intra = inv.placeOfSupply === inv.sellerState;
  const half = inv.ratePercent / 2;
  const taxRows = intra
    ? `<tr><td>CGST @ ${half}%</td><td class="r">${rupees(inv.cgstPaise)}</td></tr><tr><td>SGST @ ${half}%</td><td class="r">${rupees(inv.sgstPaise)}</td></tr>`
    : `<tr><td>IGST @ ${inv.ratePercent}%</td><td class="r">${rupees(inv.igstPaise)}</td></tr>`;
  const contact = [inv.buyerEmail, inv.buyerPhone].filter(Boolean).map((v) => esc(v!)).join(" · ");
  const payment = paymentLabel(inv);
  const buyerLines = [
    inv.buyerAddress ? esc(inv.buyerAddress).replace(/\n/g, "<br>") : "",
    contact,
    `State: ${esc(gstStateLabel(inv.placeOfSupply))} · ${inv.buyerGstin ? `GSTIN: <strong>${esc(inv.buyerGstin)}</strong>` : "Unregistered"}`,
  ].filter(Boolean);
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;color:#111;font-size:14px;line-height:1.45">
<style>.gb-inv td,.gb-inv th{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}.gb-inv .r{text-align:right}.gb-inv{border-collapse:collapse;width:100%;margin:8px 0}</style>
<h1 style="font-size:20px;margin:0 0 4px">Tax Invoice</h1>
<p style="margin:0 0 12px;color:#555">Original for recipient</p>
<table class="gb-inv">
<tr><td style="width:50%"><strong>${esc(seller.legalName)}</strong><br>${esc(seller.address).replace(/\n/g, "<br>")}<br>GSTIN: <strong>${esc(inv.sellerGstin)}</strong><br>State: ${esc(gstStateLabel(inv.sellerState))}<br>${esc(seller.email)}</td>
<td>Invoice no: <strong>${esc(inv.number)}</strong><br>Date: ${dateIn(inv.issuedAt)}<br>Place of supply: ${esc(gstStateLabel(inv.placeOfSupply))}<br>Reverse charge: No${payment ? `<br>Payment: ${esc(payment)}` : ""}</td></tr>
<tr><td colspan="2">Billed to: <strong>${esc(inv.buyerName)}</strong><br>${buyerLines.join("<br>")}</td></tr>
</table>
<table class="gb-inv">
<tr><th>Description</th><th>SAC</th><th class="r">Qty</th><th class="r">Taxable value (₹)</th></tr>
<tr><td>${esc(inv.description)}</td><td>${esc(inv.sac)}</td><td class="r">1</td><td class="r">${rupees(inv.taxablePaise)}</td></tr>
</table>
<table class="gb-inv">
<tr><td>Taxable value</td><td class="r">${rupees(inv.taxablePaise)}</td></tr>
${taxRows}
<tr><td><strong>Total (₹)</strong></td><td class="r"><strong>${rupees(inv.totalPaise)}</strong></td></tr>
<tr><td colspan="2">${esc(amountInWords(inv.totalPaise))}</td></tr>
</table>
<p style="margin:12px 0 0">For ${esc(seller.legalName)}<br><em>Electronically issued invoice; no signature required.</em></p>
</div>`;
}

/** The same invoice as plain text, for the email's text part. */
export function invoiceText(inv: InvoiceView, seller: InvoiceSellerView): string {
  const tax =
    inv.placeOfSupply !== inv.sellerState
      ? [`IGST @ ${inv.ratePercent}%: ${rupees(inv.igstPaise)}`]
      : [`CGST @ ${inv.ratePercent / 2}%: ${rupees(inv.cgstPaise)}`, `SGST @ ${inv.ratePercent / 2}%: ${rupees(inv.sgstPaise)}`];
  return [
    "TAX INVOICE",
    `${seller.legalName}, ${seller.address.replace(/\n/g, ", ")}`,
    `GSTIN: ${inv.sellerGstin}`,
    `Invoice no: ${inv.number}   Date: ${dateIn(inv.issuedAt)}`,
    `Billed to: ${inv.buyerName}${inv.buyerGstin ? ` (GSTIN ${inv.buyerGstin})` : ""}   Place of supply: ${gstStateLabel(inv.placeOfSupply)}`,
    "",
    `${inv.description} (SAC ${inv.sac})`,
    `Taxable value: ${rupees(inv.taxablePaise)}`,
    ...tax,
    `Total: ₹${rupees(inv.totalPaise)} (${amountInWords(inv.totalPaise)})`,
    ...(paymentLabel(inv) ? [`Payment: ${paymentLabel(inv)}`] : []),
  ].join("\n");
}
