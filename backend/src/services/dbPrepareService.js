const UNIQUE_CLEANUP_TARGETS = [
  { tableName: 'Company', columnName: 'stripeCustomerId' },
  { tableName: 'Company', columnName: 'stripeSubscriptionId' },
  { tableName: 'Subscription', columnName: 'stripeSubscriptionId' },
  { tableName: 'Payment', columnName: 'stripePaymentIntentId' },
  { tableName: 'Payment', columnName: 'stripeInvoiceId' },
  { tableName: 'WebhookEvent', columnName: 'eventId' },
];

function escapeIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

async function getCurrentDatabaseName(connection) {
  const [rows] = await connection.query('SELECT DATABASE() AS databaseName');
  return rows[0]?.databaseName || null;
}

async function getTableColumns(connection, databaseName, tableName) {
  const [rows] = await connection.execute(
    `
      SELECT COLUMN_NAME AS columnName
      FROM information_schema.columns
      WHERE table_schema = ?
        AND table_name = ?
    `,
    [databaseName, tableName]
  );

  return new Set(rows.map((row) => row.columnName));
}

function buildOrderByClause(columns) {
  const parts = [];

  if (columns.has('updatedAt')) {
    parts.push(`${escapeIdentifier('updatedAt')} DESC`);
  }

  if (columns.has('createdAt')) {
    parts.push(`${escapeIdentifier('createdAt')} DESC`);
  }

  parts.push(`${escapeIdentifier('id')} DESC`);

  return parts.join(', ');
}

async function normalizeBlankValues(connection, tableName, columnName) {
  const tableSql = escapeIdentifier(tableName);
  const columnSql = escapeIdentifier(columnName);

  const [result] = await connection.query(
    `
      UPDATE ${tableSql}
      SET ${columnSql} = NULL
      WHERE ${columnSql} IS NOT NULL
        AND TRIM(${columnSql}) = ''
    `
  );

  return result.affectedRows || 0;
}

async function clearDuplicateValues(connection, tableName, columnName, columns) {
  const tableSql = escapeIdentifier(tableName);
  const columnSql = escapeIdentifier(columnName);
  const idSql = escapeIdentifier('id');
  const orderBy = buildOrderByClause(columns);

  const [duplicateRows] = await connection.query(
    `
      SELECT ${columnSql} AS value, COUNT(*) AS total
      FROM ${tableSql}
      WHERE ${columnSql} IS NOT NULL
      GROUP BY ${columnSql}
      HAVING COUNT(*) > 1
    `
  );

  let clearedRows = 0;

  for (const duplicateRow of duplicateRows) {
    const [matchingRows] = await connection.execute(
      `
        SELECT ${idSql} AS id
        FROM ${tableSql}
        WHERE ${columnSql} = ?
        ORDER BY ${orderBy}
      `,
      [duplicateRow.value]
    );

    const keeper = matchingRows.shift();
    const idsToClear = matchingRows.map((row) => row.id).filter(Boolean);

    if (!keeper || idsToClear.length === 0) {
      continue;
    }

    const placeholders = idsToClear.map(() => '?').join(', ');
    const [result] = await connection.execute(
      `
        UPDATE ${tableSql}
        SET ${columnSql} = NULL
        WHERE ${columnSql} = ?
          AND ${idSql} IN (${placeholders})
      `,
      [duplicateRow.value, ...idsToClear]
    );

    clearedRows += result.affectedRows || 0;
  }

  return clearedRows;
}

async function prepareUniqueColumn(connection, databaseName, target) {
  const columns = await getTableColumns(connection, databaseName, target.tableName);

  if (!columns.has('id') || !columns.has(target.columnName)) {
    return {
      ...target,
      skipped: true,
      normalizedBlankRows: 0,
      clearedDuplicateRows: 0,
    };
  }

  const normalizedBlankRows = await normalizeBlankValues(connection, target.tableName, target.columnName);
  const clearedDuplicateRows = await clearDuplicateValues(
    connection,
    target.tableName,
    target.columnName,
    columns
  );

  return {
    ...target,
    skipped: false,
    normalizedBlankRows,
    clearedDuplicateRows,
  };
}

async function prepareBillingUniqueColumns(connection, databaseName) {
  const results = [];

  for (const target of UNIQUE_CLEANUP_TARGETS) {
    results.push(await prepareUniqueColumn(connection, databaseName, target));
  }

  return results;
}

module.exports = {
  UNIQUE_CLEANUP_TARGETS,
  getCurrentDatabaseName,
  getTableColumns,
  normalizeBlankValues,
  clearDuplicateValues,
  prepareBillingUniqueColumns,
};
