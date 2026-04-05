jest.mock('child_process', () => ({
  spawnSync: jest.fn(),
}));

const { spawnSync } = require('child_process');
const {
  buildDbPushArgs,
  formatPrismaOutput,
  shouldRetryWithAcceptDataLoss,
  runPrismaDbPush,
} = require('../src/services/prismaSchemaSyncService');

describe('prismaSchemaSyncService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('buildDbPushArgs adds accept-data-loss only when requested', () => {
    expect(buildDbPushArgs()).toEqual([
      'prisma',
      'db',
      'push',
      '--skip-generate',
      '--schema=backend/prisma/schema.prisma',
    ]);

    expect(buildDbPushArgs({ acceptDataLoss: true })).toEqual([
      'prisma',
      'db',
      'push',
      '--skip-generate',
      '--schema=backend/prisma/schema.prisma',
      '--accept-data-loss',
    ]);
  });

  test('shouldRetryWithAcceptDataLoss detects Prisma data loss warnings from stderr', () => {
    expect(shouldRetryWithAcceptDataLoss({
      stderr: '⚠️ There might be data loss when applying the changes. Use the --accept-data-loss flag to ignore this warning.',
    })).toBe(true);
  });

  test('runPrismaDbPush throws a structured error when Prisma fails', () => {
    spawnSync.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'prisma failed',
      signal: null,
      error: null,
    });

    expect(() => runPrismaDbPush()).toThrow(/Prisma db push falhou/);
  });

  test('formatPrismaOutput combines stdout and stderr for diagnostics', () => {
    const output = formatPrismaOutput({
      stdout: 'stdout text',
      stderr: 'stderr text',
      error: { message: 'spawn error' },
    });

    expect(output).toContain('stdout text');
    expect(output).toContain('stderr text');
    expect(output).toContain('spawn error');
  });
});
