const mockPrisma = {
  $queryRawUnsafe: jest.fn(),
};

jest.mock('../src/config/database', () => mockPrisma);

const { getSchemaDiagnostics, REQUIRED_SCHEMA } = require('../src/services/schemaHealthService');

function buildRowsFromSchema(schema) {
  return Object.entries(schema).flatMap(([tableName, columns]) => (
    columns.map((columnName) => ({
      tableName,
      columnName,
    }))
  ));
}

describe('schemaHealthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns ok when the database contains all required tables and columns', async () => {
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ databaseName: 'ponto_digital' }])
      .mockResolvedValueOnce(buildRowsFromSchema(REQUIRED_SCHEMA));

    const diagnostics = await getSchemaDiagnostics(mockPrisma);

    expect(diagnostics.ok).toBe(true);
    expect(diagnostics.databaseName).toBe('ponto_digital');
    expect(diagnostics.missingTables).toEqual([]);
    expect(diagnostics.missingColumns).toEqual([]);
  });

  test('reports missing tables and columns when the schema is out of sync', async () => {
    const partialSchema = {
      ...REQUIRED_SCHEMA,
      Company: REQUIRED_SCHEMA.Company.filter((column) => column !== 'subscriptionStatus'),
    };
    delete partialSchema.WebhookEvent;

    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ databaseName: 'ponto_digital' }])
      .mockResolvedValueOnce(buildRowsFromSchema(partialSchema));

    const diagnostics = await getSchemaDiagnostics(mockPrisma);

    expect(diagnostics.ok).toBe(false);
    expect(diagnostics.missingTables).toContain('WebhookEvent');
    expect(diagnostics.missingColumns).toContainEqual({
      table: 'Company',
      column: 'subscriptionStatus',
    });
  });
});
