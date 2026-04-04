const path = require('path');
const dotenv = require('dotenv');

let loaded = false;

function loadEnv() {
  if (loaded) {
    return;
  }

  // 1) Respeita variaveis ja injetadas pelo provedor no ambiente.
  dotenv.config();

  // 2) Fallback para desenvolvimento local, sem sobrescrever runtime/producao.
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: false });
  dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), override: false });

  loaded = true;
}

module.exports = { loadEnv };
