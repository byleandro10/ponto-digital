const prisma = require('../config/database');

const REQUIRED_SCHEMA = {
  Company: [
    'id',
    'name',
    'cnpj',
    'plan',
    'subscriptionStatus',
    'billingStatus',
    'trialEndsAt',
    'currentPeriodEnd',
    'cancelAtPeriodEnd',
    'stripeCustomerId',
    'stripeSubscriptionId',
    'stripePriceId',
    'lastInvoiceId',
    'createdAt',
    'updatedAt',
  ],
  User: [
    'id',
    'name',
    'email',
    'password',
    'role',
    'companyId',
    'createdAt',
    'updatedAt',
  ],
  Employee: [
    'id',
    'name',
    'cpf',
    'email',
    'password',
    'companyId',
    'active',
    'createdAt',
    'updatedAt',
  ],
  Subscription: [
    'id',
    'companyId',
    'plan',
    'status',
    'billingStatus',
    'trialStart',
    'trialEndsAt',
    'currentPeriodStart',
    'currentPeriodEnd',
    'cancelAtPeriodEnd',
    'stripeCustomerId',
    'stripeSubscriptionId',
    'stripePriceId',
    'stripePaymentMethodId',
    'stripeCheckoutSessionId',
    'lastInvoiceId',
    'cancelledAt',
    'createdAt',
    'updatedAt',
  ],
  Payment: [
    'id',
    'subscriptionId',
    'companyId',
    'stripePaymentIntentId',
    'stripeInvoiceId',
    'stripePaymentMethodId',
    'amount',
    'status',
    'paidAt',
    'failureReason',
    'createdAt',
  ],
  WebhookEvent: [
    'id',
    'provider',
    'eventId',
    'eventType',
    'status',
    'requestId',
    'processedAt',
    'errorMessage',
    'createdAt',
    'updatedAt',
  ],
  UsageLog: [
    'id',
    'companyId',
    'date',
    'activeEmployees',
    'totalPunches',
    'adminLogins',
    'employeeLogins',
    'createdAt',
  ],
  NotificationSetting: [
    'id',
    'companyId',
    'clockInReminder',
    'clockOutReminder',
    'missingPunchAlert',
    'weeklyReport',
    'punchConfirmation',
    'clockInReminderTime',
    'clockOutReminderTime',
  ],
};

function buildColumnsByTable(rows) {
  const columnsByTable = new Map();

  for (const row of rows) {
    const tableName = row.tableName || row.TABLE_NAME;
    const columnName = row.columnName || row.COLUMN_NAME;

    if (!tableName || !columnName) {
      continue;
    }

    if (!columnsByTable.has(tableName)) {
      columnsByTable.set(tableName, new Set());
    }

    columnsByTable.get(tableName).add(columnName);
  }

  return columnsByTable;
}

async function getSchemaDiagnostics(prismaClient = prisma) {
  const [databaseRow] = await prismaClient.$queryRawUnsafe('SELECT DATABASE() AS databaseName');
  const databaseName = databaseRow?.databaseName;

  if (!databaseName) {
    return {
      ok: false,
      databaseName: null,
      missingTables: Object.keys(REQUIRED_SCHEMA),
      missingColumns: [],
      checkedAt: new Date().toISOString(),
    };
  }

  const rows = await prismaClient.$queryRawUnsafe(
    `
      SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
      FROM information_schema.columns
      WHERE table_schema = ?
    `,
    databaseName
  );

  const columnsByTable = buildColumnsByTable(rows);
  const missingTables = [];
  const missingColumns = [];

  for (const [tableName, expectedColumns] of Object.entries(REQUIRED_SCHEMA)) {
    const existingColumns = columnsByTable.get(tableName);

    if (!existingColumns) {
      missingTables.push(tableName);
      continue;
    }

    for (const columnName of expectedColumns) {
      if (!existingColumns.has(columnName)) {
        missingColumns.push({ table: tableName, column: columnName });
      }
    }
  }

  return {
    ok: missingTables.length === 0 && missingColumns.length === 0,
    databaseName,
    missingTables,
    missingColumns,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = {
  REQUIRED_SCHEMA,
  getSchemaDiagnostics,
};
