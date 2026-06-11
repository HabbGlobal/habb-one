// DB-basierte Process-Templates.
//
// Bisher (Phase 3) waren die Vorlagen hardcoded in `lib/order/process-templates.ts`.
// Jetzt leben sie in der Tabelle `ProcessTemplate` + `ProcessTemplateStep`.
// Admin kann sie via UI bearbeiten — Order- und Quote-Wizard laden sie aus
// dieser Tabelle.

import type { PrismaClient, MachineType, SkillCode, ProcessCode } from "@prisma/client";
import { PROCESS_RESOURCES } from "@/lib/order/process-templates";

export interface TemplateStepDTO {
  sequence: number;
  processCode: ProcessCode;
  machineTypeRequired: MachineType | null;
  skillRequired: SkillCode;
  defaultWaitMinutes: number;
  notes: string | null;
}

export interface TemplateDTO {
  id: string;
  key: string | null;
  label: string;
  description: string | null;
  sortOrder: number;
  steps: TemplateStepDTO[];
  archivedAt: Date | null;
}

/**
 * Lädt alle aktiven (nicht archivierten / nicht gelöschten) Templates der
 * Firma. Steps sind nach `sequence` sortiert.
 */
export async function loadActiveTemplates(
  prisma: PrismaClient,
  companyId: string,
): Promise<TemplateDTO[]> {
  const rows = await prisma.processTemplate.findMany({
    where: { companyId, archivedAt: null, deletedAt: null },
    include: { steps: { orderBy: { sequence: "asc" } } },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  return rows.map(toDto);
}

type Row = {
  id: string;
  key: string | null;
  label: string;
  description: string | null;
  sortOrder: number;
  archivedAt: Date | null;
  steps: Array<{
    sequence: number;
    processCode: ProcessCode;
    machineTypeRequired: MachineType | null;
    skillRequired: SkillCode;
    defaultWaitMinutes: number;
    notes: string | null;
  }>;
};

function toDto(t: Row): TemplateDTO {
  return {
    id: t.id,
    key: t.key,
    label: t.label,
    description: t.description,
    sortOrder: t.sortOrder,
    archivedAt: t.archivedAt,
    steps: t.steps.map((s) => ({
      sequence: s.sequence,
      processCode: s.processCode,
      machineTypeRequired: s.machineTypeRequired,
      skillRequired: s.skillRequired,
      defaultWaitMinutes: s.defaultWaitMinutes,
      notes: s.notes,
    })),
  };
}

/**
 * Erweitert ein DB-Template auf Step-Skelette mit Default-Sequenzen 10/20/30.
 * Wird vom OrderWizard / QuoteWizard verwendet wenn der User "Vorlage anwenden"
 * klickt.
 */
export function expandTemplateDto(t: TemplateDTO): TemplateStepDTO[] {
  // Renumbering auf 10er-Schritte falls Steps vom Admin in unregelmäßigen
  // Sequenzen erfasst wurden.
  return t.steps.map((s, i) => ({
    ...s,
    sequence: (i + 1) * 10,
  }));
}

/** Re-Export — für Code der nur die Resource-Map braucht. */
export { PROCESS_RESOURCES };
