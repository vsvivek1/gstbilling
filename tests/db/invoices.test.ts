import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/invoices/route";
import { gstSeller } from "@/lib/gst";
import { billToken } from "@/lib/signing";
import { invoicesForPeriod, issueInvoice, listCustomerInvoices } from "@/server/invoices";
import { db } from "@/db";

const seller = gstSeller({ GST_GSTIN: "32ABCDE1234F1Z5", GST_ADDRESS: "Kozhikode, Kerala" });
const base = { product: "uss", description: "USS course", buyerName: "Anu" };

describe("issueInvoice", () => {
  it("refuses until the GSTIN is set", async () => {
    await expect(issueInvoice({ ...base, series: "QK", paymentRef: "p0", amountPaise: 100 }, db, gstSeller({}))).rejects.toThrow(/GST_GSTIN/);
  });

  it("numbers each series on its own, once per payment, consecutively under load", async () => {
    const at = new Date("2031-05-10T06:00:00Z"); // FY 2031-32, used only here
    const a = await issueInvoice({ ...base, series: "QK", paymentRef: "pay_a", amountPaise: 39_900, customerRef: "u1" }, db, seller, at);
    expect(a.created).toBe(true);
    expect(a.invoice).toMatchObject({ number: "QK/31-32/000001", placeOfSupply: "32", taxablePaise: 33_814, igstPaise: 0, totalPaise: 39_900 });

    // Retried payment: same bill.
    const again = await issueInvoice({ ...base, series: "QK", paymentRef: "pay_a", amountPaise: 39_900 }, db, seller, at);
    expect(again).toMatchObject({ created: false, invoice: { id: a.invoice.id } });

    // The same payment id in another app is a different payment.
    const rc = await issueInvoice({ ...base, series: "RC", paymentRef: "pay_a", amountPaise: 9_900, buyerState: "29" }, db, seller, at);
    expect(rc.invoice).toMatchObject({ number: "RC/31-32/000001", placeOfSupply: "29", igstPaise: 1_510 });

    // Ten at once still get 2..11 with no gaps.
    const many = await Promise.all(
      Array.from({ length: 10 }, (_, i) => issueInvoice({ ...base, series: "QK", paymentRef: `pay_m${i}`, amountPaise: 11_800, customerRef: i < 2 ? "u1" : null }, db, seller, at)),
    );
    expect(many.map((m) => m.invoice.seq).sort((x, y) => x - y)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

    // Manual bills without a payment ref, B2B by GSTIN, priced before GST.
    const m1 = await issueInvoice({ ...base, series: "MN", amountPaise: 100_000, amountIncludesGst: false, buyerGstin: "29abcde1234f1z5", buyerState: "32" }, db, seller, at);
    const m2 = await issueInvoice({ ...base, series: "MN", amountPaise: 100_000 }, db, seller, at);
    expect(m1.invoice).toMatchObject({ number: "MN/31-32/000001", buyerGstin: "29ABCDE1234F1Z5", placeOfSupply: "29", taxablePaise: 100_000, igstPaise: 18_000, totalPaise: 118_000 });
    expect(m2.invoice.number).toBe("MN/31-32/000002");

    expect(await invoicesForPeriod("2031-05", "RC")).toHaveLength(1);
    expect(await invoicesForPeriod("2031-05")).toHaveLength(14);
    expect(await invoicesForPeriod("2031-06")).toEqual([]);
    expect((await listCustomerInvoices("QK", "u1")).length).toBe(3);
    expect(await listCustomerInvoices("RC", "u1")).toEqual([]);
  });
});

describe("POST /api/invoices", () => {
  const call = (body: unknown, key = "qk-key-qk-key-qk-key-qk-key") =>
    POST(new Request("https://bills.test/api/invoices", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body) }));
  const body = { paymentRef: "pay_api1", product: "app", description: "QuizKerala app", amountPaise: 49_900, customerRef: "user_9", buyer: { name: "Raj", email: "raj@example.com", state: "33" } };

  it("issues in the key's own series and returns the bill link", async () => {
    const res = await call(body);
    expect(res.status).toBe(201);
    const { invoice } = await res.json();
    expect(invoice.number).toMatch(/^QK\/\d\d-\d\d\/\d{6}$/);
    expect(invoice).toMatchObject({ series: "QK", placeOfSupply: "33-Tamil Nadu", totalPaise: 49_900, total: "499.00", emailed: true });
    expect(invoice.url).toBe(`https://bills.test/bills/${invoice.id}?t=${billToken(invoice.id)}`);

    const repeat = await call(body);
    expect(repeat.status).toBe(200);
    expect((await repeat.json()).invoice.id).toBe(invoice.id);

    const rc = await call(body, "rc-key-rc-key-rc-key-rc-key");
    expect((await rc.json()).invoice.series).toBe("RC");

    const list = await GET(new Request("https://bills.test/api/invoices?customerRef=user_9", { headers: { authorization: "Bearer qk-key-qk-key-qk-key-qk-key" } }));
    expect((await list.json()).invoices.map((i: { id: string }) => i.id)).toEqual([invoice.id]);
    const one = await GET(new Request("https://bills.test/api/invoices?paymentRef=pay_api1", { headers: { authorization: "Bearer rc-key-rc-key-rc-key-rc-key" } }));
    expect((await one.json()).invoice.series).toBe("RC");
  });

  it("rejects bad keys and bad bills", async () => {
    expect((await call(body, "wrong")).status).toBe(401);
    const bad = await call({ ...body, amountPaise: -1, buyer: { name: "", state: "99", gstin: "nope" } });
    expect(bad.status).toBe(400);
    expect((await bad.json()).issues.join(" ")).toMatch(/amountPaise.*buyer\.name.*buyer\.state.*buyer\.gstin/);
  });
});
