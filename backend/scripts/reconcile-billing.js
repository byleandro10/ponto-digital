const { loadEnv } = require('../src/config/env');
const billingService = require('../src/services/billingService');

loadEnv();

async function main() {
  await billingService.reconcileAllSubscriptions();
  console.log('[billing] reconciliacao concluida com sucesso.');
}

main().catch((error) => {
  console.error('[billing] falha na reconciliacao:', error);
  process.exit(1);
});
