import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { FiCreditCard, FiCheck, FiAlertTriangle, FiCalendar, FiDollarSign, FiArrowUp } from 'react-icons/fi';

const PLAN_NAMES = { BASIC: 'Básico', PROFESSIONAL: 'Profissional', ENTERPRISE: 'Empresarial' };
const PLAN_PRICES = { BASIC: 49, PROFESSIONAL: 99, ENTERPRISE: 199 };

export default function Subscription() {
  const [subscription, setSubscription] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/subscriptions/status'),
      api.get('/subscriptions/payments'),
    ])
      .then(([statusRes, paymentsRes]) => {
        setSubscription(statusRes.data.subscription);
        setPayments(paymentsRes.data.payments || []);
      })
      .catch(() => toast.error('Erro ao carregar dados da assinatura.'))
      .finally(() => setLoading(false));
  }, []);

  const handleCancel = async () => {
    if (!window.confirm('Tem certeza que deseja cancelar sua assinatura? Seu acesso continuará até o fim do período atual.')) return;
    setCancelling(true);
    try {
      await api.post('/subscriptions/cancel');
      toast.success('Assinatura cancelada.');
      const res = await api.get('/subscriptions/status');
      setSubscription(res.data.subscription);
    } catch {
      toast.error('Erro ao cancelar.');
    } finally {
      setCancelling(false);
    }
  };

  const statusBadge = (status) => {
    const colors = {
      TRIAL: 'bg-blue-100 text-blue-700',
      ACTIVE: 'bg-green-100 text-green-700',
      PAST_DUE: 'bg-yellow-100 text-yellow-700',
      CANCELLED: 'bg-red-100 text-red-700',
      EXPIRED: 'bg-gray-100 text-gray-700',
    };
    const labels = {
      TRIAL: 'Período de teste',
      ACTIVE: 'Ativa',
      PAST_DUE: 'Pagamento pendente',
      CANCELLED: 'Cancelada',
      EXPIRED: 'Expirada',
    };
    return (
      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
        {labels[status] || status}
      </span>
    );
  };

  const paymentStatusBadge = (status) => {
    const colors = { APPROVED: 'text-green-600', PENDING: 'text-yellow-600', REJECTED: 'text-red-600', REFUNDED: 'text-gray-600' };
    const labels = { APPROVED: 'Aprovado', PENDING: 'Pendente', REJECTED: 'Rejeitado', REFUNDED: 'Reembolsado' };
    return <span className={`text-xs font-semibold ${colors[status] || 'text-gray-500'}`}>{labels[status] || status}</span>;
  };

  if (loading) {
    return (
      <AdminLayout title="Assinatura">
        <div className="flex items-center justify-center p-20">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Assinatura">
      <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
        {/* Plano atual */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <FiCreditCard className="text-blue-600" /> Plano Atual
            </h2>
            {subscription && statusBadge(subscription.status)}
          </div>

          {subscription ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-500">Plano</p>
                <p className="text-xl font-bold text-gray-900">{subscription.planName || PLAN_NAMES[subscription.plan]}</p>
                <p className="text-sm text-gray-500 mt-1">R${PLAN_PRICES[subscription.plan] || 0}/mês</p>
              </div>
              {subscription.status === 'TRIAL' && (
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-sm text-blue-600">Dias restantes do trial</p>
                  <p className="text-3xl font-extrabold text-blue-700">{subscription.trialDaysLeft}</p>
                  <p className="text-xs text-blue-500 mt-1">
                    Expira em {new Date(subscription.trialEndsAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              )}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-500">Membro desde</p>
                <p className="text-lg font-bold text-gray-900">
                  {new Date(subscription.createdAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">Nenhuma assinatura encontrada.</p>
              <a href="/checkout" className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition">
                Escolher um plano
              </a>
            </div>
          )}

          {subscription && ['TRIAL', 'ACTIVE', 'PAST_DUE'].includes(subscription.status) && (
            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="text-sm text-red-500 hover:text-red-700 transition disabled:opacity-50"
              >
                {cancelling ? 'Cancelando...' : 'Cancelar assinatura'}
              </button>
            </div>
          )}
        </div>

        {/* Histórico de Pagamentos */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <FiDollarSign className="text-green-600" /> Histórico de Pagamentos
          </h2>
          {payments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="pb-3 font-medium">Data</th>
                    <th className="pb-3 font-medium">Valor</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-gray-50">
                      <td className="py-3 text-gray-800">
                        {new Date(p.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-3 text-gray-800 font-semibold">
                        R${parseFloat(p.amount).toFixed(2)}
                      </td>
                      <td className="py-3">{paymentStatusBadge(p.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-sm text-center py-6">Nenhum pagamento registrado ainda.</p>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
