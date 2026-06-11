"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { deleteHoliday } from "./actions";

export function DeleteHolidayButton({ id }: { id: string }) {
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (!confirm(t("delete") + "?")) return;
        start(async () => {
          await deleteHoliday(id);
          router.refresh();
        });
      }}
    >
      {t("delete")}
    </Button>
  );
}
