const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

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
const webhookRoutes = require('./routes/webhookRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const { subscriptionGuard } = require('./middlewares/subscriptionGuard');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' }
});
app.use(limiter);

// Rotas públicas (sem subscription guard)
app.use('/api/auth', authRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
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
