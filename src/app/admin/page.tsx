import Link from "next/link";
import { billingApps, manualSeries, seriesName } from "@/lib/apps";
import { gstPeriod, gstReady, gstSeller, gstr1Kind, gstr1Summary, gstStateLabel, isSeries, rupees } from "@/lib/gst";
import { invoicesForPeriod } from "@/server/invoices";

export const metadata = { title: "Bills" };

const dateLabel = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export default async function BillsPage({ searchParams }: PageProps<"/admin">) {
  const q = await searchParams;
  const month = typeof q.month === "string" && /^\d{4}-\d{2}$/.test(q.month) ? q.month : gstPeriod(new Date());
  const series = isSeries(q.series) ? q.series : null;
  const seller = gstSeller();
  const apps = billingApps();
  const rows = await invoicesForPeriod(month, series);
  const sum = gstr1Summary(rows);
  const total = rows.reduce(
    (t, r) => ({
      taxable: t.taxable + r.taxablePaise,
      cgst: t.cgst + r.cgstPaise,
      sgst: t.sgst + r.sgstPaise,
      igst: t.igst + r.igstPaise,
      tax: t.tax + r.cgstPaise + r.sgstPaise + r.igstPaise,
      total: t.total + r.totalPaise,
    }),
    { taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, total: 0 },
  );
  const allSeries = [...apps.map((a) => ({ series: a.series, name: a.name })), { series: manualSeries(), name: "Manual" }];
  const csvHref = `/admin/csv?month=${month}${series ? `&series=${series}` : ""}`;

  return (
    <main>
      <h1>GST bills</h1>
      {!gstReady(seller) && (
        <p className="error">
          No bills can be issued yet. Set <code>GST_GSTIN</code> and <code>GST_ADDRESS</code> in the environment.
        </p>
      )}
      {apps.length === 0 && (
        <p className="error">
          No apps can send bills yet. Add them to <code>BILLING_APPS</code> (see the README).
        </p>
      )}
      <p className="muted">
        Every app sends its payments here and each gets its own numbering ({allSeries.map((s) => `${s.series} ${s.name}`).join(", ")}). Bills are{" "}
        {seller.ratePercent}% GST, SAC {seller.sac}: CGST + SGST in {gstStateLabel(seller.state)}, IGST for other states.
      </p>

      <form className="row" action="/admin">
        <label>
          Month
          <input type="month" name="month" defaultValue={month} />
        </label>
        <label>
          App
          <select name="series" defaultValue={series ?? ""}>
            <option value="">All apps</option>
            {allSeries.map((s) => (
              <option key={s.series} value={s.series}>
                {s.series} · {s.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn">
          Show
        </button>
        <a href={csvHref} className="btn brand">
          Download GSTR-1 CSV
        </a>
      </form>

      <div className="stats">
        <div className="card stat">
          <span className="muted">Bills</span>
          <b>{rows.length}</b>
          <span className="muted">{sum.docs.map((d) => `${seriesName(d.series, apps)} ${d.count}`).join(" · ") || "None this month"}</span>
        </div>
        <div className="card stat">
          <span className="muted">Taxable value</span>
          <b>₹{rupees(total.taxable)}</b>
          <span className="muted">Total received ₹{rupees(total.total)}</span>
        </div>
        <div className="card stat">
          <span className="muted">GST to pay</span>
          <b>₹{rupees(total.tax)}</b>
          <span className="muted">
            CGST ₹{rupees(total.cgst)} · SGST ₹{rupees(total.sgst)} · IGST ₹{rupees(total.igst)}
          </span>
        </div>
      </div>

      <div className="card table">
        <table>
          <thead>
            <tr>
              <th>Bill</th>
              <th>Date</th>
              <th>Buyer</th>
              <th>State</th>
              <th>For</th>
              <th>Type</th>
              <th className="r">GST</th>
              <th className="r">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono">
                  <Link href={`/bills/${r.id}`} target="_blank">
                    {r.number}
                  </Link>
                </td>
                <td>{dateLabel(r.issuedAt)}</td>
                <td>
                  {r.buyerName}
                  {r.buyerGstin && <div className="muted mono">{r.buyerGstin}</div>}
                </td>
                <td>{gstStateLabel(r.placeOfSupply)}</td>
                <td>{r.description}</td>
                <td>{gstr1Kind(r)}</td>
                <td className="r">₹{rupees(r.cgstPaise + r.sgstPaise + r.igstPaise)}</td>
                <td className="r">₹{rupees(r.totalPaise)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  No bills this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
