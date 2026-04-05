const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { loadEnv } = require('./config/env');

loadEnv();

const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const timeEntryRoutes = require('./routes/timeEntryRoutes');
const reportRoutes = require('./routes/reportRoutes');
const geofenceRoutes = require('./routes/geofenceRoutes');
const adjustmentRoutes = require('./routes/adjustmentRoutes');
const exportRoutes = require('./routes/exportRoutes');
const adjustmentRequestRoutes = require('./routes/adjustmentRequestRoutes');
const employeeSelfServiceRoutes = require('./routes/employeeSelfServiceRoutes');
const billingRoutes = require('./routes/billingRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const { subscriptionGuard } = require('./middlewares/subscriptionGuard');
const { logSecurityEvent } = require('./utils/securityLogger');
const prisma = require('./config/database');
const { getSchemaDiagnostics } = require('./services/schemaHealthService');
const { ipKeyGenerator } = rateLimit;

const app = express();
const frontendDistPath = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
const frontendIndexPath = path.join(frontendDistPath, 'index.html');
const hasFrontendBuild = fs.existsSync(frontendIndexPath);

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET nao configurado ou muito curto (minimo 32 caracteres)');
  process.exit(1);
}

const trustProxySetting = (() => {
  const rawValue = String(process.env.TRUST_PROXY || '').trim();

  if (!rawValue) {
    return process.env.NODE_ENV === 'production' ? 1 : false;
  }

  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;

  const numericValue = Number(rawValue);
  if (!Number.isNaN(numericValue)) {
    return numericValue;
  }

  return rawValue;
})();

app.set('trust proxy', trustProxySetting);

app.use(helmet({
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "script-src": ["'self'", "https://js.stripe.com"],
      "frame-src": ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
      "connect-src": ["'self'", "https://api.stripe.com", "https://r.stripe.com", "https://m.stripe.network"],
      "img-src": ["'self'", "data:", "https://q.stripe.com", "https://*.stripe.com"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "font-src": ["'self'", "data:", "https://js.stripe.com"],
    },
  },
}));

app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] [${req.requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
});

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origem nao permitida pelo CORS'));
  },
  credentials: true,
}));

app.use('/api/webhooks', webhookRoutes);
app.use(express.json({ limit: '2mb' }));

function buildRateLimitKey(req) {
  const ip = typeof req.ip === 'string' && req.ip
    ? req.ip
    : (req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1');

  return ipKeyGenerator(String(ip).replace(/^::ffff:/, ''));
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  passOnStoreError: true,
  keyGenerator: buildRateLimitKey,
  handler: (req, res) => {
    logSecurityEvent(req, 'global_rate_limit_exceeded');
    res.status(429).json({ error: 'Muitas requisicoes. Tente novamente em 15 minutos.' });
  },
});
app.use(limiter);

app.use('/api/auth', authRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/super-admin', superAdminRoutes);

app.use('/api/employees', subscriptionGuard, employeeRoutes);
app.use('/api/time-entries', subscriptionGuard, timeEntryRoutes);
app.use('/api/reports', subscriptionGuard, reportRoutes);
app.use('/api/geofences', subscriptionGuard, geofenceRoutes);
app.use('/api/adjustments', subscriptionGuard, adjustmentRoutes);
app.use('/api/export', subscriptionGuard, exportRoutes);
app.use('/api/adjustment-requests', subscriptionGuard, adjustmentRequestRoutes);
app.use('/api/employee', subscriptionGuard, employeeSelfServiceRoutes);

app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const schema = await getSchemaDiagnostics(prisma);
    const statusCode = schema.ok ? 200 : 503;

    res.status(statusCode).json({
      status: 'OK',
      database: 'OK',
      schema: schema.ok ? 'OK' : 'DRIFT',
      schemaIssues: {
        missingTables: schema.missingTables.length,
        missingColumns: schema.missingColumns.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[health] database check failed:', error);
    res.status(500).json({
      status: 'ERROR',
      database: 'ERROR',
      code: error.code || 'UNKNOWN',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

if (hasFrontendBuild) {
  app.use(express.static(frontendDistPath));

  app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
    res.sendFile(frontendIndexPath);
  });
} else if (process.env.NODE_ENV === 'production') {
  console.warn(`[startup] Frontend build nao encontrado em ${frontendDistPath}. Execute o build do frontend antes de iniciar o servidor.`);
}

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Rota da API nao encontrada.' });
});

app.use((err, req, res, next) => {
  if (err.message === 'Origem nao permitida pelo CORS') {
    logSecurityEvent(req, 'cors_request_blocked', { origin: req.headers.origin || null });
    return res.status(403).json({ error: 'Origem nao permitida pelo CORS.' });
  }

  console.error('[request-error]', {
    requestId: req.requestId || null,
    method: req.method,
    path: req.originalUrl,
    code: err.code || 'UNKNOWN',
    message: err.message,
    stack: err.stack,
  });
  return res.status(500).json({
    error: 'Erro interno do servidor.',
    requestId: req.requestId || null,
  });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT} (0.0.0.0)`);

    prisma.$connect()
      .then(() => {
        console.log('[startup] conexao inicial com banco estabelecida com sucesso.');
        return getSchemaDiagnostics(prisma);
      })
      .then((schema) => {
        if (!schema) {
          return;
        }

        if (schema.ok) {
          console.log('[startup] schema MySQL sincronizado com o projeto.', {
            databaseName: schema.databaseName,
          });
          return;
        }

        console.error('[startup] schema drift detectado no MySQL.', {
          databaseName: schema.databaseName,
          missingTables: schema.missingTables,
          missingColumns: schema.missingColumns,
        });
      })
      .catch((error) => {
        console.error('[startup] falha ao conectar ao banco:', {
          code: error.code || 'UNKNOWN',
          message: error.message,
        });
      });
  });
}

module.exports = app;
