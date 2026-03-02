-- AlterTable
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "workScheduleType" TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "geofenceExempt" BOOLEAN NOT NULL DEFAULT false;
