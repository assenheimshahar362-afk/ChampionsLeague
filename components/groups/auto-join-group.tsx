"use client";

import { Loader2, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { joinGroupFromInvite } from "@/lib/groups/actions";

export function AutoJoinGroup({ inviteCode }: { inviteCode: string }) {
  const t = useTranslations("groupInvite");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function join() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      const result = await joinGroupFromInvite(inviteCode);
      if (result.status === "success") {
        router.replace("/profile#groups");
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 text-center">
      {failed ? (
        <p role="alert" className="text-destructive text-sm">
          {t("automaticJoinFailed")}
        </p>
      ) : null}
      <Button
        type="button"
        className="w-full"
        size="lg"
        disabled={pending}
        onClick={join}
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <UserPlus aria-hidden="true" />
        )}
        {t(pending ? "joining" : failed ? "tryAgain" : "joinNow")}
      </Button>
    </div>
  );
}
