import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FiAlertTriangle,
  FiCheck,
  FiCreditCard,
  FiDollarSign,
  FiLock,
  FiRefreshCw,
  FiShield,
} from 'react-icons/fi';
import AdminLayout from '../../components/AdminLayout';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useStripeCardSetup } from '../../hooks/useStripeCardSetup';

const PLAN_NAMES = {
  BASIC: 'Básico',
  PROFESSIONAL: 'Profissional',
  ENTERPRISE: 'Empresarial',
};

const PLAN_PRICES = {
  BASIC: 49,
  PROFESSIONAL: 99,
  ENTERPRISE: 199,
};

const PLANS = [
  { key: 'BASIC', name: 'Básico', price: 49, features: ['Até 15 funcionários', 'Registro de ponto', 'Relatórios básicos'] },
  { key: 'PROFESSIONAL', name: 'Profissional', price: 99, features: ['Até 50 funcionários', 'Cerca virtual', 'Relatórios avançados', 'Banco de horas'] },
  { key: 'ENTERPRISE', name: 'Empresarial', price: 199, features: ['Funcionários ilimitados', 'Todas as funcionalidades', 'Suporte prioritário'] },
];

function StripeField({ label, helper, error, containerRef }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <div className={`min-h-[56px] w-full rounded-xl border bg-white px-4 py-4 transition ${
        error ? 'border-red-300 ring-2 ring-red-100' : 'border-gray-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500'
      }`}>
        <div ref={containerRef} className="min-h-[24px]" />
      </div>
      <p className={`mt-2 text-xs ${error ? 'text-red-600' : 'text-gray-500'}`}>{error || helper}</p>
    </div>
  );
}

export default function Subscription() {
  const { user, updateSubscriptionStatus } = useAuth();
  const navigate = useNavigate();

  const [subscription, setSubscription] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('BASIC');
  const [cardHolder, setCardHolder] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);

    try {
      const [statusResponse, paymentsResponse] = await Promise.all([
        api.get('/subscriptions/status'),
        api.get('/subscriptions/payments'),
      ]);

      const nextSubscription = statusResponse.data.subscription;
      setSubscription(nextSubscription);
      setPayments(paymentsResponse.data.payments || []);
      setSelectedPlan(nextSubscription?.plan || 'BASIC');

      if (
        !nextSubscription ||
        ['CANCELLED', 'EXPIRED', 'PAST_DUE'].includes(nextSubscription?.status) ||
        (nextSubscription?.status === 'TRIAL' && nextSubscription?.trialEndsAt && new Date(nextSubscription.trialEndsAt) < new Date())
      ) {
        setShowCardForm(true);
      }
    } catch {
      toast.error('Não foi possível carregar os dados da assinatura.');
      setShowCardForm(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const {
    cardElementRef,
    stripeReady,
    stripeLoading,
    stripeLoadError,
    cardError,
    cardComplete,
    mount,
    confirmCardSetup,
  } = useStripeCardSetup({
    enabled: showCardForm,
    email: user?.email || '',
  });

  const needsReactivation = !subscription ||
    ['CANCELLED', 'EXPIRED', 'PAST_DUE'].includes(subscription?.status) ||
    (subscription?.status === 'TRIAL' && subscription?.trialEndsAt && new Date(subscription.trialEndsAt) < new Date());

  const handleSubmit = useCallback(async () => {
    if (!selectedPlan) {
      toast.error('Selecione um plano.');
      return;
    }
    if (!cardHolder || cardHolder.length < 3) {
      toast.error('Informe o nome do titular do cartão.');
      return;
    }
    if (stripeLoadError) {
      toast.error(stripeLoadError);
      return;
    }
    if (cardError) {
      toast.error(cardError);
      return;
    }
    if (!cardComplete || !stripeReady) {
      toast.error('Preencha os dados do cartão no campo seguro da Stripe para continuar.');
      return;
    }

    setSubmitting(true);

    try {
      const { paymentMethodId, setupIntentId } = await confirmCardSetup({ cardHolder });
      const endpoint = needsReactivation ? '/subscriptions/reactivate' : '/subscriptions/change-plan';
      const request = needsReactivation ? api.post : api.put;
      const response = await request(endpoint, {
        paymentMethodId,
        setupIntentId,
        plan: selectedPlan,
      });

      const nextSubscription = response.data.subscription;
      setSubscription(nextSubscription);
      updateSubscriptionStatus(nextSubscription.status, nextSubscription.trialEndsAt || null);
      setShowCardForm(false);
      toast.success(needsReactivation ? 'Assinatura reativada com sucesso.' : 'Cartão e plano atualizados com sucesso.');
      navigate('/admin/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.error || error.message || 'Não foi possível processar seu cartão.');
    } finally {
      setSubmitting(false);
    }
  }, [cardComplete, cardError, cardHolder, confirmCardSetup, navigate, needsReactivation, selectedPlan, stripeLoadError, stripeReady, updateSubscriptionStatus]);

  const handleCancel = async () => {
    if (!window.confirm('Tem certeza de que deseja cancelar sua assinatura?')) {
      return;
    }

    setCancelling(true);

    try {
      await api.post('/subscriptions/cancel');
      toast.success('Assinatura cancelada com sucesso.');
      await fetchData();
    } catch {
      toast.error('Não foi possível cancelar a assinatura.');
    } finally {
      setCancelling(false);
    }
  };

  const paymentStatusBadge = (status) => {
    const colors = {
      APPROVED: 'text-green-600',
      PENDING: 'text-yellow-600',
      REJECTED: 'text-red-600',
      REFUNDED: 'text-gray-600',
    };

    return <span className={`text-xs font-semibold ${colors[status] || 'text-gray-500'}`}>{status}</span>;
  };

  if (loading) {
    return (
      <AdminLayout title="Assinatura">
        <div className="flex items-center justify-center p-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Assinatura">
      <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-6">
        {needsReactivation && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <div className="flex items-start gap-3">
              <FiAlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-red-500" />
              <div>
                <h3 className="text-lg font-bold text-red-800">Assinatura inativa</h3>
                <p className="mt-1 text-sm text-red-600">Cadastre um cartão válido para reativar seu acesso e garantir as próximas cobranças automáticas.</p>
              </div>
            </div>
          </div>
        )}

        {subscription && !needsReactivation && (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                <FiCreditCard className="text-blue-600" />
                Plano atual
              </h2>
              <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">{subscription.status}</span>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-sm text-gray-500">Plano</p>
                <p className="text-xl font-bold text-gray-900">{PLAN_NAMES[subscription.plan] || subscription.plan}</p>
                <p className="mt-1 text-sm text-gray-500">R${PLAN_PRICES[subscription.plan] || 0}/mês</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-sm text-gray-500">Próxima cobrança</p>
                <p className="text-sm font-bold text-gray-900">
                  {subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR') : '-'}
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-sm text-gray-500">Status</p>
                <p className="text-lg font-bold text-gray-900">{subscription.status}</p>
              </div>
            </div>

            <div className="mt-6 flex gap-3 border-t border-gray-100 pt-4">
              <button onClick={() => setShowCardForm(true)} className="text-sm font-medium text-blue-600 transition hover:text-blue-800">
                Atualizar cartão ou plano
              </button>
              <button onClick={handleCancel} disabled={cancelling} className="text-sm text-red-500 transition hover:text-red-700 disabled:opacity-50">
                {cancelling ? 'Cancelando...' : 'Cancelar assinatura'}
              </button>
            </div>
          </div>
        )}

        {showCardForm && (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-gray-900">
              <FiCreditCard className="text-blue-600" />
              {needsReactivation ? 'Validar cartão e reativar assinatura' : 'Atualizar plano e cartão'}
            </h2>
            <p className="mb-6 text-sm text-gray-500">
              Digite os dados do cartão em um campo seguro da Stripe. Seu servidor não recebe número, validade nem código de segurança.
            </p>

            <div className="mb-6">
              <label className="mb-3 block text-sm font-semibold text-gray-700">Selecione o plano</label>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {PLANS.map((plan) => (
                  <button
                    key={plan.key}
                    type="button"
                    onClick={() => setSelectedPlan(plan.key)}
                    className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                      selectedPlan === plan.key ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 bg-white hover:border-blue-300'
                    }`}
                  >
                    {selectedPlan === plan.key && (
                      <div className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600">
                        <FiCheck className="h-3 w-3 text-white" />
                      </div>
                    )}

                    <p className="font-bold text-gray-900">{plan.name}</p>
                    <p className="mt-1 text-2xl font-extrabold text-blue-600">
                      R${plan.price}
                      <span className="text-sm font-normal text-gray-500">/mês</span>
                    </p>

                    <ul className="mt-3 space-y-1">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-1 text-xs text-gray-600">
                          <FiCheck className="h-3 w-3 shrink-0 text-green-500" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nome do titular</label>
                <input value={cardHolder} onChange={(event) => setCardHolder(event.target.value)} placeholder="Nome como está no cartão" className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500" />
              </div>

              <StripeField
                label="Dados do cartão"
                helper="Digite número, validade e código de segurança no campo protegido da Stripe."
                error={cardError}
                containerRef={cardElementRef}
              />

              {stripeLoading && (
                <p className="text-sm text-gray-500">Carregando o campo seguro de pagamento...</p>
              )}

              {stripeLoadError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {stripeLoadError}
                </div>
              )}

              {!stripeLoading && (
                <div className="flex flex-col gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-2">
                    <FiLock className="text-slate-500" />
                    <span>Pagamento seguro com Stripe, tokenização e autenticação quando necessário.</span>
                  </div>
                  <button type="button" onClick={mount} className="inline-flex items-center gap-2 font-medium text-blue-600 hover:text-blue-800">
                    <FiRefreshCw className="h-4 w-4" />
                    Recarregar campo
                  </button>
                </div>
              )}

              <div className="flex items-center gap-4 pt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <FiLock />
                  Criptografia SSL
                </span>
                <span className="flex items-center gap-1">
                  <FiShield />
                  Stripe
                </span>
                <span className="flex items-center gap-1">
                  <FiCreditCard />
                  Cobrança segura
                </span>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={handleSubmit} disabled={submitting || stripeLoading || !stripeReady} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? 'Processando...' : needsReactivation ? 'Reativar assinatura' : 'Salvar cartão e plano'}
                </button>
                {!needsReactivation && (
                  <button onClick={() => setShowCardForm(false)} className="rounded-xl border border-gray-300 px-6 py-3 font-medium text-gray-600 transition hover:bg-gray-50">
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
            <FiDollarSign className="text-green-600" />
            Histórico de pagamentos
          </h2>

          {payments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500">
                    <th className="pb-3 font-medium">Data</th>
                    <th className="pb-3 font-medium">Valor</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-b border-gray-50">
                      <td className="py-3 text-gray-800">{new Date(payment.createdAt).toLocaleDateString('pt-BR')}</td>
                      <td className="py-3 font-semibold text-gray-800">R${parseFloat(payment.amount).toFixed(2)}</td>
                      <td className="py-3">{paymentStatusBadge(payment.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-gray-400">Nenhum pagamento registrado ainda.</p>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
