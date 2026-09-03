import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function configuredAdminEmails(): Set<string> {
  return new Set(
    (process.env.APP_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLocaleLowerCase())
      .filter(Boolean)
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && configuredAdminEmails().has(email.toLocaleLowerCase()));
}

export async function requireAdmin(locale: string) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) redirect(`/${locale}/sign-in?next=/${locale}/admin`);
  if (!isAdminEmail(user.email)) redirect(`/${locale}`);
  return user;
}
