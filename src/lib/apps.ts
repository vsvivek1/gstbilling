import { createHash, timingSafeEqual } from "node:crypto";
import { isSeries } from "./gst";

/** An app allowed to issue bills: its invoice series, display name and API key. */
export type BillingApp = { series: string; name: string; key: string };

/** The series the admin uses for manual bills (sales outside any app). */
export function manualSeries(env: Record<string, string | undefined> = process.env): string {
  const s = env.MANUAL_SERIES?.trim().toUpperCase();
  return isSeries(s) ? s : "MN";
}

/**
 * Apps from BILLING_APPS: "QK:QuizKerala:<key>;RC:Recallio:<key>". Each app's
 * key can only issue bills in that app's own series. Entries with a bad series,
 * a key shorter than 24 characters, or the manual series are skipped.
 */
export function billingApps(env: Record<string, string | undefined> = process.env): BillingApp[] {
  const manual = manualSeries(env);
  const seen = new Set<string>();
  const apps: BillingApp[] = [];
  for (const entry of (env.BILLING_APPS ?? "").split(/[;\n]/)) {
    const [series, name, ...rest] = entry.trim().split(":");
    const key = rest.join(":").trim();
    const s = series?.trim().toUpperCase();
    if (!isSeries(s) || s === manual || seen.has(s) || !name?.trim() || key.length < 24) continue;
    seen.add(s);
    apps.push({ series: s, name: name.trim(), key });
  }
  return apps;
}

const digest = (s: string) => createHash("sha256").update(s).digest();

/** The app whose key is in "Authorization: Bearer <key>", or null. */
export function appForRequest(req: Request, apps: BillingApp[] = billingApps()): BillingApp | null {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return null;
  const given = digest(m[1]);
  return apps.find((a) => timingSafeEqual(digest(a.key), given)) ?? null;
}

/** Display name of a series, for the admin. */
export function seriesName(series: string, apps: BillingApp[] = billingApps()): string {
  if (series === manualSeries()) return "Manual";
  return apps.find((a) => a.series === series)?.name ?? series;
}
