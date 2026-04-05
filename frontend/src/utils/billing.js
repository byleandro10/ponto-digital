export const PLANS = {
  BASIC: {
    key: 'BASIC',
    slug: 'basic',
    name: 'Básico',
    price: 49,
    employees: 'Até 15 funcionários',
    features: [
      'Registro de ponto com GPS',
      'Painel em tempo real',
      'Relatórios essenciais',
      'Suporte por e-mail',
    ],
  },
  PROFESSIONAL: {
    key: 'PROFESSIONAL',
    slug: 'professional',
    name: 'Profissional',
    price: 99,
    employees: 'Até 50 funcionários',
    features: [
      'Tudo do plano Básico',
      'Cerca virtual',
      'Banco de horas',
      'Relatórios avançados',
      'Suporte prioritário',
    ],
    popular: true,
  },
  ENTERPRISE: {
    key: 'ENTERPRISE',
    slug: 'enterprise',
    name: 'Empresarial',
    price: 199,
    employees: 'Funcionários ilimitados',
    features: [
      'Tudo do plano Profissional',
      'Múltiplas unidades',
      'API e integrações',
      'Atendimento prioritário',
    ],
  },
};

export const STATUS_LABELS = {
  INCOMPLETE: 'Aguardando ativação',
  INCOMPLETE_EXPIRED: 'Assinatura não concluída',
  TRIALING: 'Período de teste',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Pagamento pendente',
  UNPAID: 'Pagamento não realizado',
  CANCELED: 'Cancelada',
};

export function normalizePlanKey(plan, fallback = 'BASIC') {
  const normalized = String(plan || fallback).trim().toUpperCase();
  return PLANS[normalized] ? normalized : fallback;
}

export function planKeyFromSlug(slug, fallback = 'BASIC') {
  const normalized = String(slug || fallback).trim().toLowerCase();
  const match = Object.values(PLANS).find((plan) => plan.slug === normalized);
  return match?.key || fallback;
}

export function getPlan(plan) {
  return PLANS[normalizePlanKey(plan)];
}

export function getSubscriptionStatusLabel(status) {
  return STATUS_LABELS[status] || 'Situação da assinatura';
}

export function hasBillingAccess(status) {
  return ['ACTIVE', 'TRIALING'].includes(status);
}

export function needsBillingAttention(status) {
  return !hasBillingAccess(status);
}
