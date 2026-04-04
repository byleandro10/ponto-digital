ALTER TABLE `Subscription`
  ADD COLUMN `stripeCustomerId` VARCHAR(191) NULL,
  ADD COLUMN `stripeSubscriptionId` VARCHAR(191) NULL,
  ADD COLUMN `stripePriceId` VARCHAR(191) NULL,
  ADD COLUMN `stripePaymentMethodId` VARCHAR(191) NULL,
  ADD COLUMN `stripeLatestInvoiceId` VARCHAR(191) NULL,
  ADD COLUMN `stripeSetupIntentId` VARCHAR(191) NULL;

ALTER TABLE `Payment`
  ADD COLUMN `stripePaymentIntentId` VARCHAR(191) NULL,
  ADD COLUMN `stripeInvoiceId` VARCHAR(191) NULL,
  ADD COLUMN `stripePaymentMethodId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Subscription_stripeSubscriptionId_key` ON `Subscription`(`stripeSubscriptionId`);
CREATE INDEX `Subscription_stripeCustomerId_idx` ON `Subscription`(`stripeCustomerId`);
CREATE INDEX `Subscription_stripeSubscriptionId_idx` ON `Subscription`(`stripeSubscriptionId`);
CREATE INDEX `Subscription_stripePaymentMethodId_idx` ON `Subscription`(`stripePaymentMethodId`);

CREATE UNIQUE INDEX `Payment_stripePaymentIntentId_key` ON `Payment`(`stripePaymentIntentId`);
CREATE INDEX `Payment_stripePaymentIntentId_idx` ON `Payment`(`stripePaymentIntentId`);
CREATE INDEX `Payment_stripeInvoiceId_idx` ON `Payment`(`stripeInvoiceId`);
CREATE INDEX `Payment_stripePaymentMethodId_idx` ON `Payment`(`stripePaymentMethodId`);

CREATE TABLE `WebhookEvent` (
  `id` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(191) NOT NULL,
  `eventId` VARCHAR(191) NOT NULL,
  `eventType` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PROCESSING',
  `requestId` VARCHAR(191) NULL,
  `processedAt` DATETIME(3) NULL,
  `errorMessage` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `WebhookEvent_eventId_key`(`eventId`),
  INDEX `WebhookEvent_provider_eventType_idx`(`provider`, `eventType`),
  INDEX `WebhookEvent_status_idx`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
