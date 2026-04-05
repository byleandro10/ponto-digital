import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  FiArrowLeft,
  FiArrowRight,
  FiCheck,
  FiClock,
  FiCreditCard,
  FiLock,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { PLANS, getPlan, planKeyFromSlug } from '../utils/billing';

function PlanCard({ plan, selectedPlan, onSelect }) {
  const selected = selectedPlan === plan.key;

  return (
    <button
      type="button"
      onClick={() => onSelect(plan.key)}
      className={`relative rounded-3xl border p-6 text-left transition ${
        selected
          ? 'border-blue-600 bg-blue-50 shadow-lg shadow-blue-100'
          : 'border-gray-200 bg-white hover:border-blue-200 hover:shadow-sm'
      }`}
    >
      {plan.popular && (
        <span className="absolute right-5 top-5 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
          Mais escolhido
        </span>
      )}

      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
          <p className="mt-1 text-sm text-slate-500">{plan.employees}</p>
        </div>
        <div className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 text-transparent'}`}>
          <FiCheck className="h-3.5 w-3.5" />
        </div>
      </div>

      <div className="mb-5">
        <span className="text-4xl font-extrabold tracking-tight text-slate-900">R${plan.price}</span>
        <span className="ml-1 text-sm text-slate-500">/mês</span>
      </div>

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

export default function Checkout() {
  const { plan: planSlug } = useParams();
  const { register } = useAuth();

  const [step, setStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState(planKeyFromSlug(planSlug, 'PROFESSIONAL'));
  const [companyName, setCompanyName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const plan = useMemo(() => getPlan(selectedPlan), [selectedPlan]);

  function validateAccountStep() {
    if (!companyName || companyName.trim().length < 3) {
      toast.error('Informe o nome da empresa com pelo menos 3 caracteres.');
      return false;
    }

    if (!cnpj || cnpj.replace(/\D/g, '').length !== 14) {
      toast.error('Informe um CNPJ válido com 14 dígitos.');
      return false;
    }

    if (!name || name.trim().length < 3) {
      toast.error('Informe seu nome completo.');
      return false;
    }

    if (!email || !email.includes('@')) {
      toast.error('Informe um e-mail válido.');
      return false;
    }

    if (!password || password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      toast.error('A senha precisa ter pelo menos 8 caracteres, com letra maiúscula, minúscula e número.');
      return false;
    }

    return true;
  }

  async function handleSubmit() {
    if (!validateAccountStep()) {
      setStep(2);
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
        plan: plan.slug,
      });

      const { data } = await api.post('/billing/checkout-session', { plan: selectedPlan });

      if (!data.checkoutUrl) {
        throw new Error('O checkout da Stripe não retornou uma URL válida.');
      }

      window.location.href = data.checkoutUrl;
    } catch (error) {
      const apiError = error.response?.data?.error;

      if (apiError) {
        toast.error(apiError);
      } else {
        toast.error('Não foi possível iniciar o pagamento agora. Você poderá tentar novamente na tela de assinatura.');
      }

      if (localStorage.getItem('token')) {
        window.location.href = '/admin/subscription';
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_35%),linear-gradient(180deg,#f8fbff_0%,#ffffff_55%,#f8fafc_100%)]">
      <header className="border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold text-blue-600">
            <FiClock className="h-7 w-7" />
            PontoDigital
          </Link>

          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-blue-600">
            <FiArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-10 flex items-center justify-center gap-2">
          {[1, 2, 3].map((item) => (
            <div key={item} className="flex items-center gap-2">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${step >= item ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {step > item ? <FiCheck className="h-4 w-4" /> : item}
              </div>
              {item < 3 && <div className={`h-0.5 w-14 ${step > item ? 'bg-blue-600' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <section>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-600">Assinatura SaaS</p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-slate-900">
                Escolha o plano ideal para sua empresa
              </h1>
              <p className="mt-4 text-lg text-slate-600">
                Você começa com 30 dias grátis e conclui o pagamento em um checkout seguro da Stripe.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              {Object.values(PLANS).map((entry) => (
                <PlanCard key={entry.key} plan={entry} selectedPlan={selectedPlan} onSelect={setSelectedPlan} />
              ))}
            </div>

            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-8 py-3 font-semibold text-white transition hover:bg-blue-700"
              >
                Continuar
                <FiArrowRight />
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="mx-auto max-w-2xl rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">Dados da conta</p>
              <h2 className="mt-3 text-3xl font-bold text-slate-900">Crie seu acesso administrativo</h2>
              <p className="mt-3 text-slate-600">
                Depois do cadastro, você será redirecionado para concluir a assinatura na Stripe.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Nome da empresa</label>
                <input
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="Empresa Exemplo Ltda"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">CNPJ</label>
                <input
                  value={cnpj}
                  onChange={(event) => setCnpj(event.target.value)}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Seu nome</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="João Silva"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">E-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="joao@empresa.com"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="No mínimo 8 caracteres"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-blue-600"
              >
                <FiArrowLeft className="h-4 w-4" />
                Voltar
              </button>

              <button
                type="button"
                onClick={() => validateAccountStep() && setStep(3)}
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-8 py-3 font-semibold text-white transition hover:bg-blue-700"
              >
                Revisar
                <FiArrowRight />
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="mx-auto max-w-3xl rounded-[30px] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">Resumo</p>
              <h2 className="mt-3 text-3xl font-bold text-slate-900">Você está a um passo de ativar sua conta</h2>
              <p className="mt-3 text-slate-600">
                O pagamento será concluído em uma página segura da Stripe. Seu teste de 30 dias começa após a confirmação da assinatura.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-5">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Plano selecionado</p>
                    <h3 className="mt-1 text-2xl font-bold text-slate-900">{plan.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{plan.employees}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-extrabold text-slate-900">R${plan.price}</p>
                    <p className="text-sm text-slate-500">por mês</p>
                  </div>
                </div>

                <div className="mt-5 space-y-3 text-sm text-slate-600">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2">
                      <FiCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6">
                <div>
                  <p className="text-sm font-medium text-slate-500">Empresa</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">{companyName}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-500">CNPJ</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">{cnpj}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-500">Administrador</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">{name}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-500">E-mail</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">{email}</p>
                </div>

                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                  <div className="flex items-start gap-3">
                    <FiLock className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div>
                      <p className="font-semibold text-emerald-900">Checkout seguro hospedado pela Stripe</p>
                      <p className="mt-1 text-sm text-emerald-700">
                        Cartão, autenticação e gestão de cobrança acontecem direto na Stripe.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <div className="flex items-start gap-3">
                    <FiCreditCard className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                    <div>
                      <p className="font-semibold text-blue-900">30 dias grátis</p>
                      <p className="mt-1 text-sm text-blue-700">
                        A cobrança começa automaticamente ao fim do período de teste.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-blue-600"
              >
                <FiArrowLeft className="h-4 w-4" />
                Voltar
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-8 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Redirecionando...' : 'Ir para pagamento seguro'}
                {!loading && <FiArrowRight />}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
