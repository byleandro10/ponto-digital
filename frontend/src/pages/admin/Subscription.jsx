import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { FiCreditCard, FiCheck, FiAlertTriangle, FiDollarSign, FiShield, FiLock } from 'react-icons/fi';
import { useAuth } from '../../contexts/AuthContext';
import { useStripeCardSetup } from '../../hooks/useStripeCardSetup';

const PLAN_NAMES = { BASIC: 'Básico', PROFESSIONAL: 'Profissional', ENTERPRISE: 'Empresarial' };
const PLAN_PRICES = { BASIC: 49, PROFESSIONAL: 99, ENTERPRISE: 199 };
const PLANS = [
  { key: 'BASIC', name: 'Básico', price: 49, features: ['Até 15 funcionários', 'Registro de ponto', 'Relatórios básicos'] },
  { key: 'PROFESSIONAL', name: 'Profissional', price: 99, features: ['Até 50 funcionários', 'Cerca virtual', 'Relatórios avançados', 'Banco de horas'] },
  { key: 'ENTERPRISE', name: 'Empresarial', price: 199, features: ['Funcionários ilimitados', 'Todas as funcionalidades', 'Suporte prioritário'] },
];

function StripeField({ label, helper, error, containerRef }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className={`w-full rounded-xl border px-4 py-3 bg-white transition ${error ? 'border-red-300 ring-2 ring-red-100' : 'border-gray-300 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500'}`}>
        <div ref={containerRef} />
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
      const [statusRes, paymentsRes] = await Promise.all([
        api.get('/subscriptions/status'),
        api.get('/subscriptions/payments'),
      ]);
      const sub = statusRes.data.subscription;
      setSubscription(sub);
      setPayments(paymentsRes.data.payments || []);
      if (!sub || ['CANCELLED', 'EXPIRED', 'PAST_DUE'].includes(sub?.status) || (sub?.status === 'TRIAL' && sub?.trialEndsAt && new Date(sub.trialEndsAt) < new Date())) {
        setShowCardForm(true);
      }
      setSelectedPlan(sub?.plan || 'BASIC');
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
    cardNumberRef,
    cardExpiryRef,
    cardCvcRef,
    stripeReady,
    stripeLoading,
    stripeLoadError,
    fieldErrors,
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
      toast.error('Preencha número, validade e código de segurança para continuar.');
      return;
    }

    setSubmitting(true);
    try {
      const { paymentMethodId, setupIntentId } = await confirmCardSetup({
        cardHolder,
      });

      const endpoint = needsReactivation ? '/subscriptions/reactivate' : '/subscriptions/change-plan';
      const method = needsReactivation ? api.post : api.put;
      const response = await method(endpoint, {
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
    if (!window.confirm('Tem certeza de que deseja cancelar sua assinatura?')) return;
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
        {needsReactivation && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
            <div className="flex items-start gap-3">
              <FiAlertTriangle className="w-6 h-6 text-red-500 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-lg font-bold text-red-800">Assinatura inativa</h3>
                <p className="text-sm text-red-600 mt-1">Cadastre um cartão válido para reativar seu acesso e garantir as próximas cobranças automáticas.</p>
              </div>
            </div>
          </div>
        )}

        {subscription && !needsReactivation && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <FiCreditCard className="text-blue-600" /> Plano atual
              </h2>
              <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">{subscription.status}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-500">Plano</p>
                <p className="text-xl font-bold text-gray-900">{PLAN_NAMES[subscription.plan] || subscription.plan}</p>
                <p className="text-sm text-gray-500 mt-1">R${PLAN_PRICES[subscription.plan] || 0}/mês</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-500">Próxima cobrança</p>
                <p className="text-sm font-bold text-gray-900">{subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR') : '-'}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-500">Status</p>
                <p className="text-lg font-bold text-gray-900">{subscription.status}</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
              <button onClick={() => setShowCardForm(true)} className="text-sm text-blue-600 hover:text-blue-800 transition font-medium">
                Atualizar cartão ou plano
              </button>
              <button onClick={handleCancel} disabled={cancelling} className="text-sm text-red-500 hover:text-red-700 transition disabled:opacity-50">
                {cancelling ? 'Cancelando...' : 'Cancelar assinatura'}
              </button>
            </div>
          </div>
        )}

        {showCardForm && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
              <FiCreditCard className="text-blue-600" />
              {needsReactivation ? 'Validar cartão e reativar assinatura' : 'Atualizar plano e cartão'}
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Os campos abaixo são protegidos pela Stripe. Seu servidor não recebe número do cartão, validade nem código de segurança.
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
                      R${plan.price}<span className="text-sm font-normal text-gray-500">/mês</span>
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

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do titular</label>
                <input value={cardHolder} onChange={(e) => setCardHolder(e.target.value)} placeholder="Nome como está no cartão" className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <StripeField
                    label="Número do cartão"
                    helper="Digite o número do cartão no campo seguro da Stripe."
                    error={fieldErrors.cardNumber}
                    containerRef={cardNumberRef}
                  />
                </div>
                <StripeField
                  label="Validade"
                  helper="Mês e ano de vencimento."
                  error={fieldErrors.cardExpiry}
                  containerRef={cardExpiryRef}
                />
                <StripeField
                  label="Código de segurança"
                  helper="CVC ou CVV do cartão."
                  error={fieldErrors.cardCvc}
                  containerRef={cardCvcRef}
                />
              </div>

              {stripeLoading && (
                <p className="text-sm text-gray-500">Carregando o formulário seguro de pagamento...</p>
              )}

              {stripeLoadError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {stripeLoadError}
                </div>
              )}

              {!stripeLoading && !stripeLoadError && (
                <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <FiLock className="text-slate-500" />
                    <span>Pagamento seguro com Stripe, tokenização e autenticação quando necessário.</span>
                  </div>
                  <button type="button" onClick={mount} className="text-blue-600 hover:text-blue-800 font-medium">
                    Recarregar campos
                  </button>
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-gray-500 pt-2">
                <span className="flex items-center gap-1"><FiLock /> Criptografia SSL</span>
                <span className="flex items-center gap-1"><FiShield /> Stripe</span>
                <span className="flex items-center gap-1"><FiCreditCard /> Cobrança segura</span>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={handleSubmit} disabled={submitting || stripeLoading || !stripeReady} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? 'Processando...' : needsReactivation ? 'Reativar assinatura' : 'Salvar cartão e plano'}
                </button>
                {!needsReactivation && (
                  <button onClick={() => setShowCardForm(false)} className="px-6 py-3 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50 transition font-medium">
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <FiDollarSign className="text-green-600" /> Histórico de pagamentos
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
