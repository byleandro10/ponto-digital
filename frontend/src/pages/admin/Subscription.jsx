import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { FiCreditCard, FiCheck, FiAlertTriangle, FiCalendar, FiDollarSign, FiArrowUp, FiShield, FiLock } from 'react-icons/fi';
import { useAuth } from '../../contexts/AuthContext';

const PLAN_NAMES = { BASIC: 'Básico', PROFESSIONAL: 'Profissional', ENTERPRISE: 'Empresarial' };
const PLAN_PRICES = { BASIC: 49, PROFESSIONAL: 99, ENTERPRISE: 199 };
const PLANS = [
  { key: 'BASIC', name: 'Básico', price: 49, employees: 15, features: ['Até 15 funcionários', 'Registro de ponto', 'Relatórios básicos'] },
  { key: 'PROFESSIONAL', name: 'Profissional', price: 99, employees: 50, features: ['Até 50 funcionários', 'Cerca virtual', 'Relatórios avançados', 'Banco de horas'] },
  { key: 'ENTERPRISE', name: 'Empresarial', price: 199, employees: 'Ilimitado', features: ['Funcionários ilimitados', 'Todas as funcionalidades', 'Suporte prioritário', 'Exportação avançada'] },
];

export default function Subscription() {
  const { user, updateSubscriptionStatus } = useAuth();
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  // Card form state
  const [showCardForm, setShowCardForm] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardBrand, setCardBrand] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mpReady, setMpReady] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  // Load MP SDK for card tokenization
  useEffect(() => {
    if (!showCardForm) return;
    if (document.getElementById('mp-sdk')) { setMpReady(true); return; }
    const script = document.createElement('script');
    script.id = 'mp-sdk';
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.onload = () => setMpReady(true);
    document.head.appendChild(script);
  }, [showCardForm]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statusRes, paymentsRes] = await Promise.all([
        api.get('/subscriptions/status'),
        api.get('/subscriptions/payments'),
      ]);
      setSubscription(statusRes.data.subscription);
      setPayments(paymentsRes.data.payments || []);
      // Se subscription está inativa, mostrar formulário automaticamente
      const sub = statusRes.data.subscription;
      if (!sub || ['CANCELLED', 'EXPIRED'].includes(sub?.status)) {
        setShowCardForm(true);
        setSelectedPlan(sub?.plan || 'BASIC');
      } else if (sub?.status === 'PAST_DUE') {
        setShowCardForm(true);
        setSelectedPlan(sub?.plan || 'BASIC');
      } else if (sub?.status === 'TRIAL' && sub?.trialEndsAt && new Date(sub.trialEndsAt) < new Date()) {
        setShowCardForm(true);
        setSelectedPlan(sub?.plan || 'BASIC');
      }
    } catch {
      toast.error('Erro ao carregar dados da assinatura.');
      setShowCardForm(true);
      setSelectedPlan('BASIC');
    } finally {
      setLoading(false);
    }
  };

  // Format card number with spaces
  const formatCardNumber = (v) => v.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim().slice(0, 19);
  const formatExpiry = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 4);
    return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };

  // Detect card brand
  useEffect(() => {
    const n = cardNumber.replace(/\s/g, '');
    if (n.startsWith('4')) setCardBrand('visa');
    else if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) setCardBrand('mastercard');
    else if (/^3[47]/.test(n)) setCardBrand('amex');
    else if (/^(636|5067|4576|4011)/.test(n)) setCardBrand('elo');
    else setCardBrand('');
  }, [cardNumber]);

  const needsReactivation = !subscription ||
    ['CANCELLED', 'EXPIRED'].includes(subscription?.status) ||
    subscription?.status === 'PAST_DUE' ||
    (subscription?.status === 'TRIAL' && subscription?.trialEndsAt && new Date(subscription.trialEndsAt) < new Date());

  const handleReactivate = useCallback(async () => {
    if (!selectedPlan) { toast.error('Selecione um plano.'); return; }
    if (cardNumber.replace(/\s/g, '').length < 13) { toast.error('Número do cartão inválido.'); return; }
    if (!cardHolder || cardHolder.length < 3) { toast.error('Nome no cartão obrigatório.'); return; }
    if (!cardExpiry || cardExpiry.length !== 5) { toast.error('Validade inválida (MM/AA).'); return; }
    if (!cardCvv || cardCvv.length < 3) { toast.error('CVV inválido.'); return; }

    setSubmitting(true);
    try {
      // Tokenizar cartão via MP SDK
      let cardTokenId = null;
      let paymentMethodId = null;
      if (!user?.company?.cnpj) {
        throw new Error('CNPJ da empresa nao encontrado para validar o cartao.');
      }

      if (window.MercadoPago) {
        try {
          const mp = new window.MercadoPago(import.meta.env.VITE_MP_PUBLIC_KEY || 'TEST-0000-0000', { locale: 'pt-BR' });
          const [expMonth, expYear] = cardExpiry.split('/');
          const tokenResult = await mp.createCardToken({
            cardNumber: cardNumber.replace(/\s/g, ''),
            cardholderName: cardHolder,
            cardExpirationMonth: expMonth,
            cardExpirationYear: `20${expYear}`,
            securityCode: cardCvv,
            identificationType: 'CNPJ',
            identificationNumber: user.company.cnpj.replace(/\D/g, ''),
          });
          cardTokenId = tokenResult.id;
          paymentMethodId = tokenResult.payment_method_id || cardBrand;
        } catch (mpErr) {
          throw new Error(mpErr.message || 'Falha ao tokenizar o cartao no Mercado Pago.');
          console.warn('Tokenização MP falhou (credenciais de teste?):', mpErr.message);
        }
      }

      if (!cardTokenId || !paymentMethodId) {
        throw new Error('Nao foi possivel validar o cartao no Mercado Pago.');
      }

      await api.post('/subscriptions/reactivate', {
        cardTokenId,
        paymentMethodId,
        plan: selectedPlan,
      });

      toast.success('Assinatura reativada com sucesso!');
      setShowCardForm(false);
      setCardNumber(''); setCardHolder(''); setCardExpiry(''); setCardCvv('');

      // Atualizar status no contexto e localStorage
      updateSubscriptionStatus('ACTIVE', null);

      // Redirecionar para o dashboard com acesso liberado
      navigate('/admin/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao processar pagamento. Verifique os dados do cartão.');
    } finally {
      setSubmitting(false);
    }
  }, [selectedPlan, cardNumber, cardHolder, cardExpiry, cardCvv, user]);

  const handleCancel = async () => {
    if (!window.confirm('Tem certeza que deseja cancelar sua assinatura? Seu acesso será mantido até o fim do período atual.')) return;
    setCancelling(true);
    try {
      await api.post('/subscriptions/cancel');
      toast.success('Assinatura cancelada.');
      await fetchData();
    } catch { toast.error('Erro ao cancelar.'); }
    finally { setCancelling(false); }
  };

  const statusBadge = (status) => {
    const colors = { TRIAL: 'bg-blue-100 text-blue-700', ACTIVE: 'bg-green-100 text-green-700', PAST_DUE: 'bg-yellow-100 text-yellow-700', CANCELLED: 'bg-red-100 text-red-700', EXPIRED: 'bg-gray-100 text-gray-700' };
    const labels = { TRIAL: 'Período de teste', ACTIVE: 'Ativa', PAST_DUE: 'Pagamento pendente', CANCELLED: 'Cancelada', EXPIRED: 'Expirada' };
    return <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${colors[status] || 'bg-gray-100 text-gray-600'}`}>{labels[status] || status}</span>;
  };

  const paymentStatusBadge = (status) => {
    const colors = { APPROVED: 'text-green-600', PENDING: 'text-yellow-600', REJECTED: 'text-red-600', REFUNDED: 'text-gray-600' };
    const labels = { APPROVED: 'Aprovado', PENDING: 'Pendente', REJECTED: 'Rejeitado', REFUNDED: 'Reembolsado' };
    return <span className={`text-xs font-semibold ${colors[status] || 'text-gray-500'}`}>{labels[status] || status}</span>;
  };

  const brandIcons = { visa: '💳 Visa', mastercard: '💳 Master', amex: '💳 Amex', elo: '💳 Elo' };

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

        {/* Alerta para subscription inativa */}
        {needsReactivation && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
            <div className="flex items-start gap-3">
              <FiAlertTriangle className="w-6 h-6 text-red-500 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-lg font-bold text-red-800">
                  {subscription?.status === 'PAST_DUE' ? 'Pagamento pendente' :
                   subscription?.status === 'TRIAL' ? 'Período de teste expirado' :
                   'Assinatura inativa'}
                </h3>
                <p className="text-sm text-red-600 mt-1">
                  {subscription?.status === 'PAST_DUE'
                    ? 'Houve um problema com seu pagamento. Atualize seu cartão de crédito para manter o acesso ao sistema.'
                    : 'Seu acesso ao sistema está bloqueado. Cadastre um cartão de crédito para ativar ou reativar sua assinatura.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Plano atual (se existir e estiver ativo) */}
        {subscription && !needsReactivation && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <FiCreditCard className="text-blue-600" /> Plano Atual
              </h2>
              {statusBadge(subscription.status)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-500">Plano</p>
                <p className="text-xl font-bold text-gray-900">{PLAN_NAMES[subscription.plan] || subscription.plan}</p>
                <p className="text-sm text-gray-500 mt-1">R${PLAN_PRICES[subscription.plan] || 0}/mês</p>
              </div>
              {subscription.status === 'TRIAL' && subscription.trialDaysLeft > 0 && (
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-sm text-blue-600">Dias restantes do trial</p>
                  <p className="text-3xl font-extrabold text-blue-700">{subscription.trialDaysLeft}</p>
                  <p className="text-xs text-blue-500 mt-1">Expira em {new Date(subscription.trialEndsAt).toLocaleDateString('pt-BR')}</p>
                </div>
              )}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-500">Membro desde</p>
                <p className="text-lg font-bold text-gray-900">{new Date(subscription.createdAt).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
            {['TRIAL', 'ACTIVE', 'PAST_DUE'].includes(subscription.status) && (
              <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
                <button onClick={() => { setShowCardForm(true); setSelectedPlan(subscription.plan); }}
                  className="text-sm text-blue-600 hover:text-blue-800 transition font-medium">
                  Alterar cartão / plano
                </button>
                <button onClick={handleCancel} disabled={cancelling}
                  className="text-sm text-red-500 hover:text-red-700 transition disabled:opacity-50">
                  {cancelling ? 'Cancelando...' : 'Cancelar assinatura'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Formulário de cartão de crédito */}
        {showCardForm && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
              <FiCreditCard className="text-blue-600" />
              {needsReactivation ? 'Ativar Assinatura' : 'Alterar Cartão de Crédito'}
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {needsReactivation
                ? 'Escolha seu plano e insira os dados do cartão para ativar o acesso ao sistema.'
                : 'Insira os dados do novo cartão de crédito.'}
            </p>

            {/* Seleção de plano */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-3">Selecione o plano</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {PLANS.map((plan) => (
                  <button key={plan.key} type="button"
                    onClick={() => setSelectedPlan(plan.key)}
                    className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                      selectedPlan === plan.key
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-blue-300 bg-white'
                    }`}>
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
                      {plan.features.map((f, i) => (
                        <li key={i} className="text-xs text-gray-600 flex items-center gap-1">
                          <FiCheck className="w-3 h-3 text-green-500 shrink-0" /> {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
            </div>

            {/* Dados do cartão */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número do cartão</label>
                <div className="relative">
                  <input type="text" placeholder="0000 0000 0000 0000"
                    value={cardNumber} onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    maxLength={19}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono pr-20" />
                  {cardBrand && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500">
                      {brandIcons[cardBrand] || cardBrand}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome no cartão</label>
                <input type="text" placeholder="NOME COMO ESTÁ NO CARTÃO"
                  value={cardHolder} onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none uppercase" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Validade</label>
                  <input type="text" placeholder="MM/AA"
                    value={cardExpiry} onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                    maxLength={5}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CVV</label>
                  <input type="text" placeholder="000"
                    value={cardCvv} onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    maxLength={4}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono" />
                </div>
              </div>

              {/* Badges segurança */}
              <div className="flex items-center gap-4 text-xs text-gray-400 pt-2">
                <span className="flex items-center gap-1"><FiLock /> Criptografia SSL</span>
                <span className="flex items-center gap-1"><FiShield /> PCI Compliant</span>
                <span className="flex items-center gap-1"><FiCreditCard /> Mercado Pago</span>
              </div>

              {/* Resumo */}
              {selectedPlan && (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-800">Plano {PLAN_NAMES[selectedPlan]}</p>
                      <p className="text-xs text-gray-500">Cobrança mensal recorrente</p>
                    </div>
                    <p className="text-2xl font-extrabold text-blue-600">R${PLAN_PRICES[selectedPlan]}<span className="text-sm font-normal text-gray-500">/mês</span></p>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={handleReactivate} disabled={submitting || !mpReady}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? (
                    <><div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" /> Processando...</>
                  ) : (
                    <><FiCreditCard /> {needsReactivation ? 'Ativar Assinatura' : 'Atualizar Cartão'}</>
                  )}
                </button>
                {!needsReactivation && (
                  <button onClick={() => setShowCardForm(false)}
                    className="px-6 py-3 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50 transition font-medium">
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

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
                      <td className="py-3 text-gray-800">{new Date(p.createdAt).toLocaleDateString('pt-BR')}</td>
                      <td className="py-3 text-gray-800 font-semibold">R${parseFloat(p.amount).toFixed(2)}</td>
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
