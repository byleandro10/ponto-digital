const {
  clearDuplicateValues,
  prepareBillingUniqueColumns,
} = require('../src/services/dbPrepareService');

describe('dbPrepareService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('clearDuplicateValues keeps the newest row and nulls the remaining duplicates', async () => {
    const connection = {
      query: jest.fn()
        .mockResolvedValueOnce([[
          { value: 'cus_duplicate', total: 2 },
        ]]),
      execute: jest.fn()
        .mockResolvedValueOnce([[
          { id: 'company-2' },
          { id: 'company-1' },
        ]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };

    const clearedRows = await clearDuplicateValues(
      connection,
      'Company',
      'stripeCustomerId',
      new Set(['id', 'updatedAt', 'createdAt', 'stripeCustomerId'])
    );

    expect(clearedRows).toBe(1);
    expect(connection.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE `Company`'),
      ['cus_duplicate', 'company-1']
    );
  });

  test('prepareBillingUniqueColumns skips missing tables or columns and aggregates touched targets', async () => {
    const connection = {
      execute: jest.fn((sql, params) => {
        const [, tableName] = params;

        if (tableName === 'Company') {
          return Promise.resolve([[
            { columnName: 'id' },
            { columnName: 'updatedAt' },
            { columnName: 'createdAt' },
            { columnName: 'stripeCustomerId' },
          ]]);
        }

        return Promise.resolve([[]]);
      }),
      query: jest.fn((sql) => {
        if (sql.includes('UPDATE `Company`')) {
          return Promise.resolve([{ affectedRows: 0 }]);
        }

        if (sql.includes('FROM `Company`')) {
          return Promise.resolve([[]]);
        }

        return Promise.resolve([{ affectedRows: 0 }]);
      }),
    };

    const results = await prepareBillingUniqueColumns(connection, 'ponto_digital');

    const companyStripeCustomer = results.find((result) => (
      result.tableName === 'Company' && result.columnName === 'stripeCustomerId'
    ));
    const webhookEvent = results.find((result) => (
      result.tableName === 'WebhookEvent' && result.columnName === 'eventId'
    ));

    expect(companyStripeCustomer.skipped).toBe(false);
    expect(webhookEvent.skipped).toBe(true);
  });
});
