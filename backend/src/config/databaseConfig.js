const { loadEnv } = require('./env');

loadEnv();

function parseBoolean(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function parseInteger(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildDatabaseUrlFromParts(env) {
  const host = env.DB_HOST;
  const port = env.DB_PORT || '3306';
  const user = env.DB_USER;
  const password = env.DB_PASSWORD;
  const database = env.DB_NAME;

  if (!host || !user || password === undefined || !database) {
    return null;
  }

  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

function getResolvedDatabaseUrl(env = process.env) {
  const databaseUrl = env.DATABASE_URL || buildDatabaseUrlFromParts(env);
  if (!databaseUrl) {
    throw new Error(
      'Banco nao configurado. Defina DATABASE_URL ou informe DB_HOST, DB_PORT, DB_USER, DB_PASSWORD e DB_NAME.'
    );
  }

  return databaseUrl;
}

function parseDatabaseUrl(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch (error) {
    throw new Error(`DATABASE_URL invalida: ${error.message}`);
  }

  if (!['mysql:', 'mariadb:'].includes(parsed.protocol)) {
    throw new Error(`DATABASE_URL deve usar protocolo mysql:// ou mariadb://. Recebido: ${parsed.protocol}`);
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!parsed.hostname || !parsed.username || !database) {
    throw new Error('DATABASE_URL incompleta. Confirme host, usuario e nome do banco.');
  }

  return {
    host: parsed.hostname,
    port: parseInteger(parsed.port, 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
    query: parsed.searchParams,
  };
}

function validateProductionDatabaseHost({ host }, env = process.env) {
  if (env.NODE_ENV !== 'production') {
    return;
  }

  const normalizedHost = String(host || '').trim().toLowerCase();
  if (['localhost', '127.0.0.1', '::1'].includes(normalizedHost)) {
    console.warn('[database] usando host local para MySQL em producao. Em ambientes como Hostinger isso pode ser esperado.');
  }
}

function getMariaDbConfig(env = process.env) {
  const databaseUrl = getResolvedDatabaseUrl(env);
  const parsed = parseDatabaseUrl(databaseUrl);
  validateProductionDatabaseHost(parsed, env);

  const config = {
    host: parsed.host,
    port: parsed.port,
    user: parsed.user,
    password: parsed.password,
    database: parsed.database,
    connectTimeout: parseInteger(env.DB_CONNECT_TIMEOUT, parseInteger(parsed.query.get('connect_timeout'), 5000)),
    acquireTimeout: parseInteger(env.DB_ACQUIRE_TIMEOUT, 10000),
    connectionLimit: parseInteger(env.DB_CONNECTION_LIMIT, 10),
    idleTimeout: parseInteger(env.DB_IDLE_TIMEOUT, 300),
  };

  const sslEnabled = parseBoolean(env.DB_SSL) ?? ['require', 'required'].includes((env.DB_SSL_MODE || '').toLowerCase());
  const rejectUnauthorized = parseBoolean(env.DB_SSL_REJECT_UNAUTHORIZED);

  if (sslEnabled) {
    config.ssl = rejectUnauthorized === false ? { rejectUnauthorized: false } : true;
  }

  return { databaseUrl, config };
}

module.exports = {
  getResolvedDatabaseUrl,
  getMariaDbConfig,
};
