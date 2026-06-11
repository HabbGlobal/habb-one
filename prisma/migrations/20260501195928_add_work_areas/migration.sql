-- CreateTable
CREATE TABLE "WorkArea" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "colorHex" TEXT NOT NULL DEFAULT '#6366f1',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeWorkArea" (
    "employeeId" TEXT NOT NULL,
    "workAreaId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeWorkArea_pkey" PRIMARY KEY ("employeeId","workAreaId")
);

-- CreateIndex
CREATE INDEX "WorkArea_companyId_idx" ON "WorkArea"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkArea_companyId_name_key" ON "WorkArea"("companyId", "name");

-- CreateIndex
CREATE INDEX "EmployeeWorkArea_workAreaId_idx" ON "EmployeeWorkArea"("workAreaId");

-- AddForeignKey
ALTER TABLE "WorkArea" ADD CONSTRAINT "WorkArea_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkArea" ADD CONSTRAINT "EmployeeWorkArea_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkArea" ADD CONSTRAINT "EmployeeWorkArea_workAreaId_fkey" FOREIGN KEY ("workAreaId") REFERENCES "WorkArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
