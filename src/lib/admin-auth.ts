import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sign, verify } from "./signing";

export const ADMIN_COOKIE = "gb_admin";
const DAYS = 30;

/** ADMIN_PASSWORD matches (compared in constant time). */
export function passwordOk(given: string): boolean {
  const want = process.env.ADMIN_PASSWORD ?? "";
  if (want.length < 8) return false;
  const d = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(d(want), d(given));
}

/** Cookie value: expiry + signature (signed with AUTH_SECRET and the password, so changing either signs everyone out). */
export function adminCookieValue(now = Date.now()): string {
  const exp = String(now + DAYS * 86_400_000);
  return `${exp}.${sign(`admin:${exp}:${process.env.ADMIN_PASSWORD ?? ""}`)}`;
}

export function adminCookieOk(value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || !(Number(exp) > now)) return false;
  return verify(`admin:${exp}:${process.env.ADMIN_PASSWORD ?? ""}`, sig);
}

export async function isAdmin(): Promise<boolean> {
  return adminCookieOk((await cookies()).get(ADMIN_COOKIE)?.value);
}

/** For pages and server actions: send anyone not signed in to the sign-in page. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/login");
}

export const adminCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: DAYS * 86_400 };
