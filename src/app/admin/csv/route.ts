import { isAdmin } from "@/lib/admin-auth";
import { seriesName } from "@/lib/apps";
import { gstPeriod, gstr1Csv, isSeries } from "@/lib/gst";
import { invoicesForPeriod } from "@/server/invoices";

/** The month's bills from every app (or ?series=QK) and the GSTR-1 tables, as one CSV (?month=2026-11). */
export async function GET(req: Request) {
  // Route handlers don't go through the admin layout, so check here too.
  if (!(await isAdmin())) return new Response("Not found", { status: 404 });
  const q = new URL(req.url).searchParams;
  const asked = q.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(asked) ? asked : gstPeriod(new Date());
  const series = isSeries(q.get("series")) ? q.get("series") : null;
  const rows = await invoicesForPeriod(month, series);
  const csv = gstr1Csv(rows.map((r) => ({ ...r, app: seriesName(r.series) })));
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="gst-sales-${month}${series ? `-${series}` : ""}.csv"`,
      "cache-control": "no-store",
    },
  });
}
