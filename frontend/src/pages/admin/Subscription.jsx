import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FiAlertTriangle,
  FiArrowRight,
  FiCheck,
  FiClock,
  FiCreditCard,
  FiExternalLink,
  FiRefreshCw,
} from 'react-icons/fi';
import AdminLayout from '../../components/AdminLayout';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import {
  PLANS,
  getPlan,
  getSubscriptionStatusLabel,
  hasBillingAccess,
  normalizePlanKey,
} from '../../utils/billing';

function StatusBadge({ status }) {
  const styles = {
    INCOMPLETE: 'bg-slate-100 text-slate-700',
    INCOMPLETE_EXPIRED: 'bg-slate-100 text-slate-700',
    TRIALING: 'bg-blue-100 text-blue-700',
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    PAST_DUE: 'bg-amber-100 text-amber-700',
    UNPAID: 'bg-red-100 text-red-700',
    CANCELED: 'bg-slate-200 text-slate-700',
  };

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${styles[status] || 'bg-slate-100 text-slate-700'}`}>
      {getSubscriptionStatusLabel(status)}
    </span>
  );
}

function PlanCard({ planKey, selectedPlan, onSelect }) {
  const plan = PLANS[planKey];
  const selected = selectedPlan === planKey;

  return (
    <button
      type="button"
      onClick={() => onSelect(planKey)}
      className={`relative rounded-3xl border p-5 text-left transition ${
        selected ? 'border-blue-600 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-200'
      }`}
    >
      {plan.popular && (
        <span className="absolute right-4 top-4 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white">
          Mais escolhido
        </span>
      )}

      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
          <p className="mt-1 text-sm text-slate-500">{plan.employees}</p>
        </div>
        <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 text-transparent'}`}>
          <FiCheck className="h-3 w-3" />
        </div>
      </div>

      <p className="mb-4 text-3xl font-extrabold tracking-tight text-slate-900">
        R${plan.price}
        <span className="ml-1 text-sm font-normal text-slate-500">/mês</span>
      </p>

      <ul className="space-y-2 text-sm text-slate-600">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <FiCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}

export default function Subscription() {
  const { user, updateSubscriptionStatus } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [subscription, setSubscription] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(normalizePlanKey(user?.company?.plan || 'PROFESSIONAL'));

  const checkoutState = searchParams.get('checkout');
  const checkoutSessionId = searchParams.get('session_id');

  const fetchData = useCallback(async () => {
    setLoading(true);

    try {
      const [statusResponse, paymentsResponse] = await Promise.all([
        api.get('/billing/status'),
        api.get('/billing/payments'),
      ]);

      const nextSubscription = statusResponse.data.subscription;
      setSubscription(nextSubscription);
      setPayments(paymentsResponse.data.payments || []);

      if (nextSubscription?.plan) {
        setSelectedPlan(normalizePlanKey(nextSubscription.plan));
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Não foi possível carregar os dados da assinatura.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (checkoutState !== 'success' || !checkoutSessionId) {
      if (checkoutState === 'cancelled') {
        toast('Pagamento cancelado. Você pode tentar novamente quando quiser.');
        setSearchParams({});
      }
      return;
    }

    let cancelled = false;

    async function syncCheckout() {
      try {
        const response = await api.post('/billing/checkout-session/sync', {
          sessionId: checkoutSessionId,
        });

        if (cancelled) return;

        const nextSubscription = response.data.subscription;
        setSubscription(nextSubscription);
        updateSubscriptionStatus(nextSubscription?.status || 'INCOMPLETE', nextSubscription?.trialEndsAt || null);
        toast.success('Assinatura ativada com sucesso.');
        setSearchParams({});
        fetchData();
      } catch (error) {
        if (!cancelled) {
          toast.error(error.response?.data?.error || 'Não foi possível confirmar o retorno do checkout.');
        }
      }
    }

    syncCheckout();

    return () => {
      cancelled = true;
    };
  }, [checkoutSessionId, checkoutState, fetchData, setSearchParams, updateSubscriptionStatus]);

  const effectivePlan = useMemo(() => getPlan(subscription?.plan || selectedPlan), [selectedPlan, subscription?.plan]);
  const subscriptionStatus = subscription?.status || user?.subscriptionStatus || 'INCOMPLETE';
  const billingAccess = hasBillingAccess(subscriptionStatus);
  const portalEligible = Boolean(subscription?.portalEligible || subscription?.stripeCustomerId);
  const canStartCheckout = !subscription || ['INCOMPLETE', 'INCOMPLETE_EXPIRED', 'CANCELED'].includes(subscriptionStatus);
  const needsPortalRecovery = ['PAST_DUE', 'UNPAID', 'ACTIVE', 'TRIALING'].includes(subscriptionStatus) && portalEligible;

  async function handleStartCheckout() {
    setCheckoutLoading(true);

    try {
      const { data } = await api.post('/billing/checkout-session', { plan: selectedPlan });

      if (!data.checkoutUrl) {
        throw new Error('A Stripe não retornou a URL do checkout.');
      }

      window.location.href = data.checkoutUrl;
    } catch (error) {
      toast.error(error.response?.data?.error || 'Não foi possível abrir o checkout agora.');
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handleOpenPortal() {
    setPortalLoading(true);

    try {
      const { data } = await api.post('/billing/portal-session');

      if (!data.portalUrl) {
        throw new Error('A Stripe não retornou a URL do portal.');
      }

      window.location.href = data.portalUrl;
    } catch (error) {
      toast.error(error.response?.data?.error || 'Não foi possível abrir o portal da assinatura.');
    } finally {
      setPortalLoading(false);
    }
  }

  const paymentStatusLabel = {
    PAID: 'Pago',
    PENDING: 'Pendente',
    FAILED: 'Falhou',
    VOID: 'Cancelado',
  };

  const paymentStatusColor = {
    PAID: 'text-emerald-600',
    PENDING: 'text-amber-600',
    FAILED: 'text-red-600',
    VOID: 'text-slate-500',
  };

  if (loading) {
    return (
      <AdminLayout title="Assinatura">
        <div className="flex items-center justify-center p-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Assinatura">
      <div className="mx-auto max-w-6xl space-y-6 p-4 lg:p-6">
        <section className="rounded-[30px] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">Cobrança hospedada pela Stripe</p>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">
                Assinatura simples, segura e sem formulário de cartão no sistema
              </h1>
              <p className="mt-3 text-slate-600">
                Inicie a assinatura pelo checkout da Stripe e use o portal para atualizar cartão, cancelar ou consultar a cobrança.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Status atual</p>
              <div className="mt-3">
                <StatusBadge status={subscriptionStatus} />
              </div>
              {subscription?.trialEndsAt && (
                <p className="mt-3">
                  Trial até <strong>{new Date(subscription.trialEndsAt).toLocaleDateString('pt-BR')}</strong>
                </p>
              )}
              {subscription?.currentPeriodEnd && (
                <p className="mt-1">
                  Próximo ciclo em <strong>{new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR')}</strong>
                </p>
              )}
            </div>
          </div>

          {!billingAccess && (
            <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                <FiAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold text-amber-900">Seu acesso está limitado até a assinatura ficar regular.</p>
                  <p className="mt-1 text-sm text-amber-800">
                    Conclua uma nova assinatura ou atualize a forma de pagamento no portal da Stripe.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Plano atual</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{effectivePlan.name}</p>
              <p className="mt-1 text-sm text-slate-500">{effectivePlan.employees}</p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Valor</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">R${effectivePlan.price}/mês</p>
              <p className="mt-1 text-sm text-slate-500">Cobrança recorrente pela Stripe</p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Gestão</p>
              <p className="mt-2 text-base font-semibold text-slate-900">
                {portalEligible ? 'Portal disponível' : 'Portal liberado após a primeira assinatura'}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Atualização de cartão, cancelamento e histórico pela Stripe.
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[30px] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex items-center gap-3">
              <FiCreditCard className="h-5 w-5 text-blue-600" />
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {canStartCheckout ? 'Escolha seu plano e siga para o checkout' : 'Gerencie sua assinatura'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {canStartCheckout
                    ? 'Os dados do cartão são coletados diretamente pela Stripe.'
                    : 'Use o portal para trocar cartão, cancelar ou revisar a cobrança.'}
                </p>
              </div>
            </div>

            {canStartCheckout && (
              <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
                {Object.keys(PLANS).map((planKey) => (
                  <PlanCard key={planKey} planKey={planKey} selectedPlan={selectedPlan} onSelect={setSelectedPlan} />
                ))}
              </div>
            )}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {canStartCheckout && (
                <button
                  type="button"
                  onClick={handleStartCheckout}
                  disabled={checkoutLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {checkoutLoading ? 'Abrindo checkout...' : 'Assinar agora'}
                  {!checkoutLoading && <FiArrowRight />}
                </button>
              )}

              {(needsPortalRecovery || (portalEligible && !canStartCheckout)) && (
                <button
                  type="button"
                  onClick={handleOpenPortal}
                  disabled={portalLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {portalLoading ? 'Abrindo portal...' : 'Gerenciar assinatura'}
                  {!portalLoading && <FiExternalLink />}
                </button>
              )}

              <button
                type="button"
                onClick={fetchData}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <FiRefreshCw />
                Atualizar status
              </button>
            </div>
          </div>

          <div className="rounded-[30px] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex items-center gap-3">
              <FiClock className="h-5 w-5 text-blue-600" />
              <div>
                <h2 className="text-xl font-bold text-slate-900">Como funciona</h2>
                <p className="mt-1 text-sm text-slate-500">Fluxo simplificado para produção.</p>
              </div>
            </div>

            <ol className="mt-6 space-y-4 text-sm text-slate-600">
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">1</span>
                <span>Você escolhe o plano e segue para o checkout hospedado pela Stripe.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">2</span>
                <span>Cartão, autenticação e assinatura são processados diretamente pela Stripe.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">3</span>
                <span>Os webhooks atualizam o status no sistema e liberam o acesso automaticamente.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">4</span>
                <span>Troca de cartão, cancelamento e outras ações seguem pelo portal da Stripe.</span>
              </li>
            </ol>
          </div>
        </section>

        <section className="rounded-[30px] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <FiClock className="h-5 w-5 text-blue-600" />
            <div>
              <h2 className="text-xl font-bold text-slate-900">Histórico de pagamentos</h2>
              <p className="mt-1 text-sm text-slate-500">Eventos recebidos e sincronizados pelo backend.</p>
            </div>
          </div>

          {payments.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              Nenhum pagamento foi registrado até o momento.
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-3 font-medium">Data</th>
                    <th className="pb-3 font-medium">Valor</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Fatura</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-b border-slate-100">
                      <td className="py-4 text-slate-800">{new Date(payment.createdAt).toLocaleDateString('pt-BR')}</td>
                      <td className="py-4 font-semibold text-slate-900">R${Number(payment.amount).toFixed(2)}</td>
                      <td className={`py-4 font-semibold ${paymentStatusColor[payment.status] || 'text-slate-500'}`}>
                        {paymentStatusLabel[payment.status] || payment.status}
                      </td>
                      <td className="py-4 text-slate-500">{payment.stripeInvoiceId || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
