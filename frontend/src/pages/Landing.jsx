import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FiClock, FiMapPin, FiShield, FiSmartphone, FiBarChart2, FiBell, FiCheck, FiChevronDown, FiChevronUp, FiMenu, FiX, FiStar, FiUsers, FiDollarSign, FiArrowRight, FiZap, FiLock, FiFileText } from 'react-icons/fi';

/* ──────────── dados estáticos ──────────── */
const features = [
  { icon: FiSmartphone, title: 'Ponto pelo Celular', desc: 'Funcionário bate ponto de qualquer lugar com GPS automático. Funciona offline.' },
  { icon: FiMapPin, title: 'Geolocalização', desc: 'Registra latitude e longitude no momento do ponto. Cerca virtual disponível.' },
  { icon: FiShield, title: 'Anti-Fraude', desc: 'Selfie obrigatória no momento do ponto para garantir autenticidade.' },
  { icon: FiBarChart2, title: 'Relatórios Automáticos', desc: 'Espelho de ponto, horas extras, banco de horas. Exporta PDF e Excel.' },
  { icon: FiBell, title: 'Notificações', desc: 'Lembrete para bater ponto, alertas de ponto faltante e relatório semanal.' },
  { icon: FiFileText, title: 'Exportação Contábil', desc: 'Gere espelho de ponto, folha consolidada em PDF, Excel ou CSV.' },
];

const plans = [
  { name: 'Básico', price: 49, period: '/mês', employees: 'Até 10 funcionários', features: ['Ponto digital com GPS', 'Dashboard em tempo real', 'Relatório mensal', 'Suporte por e-mail', 'PWA (funciona offline)'], cta: 'Começar Grátis', highlight: false },
  { name: 'Profissional', price: 99, period: '/mês', employees: 'Até 30 funcionários', features: ['Tudo do Básico', 'Selfie anti-fraude', 'Cerca virtual (geofencing)', 'Exportação PDF/Excel', 'Banco de horas', 'Suporte prioritário'], cta: 'Teste Grátis 14 dias', highlight: true },
  { name: 'Empresarial', price: 199, period: '/mês', employees: 'Funcionários ilimitados', features: ['Tudo do Profissional', 'API de integração', 'Multi-filiais', 'Relatórios avançados', 'Gerente de conta dedicado', 'SLA 99.9%'], cta: 'Falar com Vendas', highlight: false },
];

const testimonials = [
  { name: 'Carlos Oliveira', role: 'Dono de Restaurante', text: 'Antes usava caderno de ponto. Agora tudo digital, nunca mais tive problema com a contabilidade.', stars: 5 },
  { name: 'Ana Martins', role: 'Gerente de Obra', text: 'Perfeito para equipes externas. Consigo ver quem chegou na obra mesmo sem estar lá.', stars: 5 },
  { name: 'Roberto Lima', role: 'Contador', text: 'O espelho de ponto em PDF é exatamente o que eu precisava. Exporto e pronto.', stars: 5 },
];

const faqs = [
  { q: 'Preciso instalar algum aplicativo?', a: 'Não. O Ponto Digital é um PWA (Progressive Web App). Basta acessar pelo navegador do celular e adicionar à tela inicial. Funciona como um app nativo, inclusive offline.' },
  { q: 'Como funciona o período de teste?', a: 'Você tem 14 dias grátis no plano Profissional com todas as funcionalidades. Não pedimos cartão de crédito. Se gostar, assina. Se não, sem compromisso.' },
  { q: 'E se o funcionário estiver sem internet?', a: 'O sistema funciona offline. O ponto é registrado localmente e sincronizado automaticamente quando a conexão voltar.' },
  { q: 'Posso exportar para meu contador?', a: 'Sim! Exportamos espelho de ponto individual e consolidado em PDF, Excel (.xlsx) e CSV, compatível com os principais sistemas contábeis.' },
  { q: 'Como funciona a cobrança?', a: 'Planos mensais via Pix, boleto ou cartão. Você pode trocar de plano ou cancelar a qualquer momento, sem multa.' },
  { q: 'O sistema é seguro?', a: 'Sim. Usamos criptografia em todas as conexões (HTTPS), senhas com hash bcrypt, tokens JWT e rate-limiting contra ataques.' },
];

/* ──────────── componentes auxiliares ──────────── */
function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-200 last:border-0">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-5 text-left group">
        <span className="text-gray-800 font-medium group-hover:text-blue-600 transition pr-4">{q}</span>
        {open ? <FiChevronUp className="text-blue-600 flex-shrink-0" /> : <FiChevronDown className="text-gray-400 flex-shrink-0" />}
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-40 pb-5' : 'max-h-0'}`}>
        <p className="text-gray-600 text-sm leading-relaxed">{a}</p>
      </div>
    </div>
  );
}

function CountUp({ end, suffix = '' }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        let start = 0;
        const step = Math.ceil(end / 40);
        const id = setInterval(() => { start += step; if (start >= end) { setCount(end); clearInterval(id); } else setCount(start); }, 30);
        obs.disconnect();
      }
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [end]);
  return <span ref={ref}>{count.toLocaleString('pt-BR')}{suffix}</span>;
}

/* ──────────── página principal ──────────── */
export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-gray-800 font-sans">
      {/* ── NAV ── */}
      <nav className="fixed top-0 inset-x-0 bg-white/90 backdrop-blur-md border-b border-gray-100 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold text-blue-600">
            <FiClock className="w-7 h-7" /> PontoDigital
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            <a href="#features" className="hover:text-blue-600 transition">Funcionalidades</a>
            <a href="#pricing" className="hover:text-blue-600 transition">Planos</a>
            <a href="#testimonials" className="hover:text-blue-600 transition">Depoimentos</a>
            <a href="#faq" className="hover:text-blue-600 transition">FAQ</a>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-gray-600 hover:text-blue-600 transition">Entrar</Link>
            <Link to="/register" className="text-sm font-medium bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition shadow-sm">Teste Grátis</Link>
          </div>
          <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden text-gray-600">
            {menuOpen ? <FiX className="w-6 h-6" /> : <FiMenu className="w-6 h-6" />}
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-6 py-4 space-y-3">
            <a href="#features" onClick={() => setMenuOpen(false)} className="block text-gray-600 hover:text-blue-600">Funcionalidades</a>
            <a href="#pricing" onClick={() => setMenuOpen(false)} className="block text-gray-600 hover:text-blue-600">Planos</a>
            <a href="#testimonials" onClick={() => setMenuOpen(false)} className="block text-gray-600 hover:text-blue-600">Depoimentos</a>
            <a href="#faq" onClick={() => setMenuOpen(false)} className="block text-gray-600 hover:text-blue-600">FAQ</a>
            <hr className="border-gray-200" />
            <Link to="/login" className="block text-gray-600">Entrar</Link>
            <Link to="/register" className="block text-center bg-blue-600 text-white py-2.5 rounded-lg">Teste Grátis</Link>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section className="pt-28 pb-20 md:pt-36 md:pb-28 px-6 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 text-center md:text-left">
            <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full mb-6">
              <FiZap className="w-3 h-3" /> 14 dias grátis — sem cartão de crédito
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight text-gray-900">
              Controle de ponto <span className="text-blue-600">digital</span> para sua empresa
            </h1>
            <p className="mt-6 text-lg text-gray-600 max-w-xl">
              Funcionário bate ponto pelo celular com GPS. Relatório mensal automático para contabilidade. Funciona offline.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
              <Link to="/register" className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold px-8 py-4 rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-200 text-lg">
                Começar Grátis <FiArrowRight />
              </Link>
              <a href="#pricing" className="inline-flex items-center justify-center gap-2 border-2 border-gray-300 text-gray-700 font-semibold px-8 py-4 rounded-xl hover:border-blue-400 hover:text-blue-600 transition text-lg">
                Ver Planos
              </a>
            </div>
            <p className="mt-4 text-sm text-gray-400">A partir de R$ 49/mês • Cancele quando quiser</p>
          </div>
          {/* Ilustração hero — mockup de celular */}
          <div className="flex-1 flex justify-center">
            <div className="w-72 h-[500px] bg-gray-900 rounded-[2.5rem] p-3 shadow-2xl relative">
              <div className="w-full h-full bg-gradient-to-br from-slate-50 to-blue-50 rounded-[2rem] overflow-hidden flex flex-col">
                {/* Notch */}
                <div className="flex justify-center pt-2 pb-3">
                  <div className="w-24 h-5 bg-gray-900 rounded-full" />
                </div>
                {/* App content mock */}
                <div className="flex-1 px-5 pb-5">
                  <div className="text-center mb-4">
                    <p className="text-xs text-gray-400">sábado, 01 de março de 2026</p>
                    <p className="text-4xl font-bold text-gray-800 font-mono mt-1">09:00:00</p>
                    <div className="flex items-center justify-center gap-1 mt-2 text-xs text-green-600">
                      <FiMapPin className="w-3 h-3" /> Localização capturada
                    </div>
                  </div>
                  <div className="flex justify-center my-4">
                    <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center shadow-lg">
                      <div className="text-white text-center">
                        <FiClock className="w-6 h-6 mx-auto" />
                        <p className="text-[10px] mt-1 font-bold">BATER PONTO</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 mt-4">
                    {[{ label: 'Entrada', time: '08:02', color: 'bg-green-100 text-green-700' }, { label: 'Almoço', time: '12:01', color: 'bg-yellow-100 text-yellow-700' }, { label: 'Volta', time: '13:05', color: 'bg-blue-100 text-blue-700' }].map((e, i) => (
                      <div key={i} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg shadow-sm">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${e.color}`}>{e.label}</span>
                        <span className="text-sm font-mono font-bold text-gray-700">{e.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section className="bg-blue-600 py-10">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center text-white px-6">
          {[
            { value: 500, suffix: '+', label: 'Empresas ativas' },
            { value: 8000, suffix: '+', label: 'Funcionários' },
            { value: 99, suffix: '%', label: 'Uptime' },
            { value: 4, suffix: '.8', label: 'Avaliação' },
          ].map((s, i) => (
            <div key={i}>
              <p className="text-3xl md:text-4xl font-extrabold"><CountUp end={s.value} suffix={s.suffix} /></p>
              <p className="text-blue-200 text-sm mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Tudo que você precisa para gerenciar o ponto</h2>
            <p className="text-gray-500 mt-3 max-w-2xl mx-auto">Solução completa para empresas pequenas, obras, equipes externas e escritórios.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((f, i) => (
              <div key={i} className="group bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-lg hover:border-blue-200 transition-all duration-300">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-600 transition-colors duration-300">
                  <f.icon className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors duration-300" />
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Planos simples e transparentes</h2>
            <p className="text-gray-500 mt-3">14 dias grátis em todos os planos. Sem cartão de crédito.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            {plans.map((p, i) => (
              <div key={i} className={`relative rounded-2xl p-8 flex flex-col ${p.highlight ? 'bg-blue-600 text-white shadow-xl scale-[1.02]' : 'bg-white border border-gray-200 shadow-sm'}`}>
                {p.highlight && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-400 text-gray-900 text-xs font-bold px-4 py-1 rounded-full">MAIS POPULAR</div>}
                <h3 className={`text-xl font-bold ${p.highlight ? 'text-white' : 'text-gray-800'}`}>{p.name}</h3>
                <p className={`text-sm mt-1 ${p.highlight ? 'text-blue-200' : 'text-gray-500'}`}>{p.employees}</p>
                <div className="mt-6 mb-6">
                  <span className="text-4xl font-extrabold">R${p.price}</span>
                  <span className={`text-sm ${p.highlight ? 'text-blue-200' : 'text-gray-500'}`}>{p.period}</span>
                </div>
                <ul className="space-y-3 flex-1">
                  {p.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm">
                      <FiCheck className={`w-4 h-4 mt-0.5 flex-shrink-0 ${p.highlight ? 'text-blue-200' : 'text-green-500'}`} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/register" className={`mt-8 block text-center font-semibold py-3 rounded-xl transition ${p.highlight ? 'bg-white text-blue-600 hover:bg-blue-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-gray-400 text-sm mt-8">Ou pague <strong>R$ 5/funcionário/mês</strong> (mínimo R$ 25). <a href="#faq" className="text-blue-500 underline">Saiba mais</a></p>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section id="testimonials" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">O que nossos clientes dizem</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                <div className="flex gap-1 text-yellow-400 mb-4">
                  {[...Array(t.stars)].map((_, j) => <FiStar key={j} className="w-4 h-4 fill-current" />)}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed mb-4">"{t.text}"</p>
                <div>
                  <p className="font-bold text-gray-800 text-sm">{t.name}</p>
                  <p className="text-gray-400 text-xs">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-20 px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Perguntas Frequentes</h2>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            {faqs.map((f, i) => <FaqItem key={i} q={f.q} a={f.a} />)}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-20 px-6 bg-blue-600 text-white text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Pronto para modernizar o ponto da sua empresa?</h2>
          <p className="text-blue-200 mb-8 text-lg">Comece agora com 14 dias grátis. Sem cartão de crédito.</p>
          <Link to="/register" className="inline-flex items-center gap-2 bg-white text-blue-600 font-bold px-10 py-4 rounded-xl hover:bg-blue-50 transition text-lg shadow-lg">
            Criar Conta Grátis <FiArrowRight />
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <Link to="/" className="flex items-center gap-2 text-white font-bold text-lg mb-3">
              <FiClock /> PontoDigital
            </Link>
            <p className="text-sm">Sistema de ponto digital para pequenas empresas, obras e equipes externas.</p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3">Produto</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#features" className="hover:text-white transition">Funcionalidades</a></li>
              <li><a href="#pricing" className="hover:text-white transition">Planos</a></li>
              <li><a href="#faq" className="hover:text-white transition">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white transition">Termos de Uso</a></li>
              <li><a href="#" className="hover:text-white transition">Política de Privacidade</a></li>
              <li><a href="#" className="hover:text-white transition">LGPD</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3">Contato</h4>
            <ul className="space-y-2 text-sm">
              <li>contato@pontodigital.com.br</li>
              <li>(11) 99999-9999</li>
            </ul>
          </div>
        </div>
        <div className="max-w-6xl mx-auto border-t border-gray-800 mt-10 pt-6 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} PontoDigital. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
