import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, requireAdmin } from "@/lib/admin-auth";

async function signOut() {
  "use server";
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/login");
}

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <>
      <header className="top">
        <strong>Calecute GST billing</strong>
        <Link href="/admin">Bills</Link>
        <Link href="/admin/new">New manual bill</Link>
        <form action={signOut}>
          <button className="btn" type="submit">
            Sign out
          </button>
        </form>
      </header>
      {children}
    </>
  );
}
