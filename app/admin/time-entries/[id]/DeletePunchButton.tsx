"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { deletePunch } from "../actions";

export function DeletePunchButton({ punchId, timeEntryId }: { punchId: string; timeEntryId: string }) {
  const t = useTranslations("timeEntries");
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        const reason = prompt(t("correctionReason"));
        if (!reason) return;
        start(async () => {
          await deletePunch({ punchId, timeEntryId, reason });
          router.refresh();
        });
      }}
    >
      {t("deletePunch")}
    </Button>
  );
}
