import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (32+ characters)");
  return s;
}

export function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function verify(value: string, signature: string): boolean {
  const want = Buffer.from(sign(value));
  const got = Buffer.from(signature);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The secret part of a bill's link: only someone given the link can open it. */
export function billToken(id: string): string {
  return sign(`bill:${id}`).slice(0, 24);
}

export function billPath(id: string): string {
  return `/bills/${id}?t=${billToken(id)}`;
}

/** Full link to a bill, for emails and API answers. */
export function billUrl(id: string, origin: string = process.env.PUBLIC_URL ?? ""): string {
  return `${origin.replace(/\/$/, "")}${billPath(id)}`;
}

export function billTokenOk(id: string, token: string | null): boolean {
  if (!token) return false;
  const want = Buffer.from(billToken(id));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}
