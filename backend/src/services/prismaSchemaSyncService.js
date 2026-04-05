const { spawnSync } = require('child_process');

const DATA_LOSS_PATTERN = /accept-data-loss|there might be data loss|use the --accept-data-loss flag/i;

function getNpxCommand() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function buildDbPushArgs({ acceptDataLoss = false } = {}) {
  const args = [
    'prisma',
    'db',
    'push',
    '--skip-generate',
    '--schema=backend/prisma/schema.prisma',
  ];

  if (acceptDataLoss) {
    args.push('--accept-data-loss');
  }

  return args;
}

function formatPrismaOutput(result) {
  return [
    result?.stdout,
    result?.stderr,
    result?.error?.message,
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
}

function shouldRetryWithAcceptDataLoss(result) {
  return DATA_LOSS_PATTERN.test(formatPrismaOutput(result));
}

function runPrismaDbPush({ acceptDataLoss = false } = {}) {
  const command = getNpxCommand();
  const args = buildDbPushArgs({ acceptDataLoss });
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status === 0) {
    return result;
  }

  const error = new Error(
    `Prisma db push falhou com status ${result.status ?? 'desconhecido'}.`
  );

  error.status = result.status;
  error.signal = result.signal;
  error.stdout = result.stdout;
  error.stderr = result.stderr;
  error.command = command;
  error.args = args;
  error.spawnError = result.error || null;

  throw error;
}

module.exports = {
  buildDbPushArgs,
  formatPrismaOutput,
  shouldRetryWithAcceptDataLoss,
  runPrismaDbPush,
};
