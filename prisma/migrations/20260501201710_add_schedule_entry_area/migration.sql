-- AlterTable
ALTER TABLE "ScheduleEntry" ADD COLUMN     "workAreaId" TEXT;

-- CreateIndex
CREATE INDEX "ScheduleEntry_workAreaId_idx" ON "ScheduleEntry"("workAreaId");

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_workAreaId_fkey" FOREIGN KEY ("workAreaId") REFERENCES "WorkArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
