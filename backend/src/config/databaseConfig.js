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
  const socketPath = env.DB_SOCKET_PATH;
  const host = socketPath ? 'localhost' : env.DB_HOST;
  const port = socketPath ? '' : (env.DB_PORT || '3306');
  const user = typeof env.DB_USER === 'string' ? env.DB_USER.trim() : env.DB_USER;
  const password = env.DB_PASSWORD;
  const database = typeof env.DB_NAME === 'string' ? env.DB_NAME.trim() : env.DB_NAME;

  if (!host || !user || password === undefined || !database) {
    return null;
  }

  const authority = port ? `${host}:${port}` : host;
  const databaseUrl = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${authority}/${encodeURIComponent(database)}`;

  return normalizeDatabaseUrl(databaseUrl, env);
}

function getResolvedDatabaseUrl(env = process.env) {
  const databaseUrlFromParts = buildDatabaseUrlFromParts(env);
  const rawDatabaseUrl = databaseUrlFromParts || env.DATABASE_URL;
  const databaseUrl = normalizeDatabaseUrl(rawDatabaseUrl, env);
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

function normalizeDatabaseUrl(databaseUrl, env = process.env) {
  if (!databaseUrl) {
    return null;
  }

  const sanitizedUrl = String(databaseUrl).trim().replace(/^DATABASE_URL=/i, '');
  let parsed;

  try {
    parsed = new URL(sanitizedUrl);
  } catch (error) {
    throw new Error(`DATABASE_URL invalida: ${error.message}`);
  }

  if (!['mysql:', 'mariadb:'].includes(parsed.protocol)) {
    throw new Error(`DATABASE_URL deve usar protocolo mysql:// ou mariadb://. Recebido: ${parsed.protocol}`);
  }

  const socketPath = env.DB_SOCKET_PATH || parsed.searchParams.get('socket');
  if (socketPath) {
    parsed.hostname = 'localhost';
    parsed.port = '';
    parsed.searchParams.set('socket', socketPath);
  }

  // Parametros conservadores para ambiente compartilhado da Hostinger.
  if (!parsed.searchParams.has('connection_limit')) {
    parsed.searchParams.set('connection_limit', env.DB_CONNECTION_LIMIT || '3');
  }
  if (!parsed.searchParams.has('pool_timeout')) {
    parsed.searchParams.set('pool_timeout', env.DB_POOL_TIMEOUT || '30');
  }
  if (!parsed.searchParams.has('connect_timeout')) {
    parsed.searchParams.set('connect_timeout', env.DB_CONNECT_TIMEOUT || '30');
  }

  if (parseBoolean(env.DB_SSL)) {
    parsed.searchParams.set('sslaccept', parseBoolean(env.DB_SSL_REJECT_UNAUTHORIZED) === false ? 'accept_invalid_certs' : 'strict');
  }

  return parsed.toString();
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

function getDatabaseDiagnostics(env = process.env) {
  const databaseUrl = getResolvedDatabaseUrl(env);
  const parsed = parseDatabaseUrl(databaseUrl);
  validateProductionDatabaseHost(parsed, env);
  const source = buildDatabaseUrlFromParts(env) ? 'DB_*' : 'DATABASE_URL';

  return {
    databaseUrl,
    source,
    host: parsed.query.get('socket') ? 'localhost (socket)' : parsed.host,
    port: parsed.query.get('socket') ? 'socket' : parsed.port,
    database: parsed.database,
    connectionLimit: parsed.query.get('connection_limit') || 'default',
    poolTimeout: parsed.query.get('pool_timeout') || 'default',
    connectTimeout: parsed.query.get('connect_timeout') || 'default',
    socket: parsed.query.get('socket') || '',
    sslaccept: parsed.query.get('sslaccept') || '',
  };
}

module.exports = {
  getResolvedDatabaseUrl,
  getDatabaseDiagnostics,
};
