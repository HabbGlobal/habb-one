"use client";

// Reusable selectable list + bulk-action bar for admin views.
//
// Caller provides:
//   - rows: data items with stable string IDs
//   - columns: how to render each cell
//   - editHref: produces a per-row pencil-icon link
//   - bulk: server actions to call when the user clicks Archive/Delete/Restore
//   - view: which lifecycle bucket we are showing (governs which actions show)
//
// The list owns its own selection state. Bulk actions are server actions
// imported from the page's actions.ts so the call goes through Next.js's
// RPC pipeline directly.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2, Archive, RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LifecycleView } from "@/lib/lifecycle";

export interface ColumnDef<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

export interface BulkHandlers {
  archive?: (ids: string[]) => Promise<void>;
  delete?: (ids: string[]) => Promise<void>;
  restore?: (ids: string[]) => Promise<void>;
  hardDelete?: (ids: string[]) => Promise<void>;
}

export interface SelectableListProps<T> {
  rows: T[];
  columns: ColumnDef<T>[];
  getId: (row: T) => string;
  editHref?: (row: T) => string;
  view: LifecycleView;
  bulk?: BulkHandlers;
  emptyText?: string;
}

export function SelectableList<T>({
  rows,
  columns,
  getId,
  editHref,
  view,
  bulk,
  emptyText = "No entries.",
}: SelectableListProps<T>) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, start] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const router = useRouter();

  const allIds = useMemo(() => rows.map(getId), [rows, getId]);
  const allSelected = selected.size > 0 && selected.size === allIds.length;
  const partiallySelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(allIds));
  };

  const toggleOne = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBulk = (
    label: string,
    fn: ((ids: string[]) => Promise<void>) | undefined,
    confirmText?: string
  ) => {
    if (!fn || selected.size === 0) return;
    if (confirmText && !confirm(confirmText)) return;

    const ids = Array.from(selected);

    start(async () => {
      try {
        await fn(ids);
        setSelected(new Set());
        setFeedback(
          `${label}: ${ids.length} item${ids.length === 1 ? "" : "s"}`
        );
        router.refresh();
        setTimeout(() => setFeedback(null), 3000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error";
        alert(msg);
      }
    });
  };

  return (
    <div className="space-y-3">
      {selected.size > 0 && bulk && (
        <div className="sticky top-0 z-10 flex items-center gap-2 rounded-lg border bg-card px-4 py-2 shadow-sm">
          <span className="text-sm font-medium">
            {selected.size} selected
          </span>

          <span className="flex-1" />

          {view === "active" && bulk.archive && (
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => runBulk("Archived", bulk.archive)}
            >
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </Button>
          )}

          {view !== "deleted" && bulk.delete && (
            <Button
              variant="destructive"
              size="sm"
              disabled={isPending}
              onClick={() =>
                runBulk(
                  "Moved to trash",
                  bulk.delete,
                  `Move ${selected.size} item(s) to trash?`
                )
              }
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}

          {view !== "active" && bulk.restore && (
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => runBulk("Restored", bulk.restore)}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Restore
            </Button>
          )}

          {view === "deleted" && bulk.hardDelete && (
            <Button
              variant="destructive"
              size="sm"
              disabled={isPending}
              onClick={() =>
                runBulk(
                  "Permanently deleted",
                  bulk.hardDelete,
                  `Permanently delete ${selected.size} item(s)? This action cannot be undone.`
                )
              }
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Permanently Delete
            </Button>
          )}
        </div>
      )}

      {feedback && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          <Check className="h-4 w-4" />
          {feedback}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            {bulk && (
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = partiallySelected;
                  }}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
            )}

            {columns.map((c, i) => (
              <TableHead key={i} className={c.className}>
                {c.header}
              </TableHead>
            ))}

            {editHref && <TableHead className="w-12"></TableHead>}
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={columns.length + (bulk ? 1 : 0) + (editHref ? 1 : 0)}
                className="py-10 text-center text-muted-foreground"
              >
                {emptyText}
              </TableCell>
            </TableRow>
          )}

          {rows.map((row) => {
            const id = getId(row);
            const isSelected = selected.has(id);

            return (
              <TableRow
                key={id}
                className={cn(isSelected && "bg-accent/40")}
              >
                {bulk && (
                  <TableCell>
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer"
                      checked={isSelected}
                      onChange={() => toggleOne(id)}
                      aria-label="Select"
                    />
                  </TableCell>
                )}

                {columns.map((c, i) => (
                  <TableCell key={i} className={c.className}>
                    {c.cell(row)}
                  </TableCell>
                ))}

                {editHref && (
                  <TableCell>
                    <Link
                      href={editHref(row)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded transition hover:bg-accent"
                      aria-label="Edit"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}