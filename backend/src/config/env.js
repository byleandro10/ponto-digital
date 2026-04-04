const path = require('path');
const dotenv = require('dotenv');

let loaded = false;

function loadEnv() {
  if (loaded) {
    return;
  }

  // Em producao, depender apenas das variaveis de ambiente do provedor.
  if (process.env.NODE_ENV === 'production') {
    loaded = true;
    return;
  }

  // Em desenvolvimento local, fazer fallback para arquivos .env sem sobrescrever o ambiente.
  dotenv.config();
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: false });
  dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env'), override: false });

  loaded = true;
}

module.exports = { loadEnv };
