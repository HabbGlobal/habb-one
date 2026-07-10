/**
 * Regression for the Time Entries ↔ Attendance sheet desync: deleting a
 * break punch via an admin correction must also clean up the matching
 * BreakEntry row, since the Attendance sheet renders break intervals /
 * live-break state from BreakEntry, not from TimePunch. See #15.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  timePunchFindUniqueOrThrow: vi.fn(),
  timePunchDelete: vi.fn(),
  breakEntryDeleteMany: vi.fn(),
  breakEntryUpdateMany: vi.fn(),
  timeEntryFindUniqueOrThrow: vi.fn(),
  timeEntryUpdate: vi.fn(),
  recordAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    timePunch: {
      findUniqueOrThrow: mocks.timePunchFindUniqueOrThrow,
      delete: mocks.timePunchDelete,
    },
    breakEntry: {
      deleteMany: mocks.breakEntryDeleteMany,
      updateMany: mocks.breakEntryUpdateMany,
    },
    timeEntry: {
      findUniqueOrThrow: mocks.timeEntryFindUniqueOrThrow,
      update: mocks.timeEntryUpdate,
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: "u1", companyId: "c1", role: "OWNER" },
  }),
}));

vi.mock("@/lib/permissions", () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/audit", () => ({
  recordAudit: mocks.recordAudit,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { deletePunch } from "@/app/admin/time-entries/actions";

beforeEach(() => {
  for (const m of Object.values(mocks)) {
    if (typeof m === "function" && "mockReset" in m) m.mockReset();
  }
  mocks.recordAudit.mockResolvedValue(undefined);
  mocks.timeEntryFindUniqueOrThrow.mockResolvedValue({
    id: "cma00000000000000000002",
    punches: [],
    breaks: [],
  });
  mocks.timeEntryUpdate.mockResolvedValue({});
});

function mockPunch(type: "BREAK_START" | "BREAK_END" | "CLOCK_IN" | "CLOCK_OUT", occurredAt: Date) {
  mocks.timePunchFindUniqueOrThrow.mockResolvedValue({
    id: "cma00000000000000000001",
    timeEntryId: "cma00000000000000000002",
    employeeId: "e1",
    type,
    occurredAt,
    timeEntry: { employee: { companyId: "c1" } },
  });
}

describe("deletePunch — BreakEntry sync (#15)", () => {
  it("deletes the matching BreakEntry when a BREAK_START punch is deleted", async () => {
    const startedAt = new Date("2026-07-03T09:41:00Z");
    mockPunch("BREAK_START", startedAt);

    await deletePunch({ punchId: "cma00000000000000000001", timeEntryId: "cma00000000000000000002", reason: "test" });

    expect(mocks.breakEntryDeleteMany).toHaveBeenCalledWith({
      where: { timeEntryId: "cma00000000000000000002", startedAt },
    });
    expect(mocks.breakEntryUpdateMany).not.toHaveBeenCalled();
  });

  it("reopens the matching BreakEntry when a BREAK_END punch is deleted", async () => {
    const endedAt = new Date("2026-07-03T09:42:00Z");
    mockPunch("BREAK_END", endedAt);

    await deletePunch({ punchId: "cma00000000000000000001", timeEntryId: "cma00000000000000000002", reason: "test" });

    expect(mocks.breakEntryUpdateMany).toHaveBeenCalledWith({
      where: { timeEntryId: "cma00000000000000000002", endedAt },
      data: { endedAt: null, minutes: null },
    });
    expect(mocks.breakEntryDeleteMany).not.toHaveBeenCalled();
  });

  it("does not touch BreakEntry when deleting a CLOCK_IN/CLOCK_OUT punch", async () => {
    mockPunch("CLOCK_OUT", new Date("2026-07-03T12:12:00Z"));

    await deletePunch({ punchId: "cma00000000000000000001", timeEntryId: "cma00000000000000000002", reason: "test" });

    expect(mocks.breakEntryDeleteMany).not.toHaveBeenCalled();
    expect(mocks.breakEntryUpdateMany).not.toHaveBeenCalled();
  });
});
