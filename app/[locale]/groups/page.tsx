import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { isLocale } from "@/i18n/routing";

export default async function GroupsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (isLocale(locale)) setRequestLocale(locale);
  redirect(`/${locale}/profile#groups`);
}
