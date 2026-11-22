import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { manualSeries } from "@/lib/apps";
import { GST_STATES, gstReady, gstSeller, isGstin, isGstStateCode } from "@/lib/gst";
import { rupeesToPaise } from "@/lib/money";
import { issueInvoice } from "@/server/invoices";

export const metadata = { title: "New manual bill" };

async function createBill(formData: FormData) {
  "use server";
  await requireAdmin();
  const f = (k: string) => String(formData.get(k) ?? "").trim();
  const fail = (msg: string) => redirect(`/admin/new?error=${encodeURIComponent(msg)}`);
  const amountPaise = rupeesToPaise(f("amount"));
  if (!amountPaise) fail("Enter the amount in rupees, like 1180 or 1180.50.");
  if (!f("buyerName") || !f("description")) fail("Buyer name and description are needed.");
  const gstin = f("buyerGstin").toUpperCase();
  if (gstin && !isGstin(gstin)) fail(`${gstin} is not a valid GSTIN.`);
  const state = f("buyerState");
  if (state && !isGstStateCode(state)) fail("Pick a state from the list.");
  const rate = f("ratePercent") ? Number(f("ratePercent")) : null;
  let id: string;
  try {
    const { invoice } = await issueInvoice({
      series: manualSeries(),
      paymentRef: f("paymentRef") || null,
      paymentMethod: f("paymentMethod") || null,
      product: "manual",
      description: f("description"),
      amountPaise: amountPaise!,
      amountIncludesGst: formData.get("includesGst") === "on",
      buyerName: f("buyerName"),
      buyerEmail: f("buyerEmail") || null,
      buyerPhone: f("buyerPhone") || null,
      buyerState: state || null,
      buyerGstin: gstin || null,
      buyerAddress: f("buyerAddress") || null,
      sac: f("sac") || null,
      ratePercent: rate,
      sendEmail: formData.get("sendEmail") === "on",
    });
    id = invoice.id;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not issue the bill.");
  }
  redirect(`/bills/${id}`);
}

export default async function NewBillPage({ searchParams }: PageProps<"/admin/new">) {
  const error = (await searchParams).error;
  const seller = gstSeller();
  return (
    <main>
      <h1>New manual bill</h1>
      <p className="muted">
        For sales outside the apps (schools paying by bank transfer, workshops, services). Numbered {manualSeries()}/yy-yy/000001. A buyer
        with a GSTIN is taxed in their GSTIN&apos;s state.
      </p>
      {!gstReady(seller) && <p className="error">Set GST_GSTIN and GST_ADDRESS first.</p>}
      {typeof error === "string" && <p className="error">{error}</p>}
      <form action={createBill} className="card" style={{ display: "grid", gap: 16 }}>
        <h2>Buyer</h2>
        <div className="grid2">
          <label>
            Name
            <input name="buyerName" required maxLength={120} />
          </label>
          <label>
            GSTIN (if registered)
            <input name="buyerGstin" maxLength={15} placeholder="32ABCDE1234F1Z5" style={{ textTransform: "uppercase" }} />
          </label>
          <label>
            State
            <select name="buyerState" defaultValue={seller.state}>
              {GST_STATES.map(([code, name]) => (
                <option key={code} value={code}>
                  {code} · {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Email (bill is sent here)
            <input name="buyerEmail" type="email" maxLength={200} />
          </label>
          <label>
            Phone
            <input name="buyerPhone" maxLength={20} />
          </label>
          <label>
            Address
            <textarea name="buyerAddress" maxLength={400} />
          </label>
        </div>
        <h2>Sale</h2>
        <div className="grid2">
          <label>
            Description
            <input name="description" required maxLength={200} placeholder="USS coaching, 40 seats" />
          </label>
          <label>
            Amount (₹)
            <input name="amount" required inputMode="decimal" placeholder="1180" />
          </label>
          <label>
            SAC
            <input name="sac" defaultValue={seller.sac} maxLength={8} />
          </label>
          <label>
            GST rate %
            <input name="ratePercent" type="number" min={0} max={28} defaultValue={seller.ratePercent} />
          </label>
          <label>
            Paid by
            <select name="paymentMethod" defaultValue="Bank transfer">
              {["Bank transfer", "UPI", "Cash", "Cheque", "Razorpay", "Other"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            Payment reference (UTR, cheque no.)
            <input name="paymentRef" maxLength={100} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" name="includesGst" defaultChecked /> Amount includes GST (untick to add GST on top)
        </label>
        <label className="check">
          <input type="checkbox" name="sendEmail" defaultChecked /> Email the bill to the buyer
        </label>
        <div>
          <button className="btn brand" type="submit">
            Issue bill
          </button>
        </div>
      </form>
    </main>
  );
}
