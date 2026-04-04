import { useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FiClock, FiCheck, FiArrowLeft, FiArrowRight, FiLock, FiShield, FiExternalLink } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const PLANS = {
  basic: {
    key: 'BASIC',
    name: 'Basico',
    price: 49,
    employees: 'Ate 15 funcionarios',
    features: ['Ponto digital com GPS', 'Dashboard em tempo real', 'Relatorio mensal', 'Suporte por e-mail', 'PWA (funciona offline)'],
  },
  professional: {
    key: 'PROFESSIONAL',
    name: 'Profissional',
    price: 99,
    employees: 'Ate 50 funcionarios',
    features: ['Tudo do Basico', 'Selfie antifraude', 'Cerca virtual', 'Exportacao PDF/Excel/CSV', 'Banco de horas', 'Suporte prioritario'],
    popular: true,
  },
  enterprise: {
    key: 'ENTERPRISE',
    name: 'Empresarial',
    price: 199,
    employees: 'Funcionarios ilimitados',
    features: ['Tudo do Profissional', 'API de integracao', 'Multiunidades', 'Relatorios avancados', 'Gerente de conta dedicado', 'SLA 99,9%'],
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
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-400 text-gray-900 text-xs font-bold px-3 py-1 rounded-full">
          MAIS POPULAR
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
        <span className="text-gray-500 text-sm">/mes</span>
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
  const [loading, setLoading] = useState(false);

  const selectedPlanData = useMemo(
    () => Object.values(PLANS).find((item) => item.key === selectedPlan),
    [selectedPlan]
  );

  const validateAccountStep = () => {
    if (!companyName || companyName.length < 3) {
      toast.error('O nome da empresa deve ter pelo menos 3 caracteres.');
      return false;
    }
    if (!cnpj || cnpj.replace(/\D/g, '').length !== 14) {
      toast.error('O CNPJ deve ter 14 digitos.');
      return false;
    }
    if (!name || name.length < 3) {
      toast.error('O nome deve ter pelo menos 3 caracteres.');
      return false;
    }
    if (!email || !email.includes('@')) {
      toast.error('Informe um e-mail valido.');
      return false;
    }
    if (!password || password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      toast.error('A senha deve ter pelo menos 8 caracteres, com 1 letra maiuscula, 1 letra minuscula e 1 numero.');
      return false;
    }
    return true;
  };

  const handleCheckoutRedirect = useCallback(async () => {
    if (!validateAccountStep()) {
      return;
    }

    setLoading(true);

    try {
      await register({
        companyName,
        cnpj,
        name,
        email,
        password,
        plan: selectedPlan.toLowerCase(),
      });

      const sessionRes = await api.post('/subscriptions/checkout-session', {
        plan: selectedPlan,
      });

      const checkoutUrl = sessionRes.data?.url;
      if (!checkoutUrl) {
        throw new Error('A Stripe nao retornou a URL do checkout.');
      }

      window.location.href = checkoutUrl;
    } catch (error) {
      toast.error(error.response?.data?.error || error.message || 'Nao foi possivel iniciar o checkout seguro.');
      setLoading(false);
    }
  }, [register, companyName, cnpj, name, email, password, selectedPlan]);

  const firstChargeDate = new Date();
  firstChargeDate.setDate(firstChargeDate.getDate() + 30);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
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
          {[1, 2, 3].map((item) => (
            <div key={item} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step >= item ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {step > item ? <FiCheck className="w-4 h-4" /> : item}
              </div>
              {item < 3 && <div className={`w-12 h-0.5 ${step > item ? 'bg-blue-600' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Escolha seu plano</h2>
            <p className="text-gray-500 text-center mb-8">A Stripe vai coletar o cartao em um checkout hospedado e seguro.</p>
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
            <p className="text-gray-500 text-center mb-8">Essas informacoes criam sua conta antes do checkout seguro da Stripe.</p>
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
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Joao Silva" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="joao@empresa.com" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimo de 8 caracteres, com maiuscula, minuscula e numero" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
              </div>
            </div>
            <div className="flex justify-between mt-8">
              <button onClick={() => setStep(1)} className="text-gray-500 hover:text-blue-600 flex items-center gap-1">
                <FiArrowLeft /> Voltar
              </button>
              <button onClick={() => validateAccountStep() && setStep(3)} className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold px-8 py-3 rounded-xl hover:bg-blue-700 transition">
                Revisar <FiArrowRight />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="max-w-xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-3">Checkout seguro da Stripe</h2>
            <p className="text-gray-500 text-center mb-8">
              O cartao sera informado na pagina oficial hospedada pela Stripe. O campo embutido foi removido para garantir mais estabilidade e menos falhas.
            </p>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
              <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                <div>
                  <p className="font-bold text-gray-900">Plano {selectedPlanData?.name}</p>
                  <p className="text-sm text-gray-500">{selectedPlanData?.employees}</p>
                </div>
                <p className="text-2xl font-extrabold text-gray-900">
                  R${selectedPlanData?.price}
                  <span className="text-sm font-normal text-gray-500">/mes</span>
                </p>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-4"><span className="text-gray-500">Empresa</span><span className="text-gray-800 font-medium text-right">{companyName}</span></div>
                <div className="flex justify-between gap-4"><span className="text-gray-500">Administrador</span><span className="text-gray-800 font-medium text-right">{name}</span></div>
                <div className="flex justify-between gap-4"><span className="text-gray-500">E-mail</span><span className="text-gray-800 font-medium text-right">{email}</span></div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <FiLock className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-blue-800 text-sm">Cartao direto na Stripe</p>
                      <p className="text-blue-700 text-xs mt-1">Numero, validade, CVC e autenticacao 3DS acontecem fora do app, no checkout oficial da Stripe.</p>
                    </div>
                  </div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <FiShield className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-green-800 text-sm">30 dias gratis</p>
                      <p className="text-green-700 text-xs mt-1">A primeira cobranca prevista sera em <strong>{firstChargeDate.toLocaleDateString('pt-BR')}</strong>, se o trial seguir ativo.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-sm text-gray-600">
                Ao continuar, sua conta sera criada e voce sera redirecionado para o checkout seguro da Stripe para cadastrar o cartao.
              </div>
            </div>

            <div className="flex justify-between mt-8">
              <button onClick={() => setStep(2)} className="text-gray-500 hover:text-blue-600 flex items-center gap-1">
                <FiArrowLeft /> Voltar
              </button>
              <button
                disabled={loading}
                onClick={handleCheckoutRedirect}
                className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold px-8 py-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
              >
                {loading ? 'Abrindo checkout...' : <><FiExternalLink /> Ir para checkout seguro</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
