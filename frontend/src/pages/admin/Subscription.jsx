import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { FiCreditCard, FiCheck, FiAlertTriangle, FiDollarSign, FiShield, FiExternalLink, FiRefreshCw } from 'react-icons/fi';
import { useAuth } from '../../contexts/AuthContext';

const PLAN_NAMES = { BASIC: 'Basico', PROFESSIONAL: 'Profissional', ENTERPRISE: 'Empresarial' };
const PLAN_PRICES = { BASIC: 49, PROFESSIONAL: 99, ENTERPRISE: 199 };
const PLANS = [
  { key: 'BASIC', name: 'Basico', price: 49, features: ['Ate 15 funcionarios', 'Registro de ponto', 'Relatorios basicos'] },
  { key: 'PROFESSIONAL', name: 'Profissional', price: 99, features: ['Ate 50 funcionarios', 'Cerca virtual', 'Relatorios avancados', 'Banco de horas'] },
  { key: 'ENTERPRISE', name: 'Empresarial', price: 199, features: ['Funcionarios ilimitados', 'Todas as funcionalidades', 'Suporte prioritario'] },
];

export default function Subscription() {
  const { user, updateSubscriptionStatus, persistAuthState } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [subscription, setSubscription] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('BASIC');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, paymentsRes] = await Promise.all([
        api.get('/subscriptions/status'),
        api.get('/subscriptions/payments'),
      ]);
      const sub = statusRes.data.subscription;
      setSubscription(sub);
      setPayments(paymentsRes.data.payments || []);
      setSelectedPlan(sub?.plan || 'BASIC');
    } catch {
      toast.error('Erro ao carregar dados da assinatura.');
    } finally {
      setLoading(false);
    }
  }, []);

  const finalizeHostedCheckout = useCallback(async (sessionId) => {
    setCheckoutLoading(true);
    try {
      const response = await api.post('/subscriptions/checkout-complete', { sessionId });
      const nextSubscription = response.data.subscription;
      setSubscription(nextSubscription);
      updateSubscriptionStatus(nextSubscription.status, nextSubscription.trialEndsAt || null);
      persistAuthState({
        user,
        company: { ...user.company, plan: nextSubscription.plan.toLowerCase() },
        subscriptionStatus: nextSubscription.status,
        trialEndsAt: nextSubscription.trialEndsAt || null,
        type: 'admin',
      });
      toast.success('Assinatura confirmada com sucesso.');
      setSearchParams({});
      await fetchData();
      navigate('/admin/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.error || error.message || 'Nao foi possivel confirmar a assinatura.');
      setSearchParams({});
    } finally {
      setCheckoutLoading(false);
    }
  }, [fetchData, navigate, persistAuthState, searchParams, setSearchParams, updateSubscriptionStatus, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const checkoutState = searchParams.get('checkout');
    const sessionId = searchParams.get('session_id');

    if (checkoutState === 'success' && sessionId) {
      finalizeHostedCheckout(sessionId);
      return;
    }

    if (checkoutState === 'cancelled') {
      toast.error('Checkout cancelado. Quando quiser, inicie novamente.');
      setSearchParams({});
    }
  }, [finalizeHostedCheckout, searchParams, setSearchParams]);

  const needsReactivation = !subscription ||
    ['CANCELLED', 'EXPIRED', 'PAST_DUE'].includes(subscription?.status) ||
    (subscription?.status === 'TRIAL' && subscription?.trialEndsAt && new Date(subscription.trialEndsAt) < new Date());

  const handleOpenCheckout = useCallback(async () => {
    if (!selectedPlan) {
      toast.error('Selecione um plano.');
      return;
    }

    setCheckoutLoading(true);
    try {
      const response = await api.post('/subscriptions/checkout-session', {
        plan: selectedPlan,
      });
      const checkoutUrl = response.data?.url;
      if (!checkoutUrl) {
        throw new Error('A Stripe nao retornou a URL do checkout.');
      }
      window.location.href = checkoutUrl;
    } catch (error) {
      toast.error(error.response?.data?.error || error.message || 'Nao foi possivel abrir o checkout da Stripe.');
      setCheckoutLoading(false);
    }
  }, [selectedPlan]);

  const handleOpenPortal = useCallback(async () => {
    setPortalLoading(true);
    try {
      const response = await api.post('/subscriptions/portal-session');
      const portalUrl = response.data?.url;
      if (!portalUrl) {
        throw new Error('A Stripe nao retornou a URL do portal.');
      }
      window.location.href = portalUrl;
    } catch (error) {
      toast.error(error.response?.data?.error || error.message || 'Nao foi possivel abrir o portal da Stripe.');
      setPortalLoading(false);
    }
  }, []);

  const handleCancel = async () => {
    if (!window.confirm('Tem certeza que deseja cancelar sua assinatura?')) return;
    setCancelling(true);
    try {
      await api.post('/subscriptions/cancel');
      toast.success('Assinatura cancelada.');
      await fetchData();
    } catch {
      toast.error('Erro ao cancelar.');
    } finally {
      setCancelling(false);
    }
  };

  const paymentStatusBadge = (status) => {
    const colors = { APPROVED: 'text-green-600', PENDING: 'text-yellow-600', REJECTED: 'text-red-600', REFUNDED: 'text-gray-600' };
    return <span className={`text-xs font-semibold ${colors[status] || 'text-gray-500'}`}>{status}</span>;
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
        {(needsReactivation || checkoutLoading) && (
          <div className={`${needsReactivation ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'} border rounded-2xl p-6`}>
            <div className="flex items-start gap-3">
              {needsReactivation ? (
                <FiAlertTriangle className="w-6 h-6 text-red-500 mt-0.5 shrink-0" />
              ) : (
                <FiRefreshCw className="w-6 h-6 text-blue-600 mt-0.5 shrink-0" />
              )}
              <div>
                <h3 className={`text-lg font-bold ${needsReactivation ? 'text-red-800' : 'text-blue-800'}`}>
                  {needsReactivation ? 'Assinatura inativa' : 'Confirmando checkout'}
                </h3>
                <p className={`text-sm mt-1 ${needsReactivation ? 'text-red-600' : 'text-blue-700'}`}>
                  {checkoutLoading
                    ? 'A Stripe esta finalizando ou abrindo o checkout seguro para o seu cartao.'
                    : 'Use o checkout hospedado da Stripe para cadastrar ou atualizar o cartao sem depender de campos embutidos no app.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {subscription && !needsReactivation && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <FiCreditCard className="text-blue-600" /> Plano Atual
              </h2>
              <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">{subscription.status}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-500">Plano</p>
                <p className="text-xl font-bold text-gray-900">{PLAN_NAMES[subscription.plan] || subscription.plan}</p>
                <p className="text-sm text-gray-500 mt-1">R${PLAN_PRICES[subscription.plan] || 0}/mes</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-500">Periodo atual</p>
                <p className="text-sm font-bold text-gray-900">{subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR') : '-'}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-500">Status</p>
                <p className="text-lg font-bold text-gray-900">{subscription.status}</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100 flex-wrap">
              <button onClick={handleOpenPortal} disabled={portalLoading} className="text-sm text-blue-600 hover:text-blue-800 transition font-medium disabled:opacity-50">
                {portalLoading ? 'Abrindo portal...' : 'Gerenciar cartao e cobranca na Stripe'}
              </button>
              <button onClick={handleCancel} disabled={cancelling} className="text-sm text-red-500 hover:text-red-700 transition disabled:opacity-50">
                {cancelling ? 'Cancelando...' : 'Cancelar assinatura'}
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
            <FiExternalLink className="text-blue-600" />
            {needsReactivation ? 'Ativar assinatura com checkout hospedado' : 'Alterar plano com checkout hospedado'}
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            O cartao agora e coletado na pagina oficial da Stripe. Isso remove o campo embutido do app e reduz erros de renderizacao, 3DS e bloqueios no navegador.
          </p>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-3">Selecione o plano</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {PLANS.map((plan) => (
                <button
                  key={plan.key}
                  type="button"
                  onClick={() => setSelectedPlan(plan.key)}
                  className={`relative text-left p-4 rounded-xl border-2 transition-all ${selectedPlan === plan.key ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 hover:border-blue-300 bg-white'}`}
                >
                  {selectedPlan === plan.key && (
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                      <FiCheck className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <p className="font-bold text-gray-900">{plan.name}</p>
                  <p className="text-2xl font-extrabold text-blue-600 mt-1">
                    R${plan.price}<span className="text-sm font-normal text-gray-500">/mes</span>
                  </p>
                  <ul className="mt-3 space-y-1">
                    {plan.features.map((feature) => (
                      <li key={feature} className="text-xs text-gray-600 flex items-center gap-1">
                        <FiCheck className="w-3 h-3 text-green-500 shrink-0" /> {feature}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 mb-6">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <FiShield className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-blue-800 text-sm">Checkout oficial da Stripe</p>
                  <p className="text-blue-700 text-xs mt-1">Cartao, CVC, autenticacao e 3D Secure acontecem diretamente na infraestrutura da Stripe.</p>
                </div>
              </div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <FiCreditCard className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-green-800 text-sm">Portal para manutencao</p>
                  <p className="text-green-700 text-xs mt-1">Depois da assinatura, alteracoes de cartao e cobranca podem ser feitas no portal hospedado da Stripe.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={handleOpenCheckout}
              disabled={checkoutLoading}
              className="bg-blue-600 text-white py-3 px-6 rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {checkoutLoading ? 'Abrindo checkout...' : needsReactivation ? 'Ativar na Stripe' : 'Trocar plano na Stripe'}
            </button>
            {!needsReactivation && (
              <button
                onClick={handleOpenPortal}
                disabled={portalLoading}
                className="px-6 py-3 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50 transition font-medium disabled:opacity-50"
              >
                {portalLoading ? 'Abrindo portal...' : 'Gerenciar cartao no portal'}
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <FiDollarSign className="text-green-600" /> Historico de Pagamentos
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
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-b border-gray-50">
                      <td className="py-3 text-gray-800">{new Date(payment.createdAt).toLocaleDateString('pt-BR')}</td>
                      <td className="py-3 text-gray-800 font-semibold">R${parseFloat(payment.amount).toFixed(2)}</td>
                      <td className="py-3">{paymentStatusBadge(payment.status)}</td>
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
