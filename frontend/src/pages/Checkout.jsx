import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FiClock, FiCheck, FiArrowLeft, FiArrowRight, FiLock, FiShield, FiCreditCard } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const PLANS = {
  basic: {
    key: 'BASIC',
    name: 'Básico',
    price: 49,
    employees: 'Até 15 funcionários',
    features: ['Ponto digital com GPS', 'Dashboard em tempo real', 'Relatório mensal', 'Suporte por e-mail', 'PWA (funciona offline)'],
  },
  professional: {
    key: 'PROFESSIONAL',
    name: 'Profissional',
    price: 99,
    employees: 'Até 50 funcionários',
    features: ['Tudo do Básico', 'Selfie anti-fraude', 'Cerca virtual (geofencing)', 'Exportação PDF/Excel/CSV', 'Banco de horas', 'Suporte prioritário'],
    popular: true,
  },
  enterprise: {
    key: 'ENTERPRISE',
    name: 'Empresarial',
    price: 199,
    employees: 'Funcionários ilimitados',
    features: ['Tudo do Profissional', 'API de integração', 'Multi-filiais', 'Relatórios avançados', 'Gerente de conta dedicado', 'SLA 99.9%'],
  },
};

function PlanCard({ plan, selected, onSelect }) {
  const isSelected = selected === plan.key;
  return (
    <button
      type="button"
      onClick={() => onSelect(plan.key)}
      className={`relative rounded-2xl p-6 text-left transition-all border-2 ${
        isSelected
          ? 'border-blue-600 bg-blue-50 shadow-lg'
          : 'border-gray-200 bg-white hover:border-blue-300'
      }`}
    >
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-400 text-gray-900 text-xs font-bold px-3 py-1 rounded-full">
          MAIS POPULAR
        </div>
      )}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-gray-800">{plan.name}</h3>
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
          isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
        }`}>
          {isSelected && <FiCheck className="w-3 h-3 text-white" />}
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-3">{plan.employees}</p>
      <div className="mb-4">
        <span className="text-3xl font-extrabold text-gray-900">R${plan.price}</span>
        <span className="text-gray-500 text-sm">/mês</span>
      </div>
      <ul className="space-y-2">
        {plan.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
            <FiCheck className="w-4 h-4 mt-0.5 text-green-500 flex-shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}

export default function Checkout() {
  const { plan: urlPlan } = useParams();
  const navigate = useNavigate();
  useAuth();

  const [step, setStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState(
    urlPlan && PLANS[urlPlan] ? PLANS[urlPlan].key : 'PROFESSIONAL'
  );

  // Step 2 — Dados empresa + admin
  const [companyName, setCompanyName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Step 3 — Cartão
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardBrand, setCardBrand] = useState('');
  const [mpReady, setMpReady] = useState(false);

  const [loading, setLoading] = useState(false);

  // Inicializar Mercado Pago SDK
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.onload = () => setMpReady(true);
    document.body.appendChild(script);
    return () => {
      const existing = document.querySelector('script[src*="mercadopago"]');
      if (existing) existing.remove();
    };
  }, []);

  // Detectar bandeira do cartão
  useEffect(() => {
    const num = cardNumber.replace(/\s/g, '');
    if (num.startsWith('4')) setCardBrand('visa');
    else if (/^5[1-5]/.test(num) || /^2[2-7]/.test(num)) setCardBrand('mastercard');
    else if (/^3[47]/.test(num)) setCardBrand('amex');
    else if (/^(636368|636297|504175|438935|40117[8-9]|45763[1-2])/.test(num) || /^(636[0-9]{3})/.test(num)) setCardBrand('elo');
    else setCardBrand('');
  }, [cardNumber]);

  const formatCardNumber = (val) => {
    const nums = val.replace(/\D/g, '').slice(0, 16);
    return nums.replace(/(\d{4})/g, '$1 ').trim();
  };

  const formatExpiry = (val) => {
    const nums = val.replace(/\D/g, '').slice(0, 4);
    if (nums.length > 2) return nums.slice(0, 2) + '/' + nums.slice(2);
    return nums;
  };

  const selectedPlanData = Object.values(PLANS).find((p) => p.key === selectedPlan);
  const firstChargeDate = new Date();
  firstChargeDate.setDate(firstChargeDate.getDate() + 30);

  const validateStep2 = () => {
    if (!companyName || companyName.length < 3) { toast.error('Nome da empresa deve ter pelo menos 3 caracteres.'); return false; }
    if (!cnpj || cnpj.replace(/\D/g, '').length !== 14) { toast.error('CNPJ deve ter 14 dígitos.'); return false; }
    if (!name || name.length < 3) { toast.error('Nome deve ter pelo menos 3 caracteres.'); return false; }
    if (!email || !email.includes('@')) { toast.error('E-mail inválido.'); return false; }
    if (!password || password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      toast.error('Senha deve ter pelo menos 8 caracteres, com 1 maiuscula, 1 minuscula e 1 numero.');
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    if (cardNumber.replace(/\s/g, '').length < 13) { toast.error('Número do cartão inválido.'); return false; }
    if (!cardHolder || cardHolder.length < 3) { toast.error('Nome no cartão obrigatório.'); return false; }
    if (!cardExpiry || cardExpiry.length !== 5) { toast.error('Validade inválida.'); return false; }
    if (!cardCvv || cardCvv.length < 3) { toast.error('CVV inválido.'); return false; }
    return true;
  };

  const handleSubmit = useCallback(async () => {
    if (!validateStep3()) return;
    setLoading(true);
    try {
      // 1. Tokenizar cartão via Mercado Pago JS SDK
      let cardTokenId = null;
      let paymentMethodId = null;
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
            identificationNumber: cnpj.replace(/\D/g, ''),
          });
          cardTokenId = tokenResult.id;
          paymentMethodId = tokenResult.payment_method_id || cardBrand;
        } catch (mpErr) {
          throw new Error(mpErr.message || 'Falha ao tokenizar o cartao no Mercado Pago.');
          console.warn('Tokenização MP falhou (credenciais de teste?):', mpErr.message);
        }
      }

      // 2. Registrar empresa + admin
      const registerRes = await api.post('/auth/register', {
        companyName,
        cnpj,
        name,
        email,
        password,
        plan: selectedPlan.toLowerCase(),
      });

      const { token, user: userData, company, subscriptionStatus, trialEndsAt } = registerRes.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify({ ...userData, company, type: 'admin', subscriptionStatus: subscriptionStatus || 'TRIAL', trialEndsAt }));

      // 3. Criar assinatura com trial
      if (!cardTokenId || !paymentMethodId) {
        throw new Error('Nao foi possivel validar o cartao para iniciar o trial.');
      }
      if (cardTokenId) {
        try {
          await api.post('/subscriptions/create-preapproval', {
            plan: selectedPlan,
            cardTokenId,
            paymentMethodId,
            email,
          }, {
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch (subErr) {
          throw subErr;
          console.warn('Assinatura MP não criada (modo dev?):', subErr.message);
        }
      }

      toast.success('Bem-vindo! Seus 30 dias grátis começaram! 🎉');
      // Force page reload to update auth context
      window.location.href = '/admin/dashboard';
    } catch (error) {
      const msg = error.response?.data?.error || error.message || 'Erro ao criar conta. Tente novamente.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [companyName, cnpj, name, email, password, selectedPlan, cardNumber, cardHolder, cardExpiry, cardCvv, cardBrand]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold text-blue-600">
            <FiClock className="w-7 h-7" /> PontoDigital
          </Link>
          <Link to="/" className="text-sm text-gray-500 hover:text-blue-600 flex items-center gap-1">
            <FiArrowLeft className="w-4 h-4" /> Voltar
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {step > s ? <FiCheck className="w-4 h-4" /> : s}
              </div>
              {s < 4 && <div className={`w-12 h-0.5 ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Plano */}
        {step === 1 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Escolha seu plano</h2>
            <p className="text-gray-500 text-center mb-8">30 dias grátis em todos os planos. Cancele quando quiser.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Object.values(PLANS).map((p) => (
                <PlanCard key={p.key} plan={p} selected={selectedPlan} onSelect={setSelectedPlan} />
              ))}
            </div>
            <div className="flex justify-center mt-8">
              <button onClick={() => setStep(2)} className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold px-8 py-3 rounded-xl hover:bg-blue-700 transition">
                Continuar <FiArrowRight />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Dados da Empresa */}
        {step === 2 && (
          <div className="max-w-lg mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Dados da empresa</h2>
            <p className="text-gray-500 text-center mb-8">Informações para criar sua conta</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da empresa</label>
                <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Empresa Exemplo Ltda" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                <input type="text" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" maxLength={18} className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
              <hr className="border-gray-200" />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Seu nome</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="João Silva" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="joao@empresa.com" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimo 8 caracteres, com maiuscula, minuscula e numero" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
            </div>
            <div className="flex justify-between mt-8">
              <button onClick={() => setStep(1)} className="text-gray-500 hover:text-blue-600 flex items-center gap-1">
                <FiArrowLeft /> Voltar
              </button>
              <button onClick={() => validateStep2() && setStep(3)} className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold px-8 py-3 rounded-xl hover:bg-blue-700 transition">
                Continuar <FiArrowRight />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Cartão de Crédito */}
        {step === 3 && (
          <div className="max-w-lg mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Dados do cartão</h2>
            <p className="text-gray-500 text-center mb-2">Você só será cobrado após 30 dias</p>
            <div className="flex items-center justify-center gap-2 mb-8">
              <FiLock className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-600 font-medium">Pagamento seguro via Mercado Pago</span>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número do cartão</label>
                <div className="relative">
                  <input type="text" value={cardNumber} onChange={(e) => setCardNumber(formatCardNumber(e.target.value))} placeholder="0000 0000 0000 0000" maxLength={19} className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-16 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                  {cardBrand && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold uppercase text-gray-400 bg-gray-100 px-2 py-1 rounded">
                      {cardBrand}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome no cartão</label>
                <input type="text" value={cardHolder} onChange={(e) => setCardHolder(e.target.value.toUpperCase())} placeholder="NOME COMO NO CARTÃO" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Validade</label>
                  <input type="text" value={cardExpiry} onChange={(e) => setCardExpiry(formatExpiry(e.target.value))} placeholder="MM/AA" maxLength={5} className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CVV</label>
                  <input type="text" value={cardCvv} onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="123" maxLength={4} className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                </div>
              </div>
            </div>
            <div className="flex justify-between mt-8">
              <button onClick={() => setStep(2)} className="text-gray-500 hover:text-blue-600 flex items-center gap-1">
                <FiArrowLeft /> Voltar
              </button>
              <button onClick={() => validateStep3() && setStep(4)} className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold px-8 py-3 rounded-xl hover:bg-blue-700 transition">
                Revisar <FiArrowRight />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Resumo + Confirmação */}
        {step === 4 && (
          <div className="max-w-lg mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Confirme sua assinatura</h2>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
              <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                <div>
                  <p className="font-bold text-gray-900">Plano {selectedPlanData?.name}</p>
                  <p className="text-sm text-gray-500">{selectedPlanData?.employees}</p>
                </div>
                <p className="text-2xl font-extrabold text-gray-900">R${selectedPlanData?.price}<span className="text-sm font-normal text-gray-500">/mês</span></p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Empresa</span>
                  <span className="text-gray-800 font-medium">{companyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Administrador</span>
                  <span className="text-gray-800 font-medium">{name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">E-mail</span>
                  <span className="text-gray-800 font-medium">{email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Cartão</span>
                  <span className="text-gray-800 font-medium">
                    {cardBrand?.toUpperCase()} •••• {cardNumber.replace(/\s/g, '').slice(-4)}
                  </span>
                </div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mt-4">
                <div className="flex items-start gap-3">
                  <FiShield className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-green-800 text-sm">30 dias grátis</p>
                    <p className="text-green-700 text-xs mt-1">
                      Você não será cobrado agora. A primeira cobrança de R${selectedPlanData?.price} será em{' '}
                      <strong>{firstChargeDate.toLocaleDateString('pt-BR')}</strong>. Cancele a qualquer momento.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-between mt-8">
              <button onClick={() => setStep(3)} className="text-gray-500 hover:text-blue-600 flex items-center gap-1">
                <FiArrowLeft /> Voltar
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold px-8 py-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                    Processando...
                  </>
                ) : (
                  <>
                    <FiCreditCard /> Ativar 30 dias grátis
                  </>
                )}
              </button>
            </div>

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-6 mt-8 text-gray-400 text-xs">
              <div className="flex items-center gap-1">
                <FiLock className="w-4 h-4" /> Criptografia SSL
              </div>
              <div className="flex items-center gap-1">
                <FiShield className="w-4 h-4" /> Mercado Pago
              </div>
              <div className="flex items-center gap-1">
                <FiCreditCard className="w-4 h-4" /> PCI Compliant
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
