import { describe, expect, it } from "vitest";
import { appForRequest, billingApps, manualSeries } from "@/lib/apps";
import { amountInWords, financialYear, gstPeriod, gstr1Csv, gstr1Kind, gstr1Summary, gstSeller, invoiceNumber, placeOfSupply, splitExclusive, splitInclusive } from "@/lib/gst";
import { invoiceHtml } from "@/lib/invoice-html";
import { rupeesToPaise } from "@/lib/money";
import { billToken, billTokenOk } from "@/lib/signing";

describe("GST maths", () => {
  it("splits a GST-inclusive price into taxable value and tax", () => {
    expect(splitInclusive(118_000, 18, true)).toEqual({ taxablePaise: 100_000, cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 0, totalPaise: 118_000 });
    expect(splitInclusive(118_000, 18, false)).toEqual({ taxablePaise: 100_000, cgstPaise: 0, sgstPaise: 0, igstPaise: 18_000, totalPaise: 118_000 });
    const s = splitInclusive(39_900, 18, true);
    expect(s.taxablePaise).toBe(33_814);
    expect(s.taxablePaise + s.cgstPaise + s.sgstPaise).toBe(39_900);
  });

  it("adds GST on top of a price before tax", () => {
    expect(splitExclusive(100_000, 18, true)).toEqual({ taxablePaise: 100_000, cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 0, totalPaise: 118_000 });
    expect(splitExclusive(33_333, 18, false)).toEqual({ taxablePaise: 33_333, cgstPaise: 0, sgstPaise: 0, igstPaise: 6_000, totalPaise: 39_333 });
  });

  it("taxes in the buyer's GSTIN state, else their state, else the seller's", () => {
    const seller = { state: "32" as const };
    expect(placeOfSupply("29", seller)).toBe("29");
    expect(placeOfSupply(null, seller)).toBe("32");
    expect(placeOfSupply("99", seller)).toBe("32");
    expect(placeOfSupply("32", seller, "29ABCDE1234F1Z5")).toBe("29");
  });

  it("numbers bills per series and Indian financial year, at most 16 characters", () => {
    expect(financialYear(new Date("2027-03-31T17:30:00Z"))).toBe("2026-27");
    expect(financialYear(new Date("2027-03-31T19:00:00Z"))).toBe("2027-28");
    expect(gstPeriod(new Date("2026-11-30T19:00:00Z"))).toBe("2026-12");
    expect(invoiceNumber("QK", "2026-27", 1)).toBe("QK/26-27/000001");
    expect(invoiceNumber("RC", "2026-27", 12)).toBe("RC/26-27/000012");
    expect(invoiceNumber("MN1", "2026-27", 999_999).length).toBe(16);
  });

  it("reads the seller from the environment", () => {
    expect(gstSeller({ GST_GSTIN: "32abcde1234f1z5", GST_ADDRESS: "Kozhikode" })).toMatchObject({ gstin: "32ABCDE1234F1Z5", state: "32", sac: "999293", ratePercent: 18 });
    expect(gstSeller({ GST_GSTIN: "not-a-gstin" }).gstin).toBeNull();
  });

  it("writes the total in words and reads rupees typed by hand", () => {
    expect(amountInWords(39_900)).toBe("Rupees Three Hundred Ninety Nine Only");
    expect(rupeesToPaise("1,180.5")).toBe(118_050);
    expect(rupeesToPaise("₹ 399")).toBe(39_900);
    expect(rupeesToPaise("0")).toBeNull();
    expect(rupeesToPaise("12.345")).toBeNull();
    expect(rupeesToPaise("-5")).toBeNull();
  });
});

describe("Apps and links", () => {
  const env = { BILLING_APPS: "qk:QuizKerala:aaaaaaaaaaaaaaaaaaaaaaaaaaaa; RC:Recallio:bbbbbbbbbbbbbbbbbbbbbbbbbbbb;MN:Bad:cccccccccccccccccccccccccc;XX:Short:key;TOOLONG:X:dddddddddddddddddddddddddddd" };

  it("reads apps from BILLING_APPS, skipping bad entries and the manual series", () => {
    expect(billingApps(env).map((a) => [a.series, a.name])).toEqual([
      ["QK", "QuizKerala"],
      ["RC", "Recallio"],
    ]);
    expect(manualSeries({})).toBe("MN");
  });

  it("finds the app from its bearer key only", () => {
    const apps = billingApps(env);
    const req = (auth?: string) => new Request("https://x/api/invoices", { headers: auth ? { authorization: auth } : {} });
    expect(appForRequest(req("Bearer bbbbbbbbbbbbbbbbbbbbbbbbbbbb"), apps)?.series).toBe("RC");
    expect(appForRequest(req("Bearer nope"), apps)).toBeNull();
    expect(appForRequest(req(), apps)).toBeNull();
  });

  it("signs bill links", () => {
    const id = "6f1c1a4e-1111-4222-8333-444455556666";
    expect(billTokenOk(id, billToken(id))).toBe(true);
    expect(billTokenOk(id, "x")).toBe(false);
    expect(billTokenOk("6f1c1a4e-1111-4222-8333-444455556667", billToken(id))).toBe(false);
  });
});

describe("GSTR-1", () => {
  const row = (series: string, n: number, pos: string, total: number, gstin: string | null = null) => ({
    series,
    number: `${series}/26-27/${String(n).padStart(6, "0")}`,
    issuedAt: new Date("2026-11-10T06:00:00Z"),
    buyerName: 'Anu, "A"',
    buyerGstin: gstin,
    placeOfSupply: pos,
    sellerState: "32",
    ratePercent: 18,
    sac: "999293",
    description: "USS",
    paymentRef: `pay_${series}${n}`,
    app: series,
    ...splitInclusive(total, 18, pos === "32"),
  });

  it("sorts bills into B2B, B2C large and B2C others", () => {
    expect(gstr1Kind(row("MN", 1, "29", 500_000, "29ABCDE1234F1Z5"))).toBe("B2B");
    expect(gstr1Kind(row("MN", 1, "29", 10_000_001))).toBe("B2CL");
    expect(gstr1Kind(row("MN", 1, "32", 10_000_001))).toBe("B2CS");
    expect(gstr1Kind(row("MN", 1, "29", 10_000_000))).toBe("B2CS");
  });

  it("sums the month across apps, with each series' number range", () => {
    const rows = [row("QK", 2, "32", 39_900), row("QK", 1, "32", 11_800), row("RC", 1, "29", 11_800), row("MN", 1, "29", 118_000, "29ABCDE1234F1Z5")];
    const s = gstr1Summary(rows);
    expect(s.b2cs).toEqual([
      { placeOfSupply: "29", ratePercent: 18, taxablePaise: 10_000, cgstPaise: 0, sgstPaise: 0, igstPaise: 1_800 },
      { placeOfSupply: "32", ratePercent: 18, taxablePaise: 43_814, cgstPaise: 3_943, sgstPaise: 3_943, igstPaise: 0 },
    ]);
    expect(s.b2b.map((r) => r.number)).toEqual(["MN/26-27/000001"]);
    expect(s.hsn.map((h) => [h.kind, h.count])).toEqual([
      ["B2B", 1],
      ["B2C", 3],
    ]);
    expect(s.docs).toEqual([
      { series: "MN", from: "MN/26-27/000001", to: "MN/26-27/000001", count: 1 },
      { series: "QK", from: "QK/26-27/000001", to: "QK/26-27/000002", count: 2 },
      { series: "RC", from: "RC/26-27/000001", to: "RC/26-27/000001", count: 1 },
    ]);
    const csv = gstr1Csv(rows);
    expect(csv).toContain('"Anu, ""A"""');
    expect(csv).toContain("OE,32-Kerala,18,438.14,0.00,39.43,39.43,0.00");
    expect(csv).toContain("29ABCDE1234F1Z5,\"Anu, \"\"A\"\"\",MN/26-27/000001,2026-11-10,1180.00,29-Karnataka,N,Regular B2B,18,1000.00,0.00");
    expect(csv).toContain("Invoices for outward supply,QK/26-27/000001,QK/26-27/000002,2,0");
  });

  it("prints CGST + SGST within Kerala and IGST outside, with the buyer's GSTIN", () => {
    const base = { buyerEmail: null, buyerPhone: null, buyerAddress: "MG Road\nBengaluru", sellerGstin: "32ABCDE1234F1Z5", paymentMethod: "Bank transfer", description: "USS <course>" };
    const seller = { legalName: "Calecute", address: "Kozhikode", email: "info@x" };
    const kl = invoiceHtml({ ...row("QK", 1, "32", 11_800), ...base, buyerName: "<b>Anu</b>" }, seller);
    expect(kl).toContain("CGST @ 9%");
    expect(kl).not.toContain("IGST");
    expect(kl).toContain("&lt;b&gt;Anu&lt;/b&gt;");
    expect(kl).toContain("Unregistered");
    const ka = invoiceHtml({ ...row("MN", 1, "29", 11_800, "29ABCDE1234F1Z5"), ...base }, seller);
    expect(ka).toContain("IGST @ 18%");
    expect(ka).toContain("GSTIN: <strong>29ABCDE1234F1Z5</strong>");
    expect(ka).toContain("MG Road<br>Bengaluru");
    expect(ka).toContain("Payment: Bank transfer pay_MN1");
  });
});
