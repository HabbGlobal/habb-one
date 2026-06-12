"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Send, Copy, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  copyFromPreviousMonth,
  ensureScheduleMonth,
  publishScheduleMonth,
  revertToDraft,
} from "./actions";
import { AutoPlanButton } from "./AutoPlanButton";
import { ScheduleExportButton } from "./ScheduleExportButton";
import { BulkDeleteMenu } from "./BulkDeleteMenu";
import { DerivePersonnelButton } from "./DerivePersonnelButton";

interface AreaOption {
  id: string;
  name: string;
  colorHex: string;
}

export function ScheduleToolbar({
  year,
  month,
  monthId,
  status,
  canPublish,
  areas = [],
  currentArea = null,
  view = "month",
  weekStart,
}: {
  year: number;
  month: number;
  monthId: string | null;
  status: string;
  canPublish: boolean;
  areas?: AreaOption[];
  currentArea?: string | null;
  view?: "month" | "week";
  weekStart?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  // Build URLs that preserve view-mode and area filter.
  const buildUrl = (overrides: { weekStart?: string; year?: string; month?: string }): string => {
    const merged = new URLSearchParams();
    if (view === "week") {
      merged.set("view", "week");
      merged.set("weekStart", overrides.weekStart ?? weekStart ?? "");
    } else {
      merged.set("year", overrides.year ?? String(year));
      merged.set("month", overrides.month ?? String(month));
    }
    if (currentArea) merged.set("area", currentArea);
    return `/admin/schedule?${merged.toString()}`;
  };

  const prevHref =
    view === "week"
      ? buildUrl({ weekStart: shiftDays(weekStart, -7) })
      : buildUrl({ year: String(prevYear), month: String(prevMonth) });
  const nextHref =
    view === "week"
      ? buildUrl({ weekStart: shiftDays(weekStart, 7) })
      : buildUrl({ year: String(nextYear), month: String(nextMonth) });
  const todayHref =
    view === "week"
      ? buildUrl({ weekStart: startOfIsoWeekStr(new Date()) })
      : "/admin/schedule";

  const onAreaChange = (next: string) => {
    const params = new URLSearchParams();
    if (view === "week") {
      params.set("view", "week");
      params.set("weekStart", weekStart ?? "");
    } else {
      params.set("year", String(year));
      params.set("month", String(month));
    }
    if (next && next !== "all") params.set("area", next);
    router.push(`/admin/schedule?${params.toString()}`);
  };

  const switchView = (next: "month" | "week") => {
    if (next === view) return;
    const params = new URLSearchParams();
    if (next === "week") {
      params.set("view", "week");
      // Anchor to a Monday inside the currently displayed range.
      const ws =
        weekStart ??
        startOfIsoWeekStr(
          new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00.000Z`)
        );
      params.set("weekStart", ws);
    } else {
      // Switch back to month: derive year/month from current weekStart.
      if (weekStart) {
        const [y, m] = weekStart.split("-").map(Number);
        params.set("year", String(y));
        params.set("month", String(m));
      } else {
        params.set("year", String(year));
        params.set("month", String(month));
      }
    }
    if (currentArea) params.set("area", currentArea);
    router.push(`/admin/schedule?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* View toggle */}
      <div className="inline-flex rounded-md border bg-background overflow-hidden">
        <button
          type="button"
          onClick={() => switchView("month")}
          className={cn(
            "px-3 py-1.5 text-sm",
            view === "month" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
          )}
        >Month</button>
        <button
          type="button"
          onClick={() => switchView("week")}
          className={cn(
            "px-3 py-1.5 text-sm border-l",
            view === "week" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
          )}
        >Week</button>
      </div>

      <Button asChild variant="outline" size="sm">
        <Link href={prevHref} aria-label={view === "week" ? "Previous week" : "Previous month"}>
          <ChevronLeft className="h-4 w-4" />
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link href={todayHref}>
          {view === "week" ? "Current week" : "Current month"}
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link href={nextHref} aria-label={view === "week" ? "Next week" : "Next month"}>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </Button>

      {areas.length > 0 && (
        <Select
          value={currentArea ?? "all"}
          onChange={(e) => onAreaChange(e.target.value)}
          className="w-44 ml-2"
          aria-label="Filter area"
        >
          <option value="all">All areas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      )}

      <span className="flex-1" />

      <AutoPlanButton year={year} month={month} />
      <DerivePersonnelButton
        anchorDate={
          view === "week"
            ? weekStart ?? new Date().toISOString().slice(0, 10)
            : `${year}-${String(month).padStart(2, "0")}-15`
        }
        view={view}
        rangeLabel={
          view === "week" ? `Woche ab ${weekStart ?? ""}` : `${month}/${year}`
        }
      />
      <ScheduleExportButton
        year={year}
        month={month}
        areas={areas.map((a) => ({ id: a.id, name: a.name }))}
      />

      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Copy from previous month (${prevMonth}/${prevYear}) as template? Existing entries remain.`)) return;
          start(async () => {
            try {
              const res = await copyFromPreviousMonth(year, month);
              alert(`${res.created} entries copied.`);
              router.refresh();
            } catch (err) {
              alert(err instanceof Error ? err.message : "Error");
            }
          });
        }}
      >
        <Copy className="mr-2 h-4 w-4" />Copy previous month
      </Button>

      <BulkDeleteMenu
        anchorDate={
          view === "week"
            ? weekStart ?? new Date().toISOString().slice(0, 10)
            : `${year}-${String(month).padStart(2, "0")}-15`
        }
        view={view}
        workAreaId={currentArea}
        workAreaName={
          currentArea ? areas.find((a) => a.id === currentArea)?.name ?? null : null
        }
        rangeLabel={
          view === "week"
            ? `Woche ab ${weekStart ?? ""}`
            : `${month}/${year}`
        }
      />

      {canPublish && status !== "PUBLISHED" && (
        <Button
          size="sm"
          disabled={pending || !monthId}
          onClick={() => {
            if (!monthId) {
              start(async () => {
                await ensureScheduleMonth(year, month);
                router.refresh();
              });
              return;
            }
            if (!confirm(`Publish planning ${month}/${year}? Employees will see it afterwards.`)) return;
            start(async () => {
              try {
                await publishScheduleMonth(monthId);
                router.refresh();
              } catch (err) {
                alert(err instanceof Error ? err.message : "Error");
              }
            });
          }}
        >
          <Send className="mr-2 h-4 w-4" />
          {status === "CHANGED_AFTER_PUBLISHING" ? "Publish again" : "Publish"}
        </Button>
      )}

      {canPublish && status === "PUBLISHED" && monthId && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            if (!confirm("Revert to draft? Employees will no longer see the planning.")) return;
            start(async () => {
              try {
                await revertToDraft(monthId);
                router.refresh();
              } catch (err) {
                alert(err instanceof Error ? err.message : "Error");
              }
            });
          }}
        >
          <Undo2 className="mr-2 h-4 w-4" />
          Revert to draft
        </Button>
      )}
    </div>
  );
}

/** Add `delta` days to a YYYY-MM-DD string and return a YYYY-MM-DD string. */
function shiftDays(dateStr: string | undefined, delta: number): string {
  const base = dateStr ?? new Date().toISOString().slice(0, 10);
  const d = new Date(`${base}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Returns the YYYY-MM-DD string for the Monday of the ISO week containing `d`. */
function startOfIsoWeekStr(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const wd = (x.getUTCDay() + 6) % 7; // Mon=0
  x.setUTCDate(x.getUTCDate() - wd);
  return x.toISOString().slice(0, 10);
}
