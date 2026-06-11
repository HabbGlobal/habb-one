// Shared helpers for the soft-delete + archive lifecycle.
//
// Lifecycle states:
//   - ACTIVE   : archivedAt = null AND deletedAt = null
//   - ARCHIVED : archivedAt set,    deletedAt = null
//   - DELETED  : deletedAt set      (kept in DB for audit / restore)
//
// All admin lists default to ACTIVE; ?view=archived and ?view=deleted reveal
// the other folders. Restoring an item just clears the corresponding
// timestamps.

export type LifecycleView = "active" | "archived" | "deleted";

export const LIFECYCLE_VIEWS: LifecycleView[] = ["active", "archived", "deleted"];

export function parseView(value: string | undefined): LifecycleView {
  if (value === "archived" || value === "deleted") return value;
  return "active";
}

/** Returns the Prisma where-clause filter for the given lifecycle view. */
export function lifecycleFilter(view: LifecycleView) {
  switch (view) {
    case "active":
      return { archivedAt: null, deletedAt: null };
    case "archived":
      return { archivedAt: { not: null }, deletedAt: null };
    case "deleted":
      return { deletedAt: { not: null } };
  }
}

export function lifecycleLabel(view: LifecycleView): string {
  return { active: "Aktiv", archived: "Archiv", deleted: "Papierkorb" }[view];
}
