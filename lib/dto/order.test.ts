// Tests für die Status-Workflow-Helper. Hält die zulässigen Übergänge
// in Deckung mit dem Briefing (Sektion 4).

import { describe, expect, it } from "vitest";
import { allowedNextStatuses, statusLabel, priorityLabel } from "./order";

describe("allowedNextStatuses", () => {
  it("DRAFT darf nach CONFIRMED oder CANCELLED", () => {
    expect(allowedNextStatuses("DRAFT").sort()).toEqual(["CANCELLED", "CONFIRMED"]);
  });

  it("CONFIRMED darf nach IN_PROGRESS / ON_HOLD / CANCELLED", () => {
    expect(allowedNextStatuses("CONFIRMED").sort()).toEqual([
      "CANCELLED",
      "IN_PROGRESS",
      "ON_HOLD",
    ]);
  });

  it("IN_PROGRESS darf nach ON_HOLD / COMPLETED / CANCELLED", () => {
    expect(allowedNextStatuses("IN_PROGRESS").sort()).toEqual([
      "CANCELLED",
      "COMPLETED",
      "ON_HOLD",
    ]);
  });

  it("ON_HOLD darf nach IN_PROGRESS / CANCELLED", () => {
    expect(allowedNextStatuses("ON_HOLD").sort()).toEqual([
      "CANCELLED",
      "IN_PROGRESS",
    ]);
  });

  it("COMPLETED darf nach DELIVERED / INVOICED", () => {
    expect(allowedNextStatuses("COMPLETED").sort()).toEqual(["DELIVERED", "INVOICED"]);
  });

  it("INVOICED und CANCELLED sind End-Status", () => {
    expect(allowedNextStatuses("INVOICED")).toEqual([]);
    expect(allowedNextStatuses("CANCELLED")).toEqual([]);
  });
});

describe("statusLabel / priorityLabel", () => {
  it("liefert deutsche Bezeichnungen für alle Status", () => {
    expect(statusLabel("DRAFT")).toBe("Entwurf");
    expect(statusLabel("CONFIRMED")).toBe("Bestätigt");
    expect(statusLabel("IN_PROGRESS")).toBe("In Arbeit");
    expect(statusLabel("DELIVERED")).toBe("Geliefert");
  });

  it("liefert deutsche Bezeichnungen für alle Prioritäten", () => {
    expect(priorityLabel("LOW")).toBe("Niedrig");
    expect(priorityLabel("EXPRESS")).toBe("Express");
  });
});
