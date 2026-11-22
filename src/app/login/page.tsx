import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminCookieOptions, adminCookieValue, passwordOk } from "@/lib/admin-auth";

export const metadata = { title: "Sign in" };

async function signIn(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  if (!passwordOk(password)) redirect("/login?wrong=1");
  (await cookies()).set(ADMIN_COOKIE, adminCookieValue(), adminCookieOptions);
  redirect("/admin");
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const wrong = (await searchParams).wrong;
  const configured = (process.env.ADMIN_PASSWORD ?? "").length >= 8;
  return (
    <main style={{ maxWidth: 380 }}>
      <h1>GST billing</h1>
      {!configured && <p className="error">Set ADMIN_PASSWORD (8+ characters) in the environment first.</p>}
      {wrong && <p className="error">Wrong password.</p>}
      <form action={signIn} className="card" style={{ display: "grid", gap: 12 }}>
        <label>
          Password
          <input type="password" name="password" autoComplete="current-password" required autoFocus />
        </label>
        <button className="btn brand" type="submit">
          Sign in
        </button>
      </form>
    </main>
  );
}
