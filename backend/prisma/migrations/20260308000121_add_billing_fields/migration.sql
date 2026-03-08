-- AlterTable: Add billing fields to Subscription
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "trialStart" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "gracePeriodEnd" TIMESTAMP(3);

-- Make mpPreapprovalId unique
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Subscription_mpPreapprovalId_key'
  ) THEN
    ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_mpPreapprovalId_key" UNIQUE ("mpPreapprovalId");
  END IF;
END $$;

-- Add index on mpPreapprovalId
CREATE INDEX IF NOT EXISTS "Subscription_mpPreapprovalId_idx" ON "Subscription"("mpPreapprovalId");

-- AlterTable: Add failureReason to Payment
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;

-- Make mpPaymentId unique
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Payment_mpPaymentId_key'
  ) THEN
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_mpPaymentId_key" UNIQUE ("mpPaymentId");
  END IF;
END $$;

-- Add index on mpPaymentId
CREATE INDEX IF NOT EXISTS "Payment_mpPaymentId_idx" ON "Payment"("mpPaymentId");
