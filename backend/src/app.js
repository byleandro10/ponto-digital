const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const timeEntryRoutes = require('./routes/timeEntryRoutes');
const reportRoutes = require('./routes/reportRoutes');
const geofenceRoutes = require('./routes/geofenceRoutes');
const adjustmentRoutes = require('./routes/adjustmentRoutes');
const exportRoutes = require('./routes/exportRoutes');
const adjustmentRequestRoutes = require('./routes/adjustmentRequestRoutes');
const employeeSelfServiceRoutes = require('./routes/employeeSelfServiceRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const billingRoutes = require('./routes/billingRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const { subscriptionGuard } = require('./middlewares/subscriptionGuard');

const app = express();
const frontendDistPath = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
const frontendIndexPath = path.join(frontendDistPath, 'index.html');
const hasFrontendBuild = fs.existsSync(frontendIndexPath);

// Validar JWT_SECRET no startup
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET não configurado ou muito curto (mínimo 32 caracteres)');
  process.exit(1);
}

app.use(helmet());

// Request logging básico para auditoria
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// CORS restrito a origens permitidas
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sem origin (mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Origem não permitida pelo CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));

// Rate limiter global
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' }
});
app.use(limiter);

// Rate limiter estrito para rotas de autenticação (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas de login. Aguarde 1 minuto.' }
});

// Rotas públicas (sem subscription guard)
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/super-admin', superAdminRoutes);

// Rotas protegidas por assinatura
app.use('/api/employees', subscriptionGuard, employeeRoutes);
app.use('/api/time-entries', subscriptionGuard, timeEntryRoutes);
app.use('/api/reports', subscriptionGuard, reportRoutes);
app.use('/api/geofences', subscriptionGuard, geofenceRoutes);
app.use('/api/adjustments', subscriptionGuard, adjustmentRoutes);
app.use('/api/export', subscriptionGuard, exportRoutes);
app.use('/api/adjustment-requests', subscriptionGuard, adjustmentRequestRoutes);
app.use('/api/employee', subscriptionGuard, employeeSelfServiceRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

if (hasFrontendBuild) {
  app.use(express.static(frontendDistPath));

  app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
    res.sendFile(frontendIndexPath);
  });
} else if (process.env.NODE_ENV === 'production') {
  console.warn(`[startup] Frontend build não encontrado em ${frontendDistPath}. Execute o build do frontend antes de iniciar o servidor.`);
}

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Rota da API não encontrada.' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

// Só inicia o servidor se executado diretamente (não importado para testes)
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT} (0.0.0.0)`);
  });
}

module.exports = app;
