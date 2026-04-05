ALTER TABLE `Company`
  ADD COLUMN `billingStatus` VARCHAR(191) NOT NULL DEFAULT 'INCOMPLETE',
  ADD COLUMN `currentPeriodEnd` DATETIME(3) NULL,
  ADD COLUMN `cancelAtPeriodEnd` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `stripeCustomerId` VARCHAR(191) NULL,
  ADD COLUMN `stripeSubscriptionId` VARCHAR(191) NULL,
  ADD COLUMN `stripePriceId` VARCHAR(191) NULL,
  ADD COLUMN `lastInvoiceId` VARCHAR(191) NULL;

UPDATE `Company`
SET `subscriptionStatus` = CASE
  WHEN `subscriptionStatus` = 'TRIAL' THEN 'TRIALING'
  WHEN `subscriptionStatus` = 'CANCELLED' THEN 'CANCELED'
  WHEN `subscriptionStatus` = 'EXPIRED' THEN 'INCOMPLETE_EXPIRED'
  WHEN `subscriptionStatus` = 'PAUSED' THEN 'PAST_DUE'
  ELSE `subscriptionStatus`
END;

UPDATE `Company`
SET `billingStatus` = CASE
  WHEN `subscriptionStatus` = 'ACTIVE' THEN 'PAID'
  WHEN `subscriptionStatus` = 'TRIALING' THEN 'TRIALING'
  WHEN `subscriptionStatus` = 'PAST_DUE' THEN 'PAST_DUE'
  WHEN `subscriptionStatus` = 'UNPAID' THEN 'UNPAID'
  WHEN `subscriptionStatus` IN ('CANCELED', 'INCOMPLETE_EXPIRED') THEN 'CANCELED'
  ELSE 'INCOMPLETE'
END;

ALTER TABLE `Company`
  MODIFY `subscriptionStatus` VARCHAR(191) NOT NULL DEFAULT 'INCOMPLETE';

CREATE UNIQUE INDEX `Company_stripeCustomerId_key` ON `Company`(`stripeCustomerId`);
CREATE UNIQUE INDEX `Company_stripeSubscriptionId_key` ON `Company`(`stripeSubscriptionId`);

ALTER TABLE `Subscription`
  ADD COLUMN `billingStatus` VARCHAR(191) NOT NULL DEFAULT 'INCOMPLETE',
  ADD COLUMN `cancelAtPeriodEnd` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `stripeCheckoutSessionId` VARCHAR(191) NULL,
  ADD COLUMN `lastInvoiceId` VARCHAR(191) NULL;

UPDATE `Subscription`
SET `status` = CASE
  WHEN `status` = 'TRIAL' THEN 'TRIALING'
  WHEN `status` = 'CANCELLED' THEN 'CANCELED'
  WHEN `status` = 'EXPIRED' THEN 'INCOMPLETE_EXPIRED'
  WHEN `status` = 'PAUSED' THEN 'PAST_DUE'
  ELSE `status`
END;

UPDATE `Subscription`
SET `billingStatus` = CASE
  WHEN `status` = 'ACTIVE' THEN 'PAID'
  WHEN `status` = 'TRIALING' THEN 'TRIALING'
  WHEN `status` = 'PAST_DUE' THEN 'PAST_DUE'
  WHEN `status` = 'UNPAID' THEN 'UNPAID'
  WHEN `status` IN ('CANCELED', 'INCOMPLETE_EXPIRED') THEN 'CANCELED'
  ELSE 'INCOMPLETE'
END;

UPDATE `Subscription`
SET `lastInvoiceId` = `stripeLatestInvoiceId`
WHERE `lastInvoiceId` IS NULL
  AND `stripeLatestInvoiceId` IS NOT NULL;

ALTER TABLE `Subscription`
  MODIFY `status` VARCHAR(191) NOT NULL DEFAULT 'INCOMPLETE';

DROP INDEX `Subscription_mpPreapprovalId_idx` ON `Subscription`;

ALTER TABLE `Subscription`
  DROP COLUMN `gracePeriodEnd`,
  DROP COLUMN `stripeLatestInvoiceId`,
  DROP COLUMN `stripeSetupIntentId`,
  DROP COLUMN `mpPreapprovalId`,
  DROP COLUMN `mpCustomerId`;

CREATE INDEX `Subscription_stripeCheckoutSessionId_idx` ON `Subscription`(`stripeCheckoutSessionId`);

UPDATE `Payment`
SET `stripeInvoiceId` = `mpPaymentId`
WHERE `stripeInvoiceId` IS NULL
  AND `mpPaymentId` IS NOT NULL;

CREATE UNIQUE INDEX `Payment_stripeInvoiceId_key` ON `Payment`(`stripeInvoiceId`);

DROP INDEX `Payment_mpPaymentId_idx` ON `Payment`;

ALTER TABLE `Payment`
  DROP COLUMN `mpPaymentId`;

UPDATE `Company` c
INNER JOIN (
  SELECT
    s.`companyId`,
    s.`plan`,
    s.`status`,
    s.`billingStatus`,
    s.`trialEndsAt`,
    s.`currentPeriodEnd`,
    s.`cancelAtPeriodEnd`,
    s.`stripeCustomerId`,
    s.`stripeSubscriptionId`,
    s.`stripePriceId`,
    s.`lastInvoiceId`
  FROM `Subscription` s
  INNER JOIN (
    SELECT `companyId`, MAX(`createdAt`) AS `maxCreatedAt`
    FROM `Subscription`
    GROUP BY `companyId`
  ) latest
    ON latest.`companyId` = s.`companyId`
   AND latest.`maxCreatedAt` = s.`createdAt`
) latest_subscription
  ON latest_subscription.`companyId` = c.`id`
SET
  c.`plan` = LOWER(latest_subscription.`plan`),
  c.`subscriptionStatus` = latest_subscription.`status`,
  c.`billingStatus` = latest_subscription.`billingStatus`,
  c.`trialEndsAt` = latest_subscription.`trialEndsAt`,
  c.`currentPeriodEnd` = latest_subscription.`currentPeriodEnd`,
  c.`cancelAtPeriodEnd` = latest_subscription.`cancelAtPeriodEnd`,
  c.`stripeCustomerId` = latest_subscription.`stripeCustomerId`,
  c.`stripeSubscriptionId` = latest_subscription.`stripeSubscriptionId`,
  c.`stripePriceId` = latest_subscription.`stripePriceId`,
  c.`lastInvoiceId` = latest_subscription.`lastInvoiceId`;
