import type { Invoice } from "@/db/schema";
import { gstStateLabel, rupees } from "./gst";
import { billUrl } from "./signing";

/** A bill as the API returns it. */
export function invoiceJson(inv: Invoice, origin?: string) {
  return {
    id: inv.id,
    number: inv.number,
    series: inv.series,
    issuedAt: inv.issuedAt.toISOString(),
    paymentRef: inv.paymentRef,
    customerRef: inv.customerRef,
    product: inv.product,
    description: inv.description,
    buyerName: inv.buyerName,
    placeOfSupply: gstStateLabel(inv.placeOfSupply),
    sac: inv.sac,
    ratePercent: inv.ratePercent,
    taxablePaise: inv.taxablePaise,
    cgstPaise: inv.cgstPaise,
    sgstPaise: inv.sgstPaise,
    igstPaise: inv.igstPaise,
    totalPaise: inv.totalPaise,
    total: rupees(inv.totalPaise),
    emailed: inv.emailed,
    url: billUrl(inv.id, origin),
  };
}
