"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Archive, Trash2, RotateCcw } from "lucide-react";
import {
  archiveTemplate,
  deleteTemplate,
  restoreTemplate,
} from "../actions";

export function TemplateLifecycleActions({
  templateId,
  isArchived,
  isDeleted,
}: {
  templateId: string;
  isArchived: boolean;
  isDeleted: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<void>, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setError(null);
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler.");
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {!isArchived && !isDeleted && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              run(
                () => archiveTemplate(templateId),
                "Vorlage archivieren? Sie ist danach im Wizard nicht mehr wählbar — bestehende Aufträge bleiben unverändert.",
              )
            }
            disabled={pending}
          >
            <Archive className="h-4 w-4 mr-1" /> Archivieren
          </Button>
        )}
        {(isArchived || isDeleted) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => run(() => restoreTemplate(templateId))}
            disabled={pending}
          >
            <RotateCcw className="h-4 w-4 mr-1" /> Wiederherstellen
          </Button>
        )}
        {!isDeleted && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() =>
              run(
                () => deleteTemplate(templateId),
                "Vorlage in den Papierkorb verschieben? Bestehende Aufträge sind nicht betroffen.",
              )
            }
            disabled={pending}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Löschen
          </Button>
        )}
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
