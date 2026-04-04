import { useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FiClock, FiCheck, FiArrowLeft, FiArrowRight, FiLock, FiShield, FiCreditCard } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useStripeCardSetup } from '../hooks/useStripeCardSetup';

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
    features: ['Tudo do Básico', 'Selfie antifraude', 'Cerca virtual', 'Exportação PDF, Excel e CSV', 'Banco de horas', 'Suporte prioritário'],
    popular: true,
  },
  enterprise: {
    key: 'ENTERPRISE',
    name: 'Empresarial',
    price: 199,
    employees: 'Funcionários ilimitados',
    features: ['Tudo do Profissional', 'API de integração', 'Multiunidades', 'Relatórios avançados', 'Gerente de conta dedicado', 'SLA de 99,9%'],
  },
};

function PlanCard({ plan, selected, onSelect }) {
  const isSelected = selected === plan.key;
  return (
    <button
      type="button"
      onClick={() => onSelect(plan.key)}
      className={`relative rounded-2xl p-6 text-left transition-all border-2 ${isSelected ? 'border-blue-600 bg-blue-50 shadow-lg' : 'border-gray-200 bg-white hover:border-blue-300'}`}
    >
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-900 text-xs font-bold px-3 py-1 rounded-full">
          MAIS ESCOLHIDO
        </div>
      )}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-gray-800">{plan.name}</h3>
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}>
          {isSelected && <FiCheck className="w-3 h-3 text-white" />}
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-3">{plan.employees}</p>
      <div className="mb-4">
        <span className="text-3xl font-extrabold text-gray-900">R${plan.price}</span>
        <span className="text-gray-500 text-sm">/mês</span>
      </div>
      <ul className="space-y-2">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-gray-600">
            <FiCheck className="w-4 h-4 mt-0.5 text-green-500 flex-shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}

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

export default function Checkout() {
  const { register } = useAuth();
  const { plan: urlPlan } = useParams();
  const [step, setStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState(urlPlan && PLANS[urlPlan] ? PLANS[urlPlan].key : 'PROFESSIONAL');
  const [companyName, setCompanyName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedPlanData = useMemo(
    () => Object.values(PLANS).find((item) => item.key === selectedPlan),
    [selectedPlan]
  );

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
    enabled: step >= 3,
    email,
  });

  const validateAccountStep = () => {
    if (!companyName || companyName.length < 3) {
      toast.error('Informe o nome da empresa com pelo menos 3 caracteres.');
      return false;
    }
    if (!cnpj || cnpj.replace(/\D/g, '').length !== 14) {
      toast.error('Informe um CNPJ válido com 14 dígitos.');
      return false;
    }
    if (!name || name.length < 3) {
      toast.error('Informe seu nome completo.');
      return false;
    }
    if (!email || !email.includes('@')) {
      toast.error('Informe um e-mail válido.');
      return false;
    }
    if (!password || password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      toast.error('A senha deve ter pelo menos 8 caracteres, com letra maiúscula, letra minúscula e número.');
      return false;
    }
    return true;
  };

  const validateCardStep = () => {
    if (!cardHolder || cardHolder.length < 3) {
      toast.error('Informe o nome do titular do cartão.');
      return false;
    }
    if (stripeLoadError) {
      toast.error(stripeLoadError);
      return false;
    }
    if (cardError) {
      toast.error(cardError);
      return false;
    }
    if (!cardComplete || !stripeReady) {
      toast.error('Preencha número, validade e código de segurança para continuar.');
      return false;
    }
    return true;
  };

  const handleSubmit = useCallback(async () => {
    if (!validateCardStep()) {
      return;
    }

    setLoading(true);

    try {
      const { paymentMethodId, setupIntentId } = await confirmCardSetup({
        cardHolder,
      });

      await register({
        companyName,
        cnpj,
        name,
        email,
        password,
        plan: selectedPlan.toLowerCase(),
        paymentMethodId,
        setupIntentId,
      });

      toast.success('Conta criada com sucesso e cartão validado com segurança.');
      window.location.href = '/admin/dashboard';
    } catch (error) {
      toast.error(error.response?.data?.error || error.message || 'Não foi possível concluir seu cadastro.');
    } finally {
      setLoading(false);
    }
  }, [cardHolder, cnpj, companyName, confirmCardSetup, email, name, password, register, selectedPlan]);

  const firstChargeDate = new Date();
  firstChargeDate.setDate(firstChargeDate.getDate() + 30);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
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
        <div className="flex items-center justify-center gap-2 mb-10">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step >= item ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {step > item ? <FiCheck className="w-4 h-4" /> : item}
              </div>
              {item < 4 && <div className={`w-12 h-0.5 ${step > item ? 'bg-blue-600' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Escolha seu plano</h2>
            <p className="text-gray-500 text-center mb-8">30 dias grátis em todos os planos, com cobrança recorrente e segura pela Stripe.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Object.values(PLANS).map((plan) => (
                <PlanCard key={plan.key} plan={plan} selected={selectedPlan} onSelect={setSelectedPlan} />
              ))}
            </div>
            <div className="flex justify-center mt-8">
              <button onClick={() => setStep(2)} className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold px-8 py-3 rounded-xl hover:bg-blue-700 transition">
                Continuar <FiArrowRight />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="max-w-lg mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Dados da empresa</h2>
            <p className="text-gray-500 text-center mb-8">Esses dados criam sua conta administrativa.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da empresa</label>
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Empresa Exemplo Ltda" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" maxLength={18} className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Seu nome</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="João Silva" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="joao@empresa.com" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="No mínimo 8 caracteres, com maiúscula, minúscula e número" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
            </div>
            <div className="flex justify-between mt-8">
              <button onClick={() => setStep(1)} className="text-gray-500 hover:text-blue-600 flex items-center gap-1">
                <FiArrowLeft /> Voltar
              </button>
              <button onClick={() => validateAccountStep() && setStep(3)} className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold px-8 py-3 rounded-xl hover:bg-blue-700 transition">
                Continuar <FiArrowRight />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Cartão de crédito</h2>
            <p className="text-gray-500 text-center mb-2">
              Seus dados de pagamento são enviados diretamente para a Stripe. Seu servidor não recebe número do cartão, validade nem código de segurança.
            </p>
            <div className="flex items-center justify-center gap-2 mb-8">
              <FiLock className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-700 font-medium">Ambiente seguro com tokenização Stripe e suporte a 3D Secure</span>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome do titular</label>
                  <input value={cardHolder} onChange={(e) => setCardHolder(e.target.value)} placeholder="Nome como está no cartão" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                </div>
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                  <p className="text-sm font-semibold text-blue-900">Primeira cobrança</p>
                  <p className="text-sm text-blue-700 mt-1">
                    O trial começa agora e a primeira cobrança prevista será em <strong>{firstChargeDate.toLocaleDateString('pt-BR')}</strong>.
                  </p>
                </div>
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
                <p className="mt-4 text-sm text-gray-500">Carregando o formulário seguro de pagamento...</p>
              )}

              {stripeLoadError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {stripeLoadError}
                </div>
              )}

              {!stripeLoading && !stripeLoadError && (
                <div className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <FiShield className="text-slate-500" />
                    <span>Criptografia, tokenização e autenticação protegidas pela Stripe.</span>
                  </div>
                  <button type="button" onClick={mount} className="text-blue-600 hover:text-blue-800 font-medium">
                    Recarregar campos
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-between mt-8">
              <button onClick={() => setStep(2)} className="text-gray-500 hover:text-blue-600 flex items-center gap-1">
                <FiArrowLeft /> Voltar
              </button>
              <button onClick={() => validateCardStep() && setStep(4)} className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold px-8 py-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-50" disabled={stripeLoading}>
                Revisar <FiArrowRight />
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="max-w-xl mx-auto">
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
                <div className="flex justify-between gap-4"><span className="text-gray-500">Empresa</span><span className="text-gray-800 font-medium text-right">{companyName}</span></div>
                <div className="flex justify-between gap-4"><span className="text-gray-500">Administrador</span><span className="text-gray-800 font-medium text-right">{name}</span></div>
                <div className="flex justify-between gap-4"><span className="text-gray-500">E-mail</span><span className="text-gray-800 font-medium text-right">{email}</span></div>
                <div className="flex justify-between gap-4"><span className="text-gray-500">Titular do cartão</span><span className="text-gray-800 font-medium text-right">{cardHolder}</span></div>
              </div>

              <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                <div className="flex items-start gap-3">
                  <FiCreditCard className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-green-800 text-sm">Pagamento pronto para cobrança futura</p>
                    <p className="text-green-700 text-xs mt-1">
                      Seu cartão será validado pela Stripe agora e ficará preparado para cobrança automática após o período de trial.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between mt-8">
              <button onClick={() => setStep(3)} className="text-gray-500 hover:text-blue-600 flex items-center gap-1">
                <FiArrowLeft /> Voltar
              </button>
              <button disabled={loading || stripeLoading || !stripeReady} onClick={handleSubmit} className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold px-8 py-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-50">
                {loading ? 'Finalizando...' : <><FiCreditCard /> Ativar 30 dias grátis</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
