"use client";

import { useState } from "react";
import { Pencil, History } from "lucide-react";
import {
  ParameterEditDialog,
  type ParameterDialogData,
} from "./ParameterEditDialog";

interface Props {
  param: ParameterDialogData & {
    lastChangedAt: Date;
    lastChangedBy: string | null;
    historyCount: number;
  };
  canWrite: boolean;
  onShowHistory: () => void;
}

export function ParameterRow({ param, canWrite, onShowHistory }: Props) {
  const [editing, setEditing] = useState(false);
  const isCustom = param.currentValue !== param.defaultValue;

  return (
    <>
      <tr className="hover:bg-accent/30">
        <td className="p-2 align-top">
          <div className="font-medium text-sm">{param.label}</div>
          <div className="text-[11px] text-muted-foreground font-mono">{param.key}</div>
        </td>
        <td className="p-2 align-top text-right tabular-nums whitespace-nowrap">
          <span className={isCustom ? "font-semibold text-habb-red" : ""}>
            {param.currentValue}
          </span>
          {param.unit && (
            <span className="ml-1 text-xs text-muted-foreground">{param.unit}</span>
          )}
        </td>
        <td className="p-2 align-top text-right text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {param.defaultValue}
        </td>
        <td className="p-2 align-top text-xs text-muted-foreground whitespace-nowrap">
          {param.lastChangedBy ?? "—"}
          <br />
          <span className="text-[10px]">
            {new Intl.DateTimeFormat("de-CH", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            }).format(param.lastChangedAt)}
          </span>
        </td>
        <td className="p-2 align-top text-right">
          <div className="inline-flex gap-1">
            {param.historyCount > 0 && (
              <button
                type="button"
                onClick={onShowHistory}
                className="p-1.5 rounded hover:bg-accent"
                title={`${param.historyCount} Änderungen ansehen`}
                aria-label="Verlauf"
              >
                <History className="h-3.5 w-3.5" />
              </button>
            )}
            {canWrite && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="p-1.5 rounded hover:bg-accent"
                aria-label="Edit"
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>
      {editing && (
        <ParameterEditDialog param={param} onClose={() => setEditing(false)} />
      )}
    </>
  );
}
