-- CreateEnum
CREATE TYPE "ScheduleEntrySource" AS ENUM ('MANUAL', 'AUTO', 'COPIED');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('DE', 'FR', 'IT', 'EN');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('PRIVATE', 'BUSINESS');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('BILLING', 'SHIPPING', 'BOTH');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'DELIVERED', 'CANCELLED', 'INVOICED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'EXPRESS');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('PENDING', 'SCHEDULED', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProcessCode" AS ENUM ('DISASSEMBLY', 'DEGREASE_MANUAL', 'CHEM_PRETREAT', 'MASKING', 'MOUNTING', 'BLAST_SA1', 'BLAST_SA2', 'BLAST_SA25', 'BLAST_SA3', 'BLAST_GLASS', 'WP_PRIMER', 'WP_SANDING', 'WP_TOP_1K', 'WP_TOP_2K', 'WP_CLEAR', 'PC_APPLICATION', 'PC_CURING', 'PC_DOUBLE', 'UNMASKING', 'QUALITY_CHECK', 'TOUCHUP', 'PACKAGING');

-- CreateEnum
CREATE TYPE "MachineType" AS ENUM ('BLAST_CABIN', 'CHEM_BATH', 'PAINT_CABIN', 'POWDER_CABIN', 'CURING_OVEN', 'DRYING_OVEN');

-- CreateEnum
CREATE TYPE "SkillCode" AS ENUM ('PREP', 'BLASTER', 'PAINTER', 'POWDER_COATER', 'QC', 'TEAM_LEAD_SKILL');

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('BASIC', 'EXPERIENCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "Material" AS ENUM ('STEEL_S235', 'STEEL_HIGH_C', 'STAINLESS', 'ALUMINIUM', 'GALVANIZED', 'CAST_IRON', 'OTHER');

-- CreateEnum
CREATE TYPE "Complexity" AS ENUM ('SIMPLE', 'NORMAL', 'COMPLEX', 'VERY_COMPLEX');

-- CreateEnum
CREATE TYPE "ColorSystem" AS ENUM ('RAL', 'NCS', 'PANTONE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "GlossLevel" AS ENUM ('MATT', 'SEMI_GLOSS', 'GLOSSY', 'HIGH_GLOSS');

-- CreateEnum
CREATE TYPE "ConflictType" AS ENUM ('RESOURCE_DOUBLE_BOOK', 'DEADLINE_MISS', 'SKILL_MISSING', 'MACHINE_OVERSIZE', 'DEPENDENCY_VIOLATED', 'CAPACITY_EXCEEDED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ParamCategory" AS ENUM ('PROCESS_TIME', 'CURING', 'DRYING', 'MATERIAL', 'COMPLEXITY', 'PRICING_RATE', 'PRICING_SURCHARGE', 'SCHEDULER', 'TAX', 'WORKING_HOURS', 'OTHER');

-- CreateEnum
CREATE TYPE "ParamValueType" AS ENUM ('NUMBER', 'INTEGER', 'DURATION_MIN', 'TEMPERATURE_C', 'PERCENTAGE', 'CURRENCY_CHF', 'DECIMAL', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "ProcessStepEventType" AS ENUM ('START', 'PAUSE', 'RESUME', 'END');

-- CreateEnum
CREATE TYPE "BillingTimeSource" AS ENUM ('ACTUAL', 'ESTIMATED', 'MANUAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'STATUS_CHANGE';
ALTER TYPE "AuditAction" ADD VALUE 'PARAMETER_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'INVOICE_PAID';
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'ORDER_CANCELLED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'SUPERADMIN';
ALTER TYPE "UserRole" ADD VALUE 'PLANNER';
ALTER TYPE "UserRole" ADD VALUE 'CUSTOMER_PORTAL';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "invoiceCreditorName" TEXT,
ADD COLUMN     "invoiceDefaultVatRate" DECIMAL(4,2) NOT NULL DEFAULT 8.1,
ADD COLUMN     "invoicePaymentTerms" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "qrIban" TEXT,
ADD COLUMN     "vatNumber" TEXT;

-- AlterTable
ALTER TABLE "ScheduleEntry" ADD COLUMN     "source" "ScheduleEntrySource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "hourlyRate" DECIMAL(8,2);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "permission" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerNumber" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL,
    "companyName" TEXT,
    "vatNumber" TEXT,
    "language" "Locale" NOT NULL DEFAULT 'DE',
    "paymentTerms" INTEGER NOT NULL DEFAULT 30,
    "defaultDiscount" DECIMAL(5,2),
    "creditLimit" DECIMAL(12,2),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "bexioContactId" TEXT,
    "abacusCustomerId" TEXT,
    "portalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "portalSlug" TEXT,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "AddressType" NOT NULL,
    "street" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "canton" TEXT,
    "country" TEXT NOT NULL DEFAULT 'CH',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "salutation" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "position" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "hasPortalAccess" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workAreaId" TEXT,
    "name" TEXT NOT NULL,
    "type" "MachineType" NOT NULL,
    "maxLengthMm" INTEGER,
    "maxWidthMm" INTEGER,
    "maxHeightMm" INTEGER,
    "maxWeightKg" INTEGER,
    "chargeCapacityM2" DECIMAL(8,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "workingHours" JSONB NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineMaintenance" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "MachineMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSkill" (
    "userId" TEXT NOT NULL,
    "skillCode" "SkillCode" NOT NULL,
    "level" "SkillLevel" NOT NULL,
    "certifiedUntil" TIMESTAMP(3),

    CONSTRAINT "UserSkill_pkey" PRIMARY KEY ("userId","skillCode")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "promisedAt" TIMESTAMP(3) NOT NULL,
    "internalDeadline" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "contactPersonId" TEXT,
    "shippingAddressId" TEXT,
    "billingAddressId" TEXT,
    "notes" TEXT,
    "customerNotes" TEXT,
    "trackingId" TEXT NOT NULL,
    "qrCodePdfPath" TEXT,
    "totalNetCHF" DECIMAL(12,2),
    "bexioOrderId" TEXT,
    "abacusOrderId" TEXT,
    "parameterSnapshot" JSONB,
    "customerInitiated" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "surfaceM2" DECIMAL(10,3) NOT NULL,
    "weightKg" DECIMAL(10,2),
    "thicknessMm" DECIMAL(6,2),
    "material" "Material" NOT NULL,
    "complexity" "Complexity" NOT NULL DEFAULT 'NORMAL',
    "colorCode" TEXT,
    "colorSystem" "ColorSystem",
    "glossLevel" "GlossLevel",
    "unitPriceCHF" DECIMAL(10,2),
    "notes" TEXT,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessStep" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "processCode" "ProcessCode" NOT NULL,
    "machineTypeRequired" "MachineType",
    "skillRequired" "SkillCode" NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "actualMinutes" INTEGER,
    "billedMinutes" INTEGER,
    "billingTimeSource" "BillingTimeSource" NOT NULL DEFAULT 'ACTUAL',
    "waitMinutesAfter" INTEGER NOT NULL DEFAULT 0,
    "status" "StepStatus" NOT NULL DEFAULT 'PENDING',
    "predecessorId" TEXT,
    "notes" TEXT,

    CONSTRAINT "ProcessStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessStepTimeEvent" (
    "id" TEXT NOT NULL,
    "processStepId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "eventType" "ProcessStepEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "ProcessStepTimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderScheduleEntry" (
    "id" TEXT NOT NULL,
    "processStepId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "assignedUserId" TEXT,
    "machineId" TEXT,
    "plannedStart" TIMESTAMP(3) NOT NULL,
    "plannedEnd" TIMESTAMP(3) NOT NULL,
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "isAutoPlanned" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OrderScheduleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleConflict" (
    "id" TEXT NOT NULL,
    "scheduleEntryId" TEXT NOT NULL,
    "type" "ConflictType" NOT NULL,
    "severity" "Severity" NOT NULL,
    "message" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduleConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAttachment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visibleToCustomer" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrderAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "validUntil" TIMESTAMP(3) NOT NULL,
    "totalNetCHF" DECIMAL(12,2) NOT NULL,
    "vatRate" DECIMAL(4,2) NOT NULL,
    "pdfPath" TEXT,
    "bexioQuoteId" TEXT,
    "convertedToOrderId" TEXT,
    "parameterSnapshot" JSONB,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "surfaceM2" DECIMAL(10,3),
    "weightKg" DECIMAL(10,2),
    "thicknessMm" DECIMAL(6,2),
    "material" "Material",
    "complexity" "Complexity",
    "colorCode" TEXT,
    "colorSystem" "ColorSystem",
    "glossLevel" "GlossLevel",
    "unitPriceCHF" DECIMAL(10,2) NOT NULL,
    "totalPriceCHF" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "templateId" TEXT,
    "estimatedMinutes" INTEGER,

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteProcessStep" (
    "id" TEXT NOT NULL,
    "quoteItemId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "processCode" "ProcessCode" NOT NULL,
    "machineTypeRequired" "MachineType",
    "skillRequired" "SkillCode" NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "waitMinutesAfter" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "QuoteProcessStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessTemplateStep" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "processCode" "ProcessCode" NOT NULL,
    "machineTypeRequired" "MachineType",
    "skillRequired" "SkillCode" NOT NULL,
    "defaultWaitMinutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "ProcessTemplateStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "orderId" TEXT,
    "customerId" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paidAmountCHF" DECIMAL(12,2),
    "reminderLevel" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMP(3),
    "totalNetCHF" DECIMAL(12,2) NOT NULL,
    "vatRate" DECIMAL(4,2) NOT NULL,
    "vatCHF" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalGrossCHF" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "billingAddressSnapshot" JSONB,
    "pdfPath" TEXT,
    "bexioInvoiceId" TEXT,
    "abacusInvoiceId" TEXT,
    "qrBillReference" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'Stk',
    "unitPriceCHF" DECIMAL(10,2) NOT NULL,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "totalCHF" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemParameter" (
    "key" TEXT NOT NULL,
    "category" "ParamCategory" NOT NULL,
    "subCategory" TEXT,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "valueType" "ParamValueType" NOT NULL,
    "currentValue" TEXT NOT NULL,
    "defaultValue" TEXT NOT NULL,
    "unit" TEXT,
    "minValue" DECIMAL(12,4),
    "maxValue" DECIMAL(12,4),
    "step" DECIMAL(12,4),
    "affectsFormula" TEXT,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemParameter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ParameterChangeLog" (
    "id" TEXT NOT NULL,
    "parameterKey" TEXT NOT NULL,
    "oldValue" TEXT NOT NULL,
    "newValue" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParameterChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RolePermission_companyId_idx" ON "RolePermission"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_companyId_role_permission_key" ON "RolePermission"("companyId", "role", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_customerNumber_key" ON "Customer"("customerNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_bexioContactId_key" ON "Customer"("bexioContactId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_abacusCustomerId_key" ON "Customer"("abacusCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_portalSlug_key" ON "Customer"("portalSlug");

-- CreateIndex
CREATE INDEX "Customer_companyId_customerNumber_idx" ON "Customer"("companyId", "customerNumber");

-- CreateIndex
CREATE INDEX "Customer_companyName_idx" ON "Customer"("companyName");

-- CreateIndex
CREATE INDEX "Customer_deletedAt_idx" ON "Customer"("deletedAt");

-- CreateIndex
CREATE INDEX "Address_customerId_idx" ON "Address"("customerId");

-- CreateIndex
CREATE INDEX "Contact_customerId_idx" ON "Contact"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_name_key" ON "Machine"("name");

-- CreateIndex
CREATE INDEX "Machine_companyId_type_idx" ON "Machine"("companyId", "type");

-- CreateIndex
CREATE INDEX "Machine_workAreaId_idx" ON "Machine"("workAreaId");

-- CreateIndex
CREATE INDEX "MachineMaintenance_machineId_startsAt_idx" ON "MachineMaintenance"("machineId", "startsAt");

-- CreateIndex
CREATE INDEX "UserSkill_skillCode_idx" ON "UserSkill"("skillCode");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_trackingId_key" ON "Order"("trackingId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_bexioOrderId_key" ON "Order"("bexioOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_abacusOrderId_key" ON "Order"("abacusOrderId");

-- CreateIndex
CREATE INDEX "Order_companyId_status_promisedAt_idx" ON "Order"("companyId", "status", "promisedAt");

-- CreateIndex
CREATE INDEX "Order_customerId_status_idx" ON "Order"("customerId", "status");

-- CreateIndex
CREATE INDEX "Order_trackingId_idx" ON "Order"("trackingId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessStep_predecessorId_key" ON "ProcessStep"("predecessorId");

-- CreateIndex
CREATE INDEX "ProcessStep_status_idx" ON "ProcessStep"("status");

-- CreateIndex
CREATE INDEX "ProcessStep_orderItemId_sequence_idx" ON "ProcessStep"("orderItemId", "sequence");

-- CreateIndex
CREATE INDEX "ProcessStepTimeEvent_processStepId_occurredAt_idx" ON "ProcessStepTimeEvent"("processStepId", "occurredAt");

-- CreateIndex
CREATE INDEX "ProcessStepTimeEvent_employeeId_occurredAt_idx" ON "ProcessStepTimeEvent"("employeeId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderScheduleEntry_processStepId_key" ON "OrderScheduleEntry"("processStepId");

-- CreateIndex
CREATE INDEX "OrderScheduleEntry_plannedStart_plannedEnd_idx" ON "OrderScheduleEntry"("plannedStart", "plannedEnd");

-- CreateIndex
CREATE INDEX "OrderScheduleEntry_assignedUserId_plannedStart_idx" ON "OrderScheduleEntry"("assignedUserId", "plannedStart");

-- CreateIndex
CREATE INDEX "OrderScheduleEntry_machineId_plannedStart_idx" ON "OrderScheduleEntry"("machineId", "plannedStart");

-- CreateIndex
CREATE INDEX "ScheduleConflict_severity_resolvedAt_idx" ON "ScheduleConflict"("severity", "resolvedAt");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_changedAt_idx" ON "OrderStatusHistory"("orderId", "changedAt");

-- CreateIndex
CREATE INDEX "OrderAttachment_orderId_idx" ON "OrderAttachment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_quoteNumber_key" ON "Quote"("quoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_bexioQuoteId_key" ON "Quote"("bexioQuoteId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_convertedToOrderId_key" ON "Quote"("convertedToOrderId");

-- CreateIndex
CREATE INDEX "Quote_companyId_status_idx" ON "Quote"("companyId", "status");

-- CreateIndex
CREATE INDEX "Quote_customerId_idx" ON "Quote"("customerId");

-- CreateIndex
CREATE INDEX "QuoteProcessStep_quoteItemId_sequence_idx" ON "QuoteProcessStep"("quoteItemId", "sequence");

-- CreateIndex
CREATE INDEX "ProcessTemplate_companyId_sortOrder_idx" ON "ProcessTemplate"("companyId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessTemplate_companyId_key_key" ON "ProcessTemplate"("companyId", "key");

-- CreateIndex
CREATE INDEX "ProcessTemplateStep_templateId_sequence_idx" ON "ProcessTemplateStep"("templateId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_bexioInvoiceId_key" ON "Invoice"("bexioInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_abacusInvoiceId_key" ON "Invoice"("abacusInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_qrBillReference_key" ON "Invoice"("qrBillReference");

-- CreateIndex
CREATE INDEX "Invoice_companyId_status_idx" ON "Invoice"("companyId", "status");

-- CreateIndex
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");

-- CreateIndex
CREATE INDEX "Invoice_orderId_idx" ON "Invoice"("orderId");

-- CreateIndex
CREATE INDEX "Invoice_dueAt_status_idx" ON "Invoice"("dueAt", "status");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_position_idx" ON "InvoiceItem"("invoiceId", "position");

-- CreateIndex
CREATE INDEX "SystemParameter_category_idx" ON "SystemParameter"("category");

-- CreateIndex
CREATE INDEX "SystemParameter_subCategory_idx" ON "SystemParameter"("subCategory");

-- CreateIndex
CREATE INDEX "ParameterChangeLog_parameterKey_effectiveAt_idx" ON "ParameterChangeLog"("parameterKey", "effectiveAt");

-- CreateIndex
CREATE INDEX "ScheduleEntry_scheduleMonthId_source_idx" ON "ScheduleEntry"("scheduleMonthId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "User_customerId_key" ON "User"("customerId");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_workAreaId_fkey" FOREIGN KEY ("workAreaId") REFERENCES "WorkArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineMaintenance" ADD CONSTRAINT "MachineMaintenance_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSkill" ADD CONSTRAINT "UserSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_contactPersonId_fkey" FOREIGN KEY ("contactPersonId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shippingAddressId_fkey" FOREIGN KEY ("shippingAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_billingAddressId_fkey" FOREIGN KEY ("billingAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStep" ADD CONSTRAINT "ProcessStep_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStep" ADD CONSTRAINT "ProcessStep_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "ProcessStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStepTimeEvent" ADD CONSTRAINT "ProcessStepTimeEvent_processStepId_fkey" FOREIGN KEY ("processStepId") REFERENCES "ProcessStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStepTimeEvent" ADD CONSTRAINT "ProcessStepTimeEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderScheduleEntry" ADD CONSTRAINT "OrderScheduleEntry_processStepId_fkey" FOREIGN KEY ("processStepId") REFERENCES "ProcessStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderScheduleEntry" ADD CONSTRAINT "OrderScheduleEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderScheduleEntry" ADD CONSTRAINT "OrderScheduleEntry_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderScheduleEntry" ADD CONSTRAINT "OrderScheduleEntry_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleConflict" ADD CONSTRAINT "ScheduleConflict_scheduleEntryId_fkey" FOREIGN KEY ("scheduleEntryId") REFERENCES "OrderScheduleEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAttachment" ADD CONSTRAINT "OrderAttachment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteProcessStep" ADD CONSTRAINT "QuoteProcessStep_quoteItemId_fkey" FOREIGN KEY ("quoteItemId") REFERENCES "QuoteItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessTemplate" ADD CONSTRAINT "ProcessTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessTemplateStep" ADD CONSTRAINT "ProcessTemplateStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProcessTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemParameter" ADD CONSTRAINT "SystemParameter_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParameterChangeLog" ADD CONSTRAINT "ParameterChangeLog_parameterKey_fkey" FOREIGN KEY ("parameterKey") REFERENCES "SystemParameter"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParameterChangeLog" ADD CONSTRAINT "ParameterChangeLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

