import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiAlertTriangle, FiClock, FiX } from 'react-icons/fi';
import api from '../services/api';
import { getSubscriptionStatusLabel } from '../utils/billing';

export default function SubscriptionBanner() {
  const [subscription, setSubscription] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    api.get('/billing/status')
      .then((response) => setSubscription(response.data.subscription))
      .catch(() => {});
  }, []);

  if (!subscription || dismissed) {
    return null;
  }

  const status = subscription.status;

  if (status === 'ACTIVE') {
    return null;
  }

  if (status === 'TRIALING' && subscription.trialDaysLeft > 7) {
    return null;
  }

  const configs = {
    TRIALING: {
      bg: 'bg-blue-50 border-blue-200',
      icon: <FiClock className="h-5 w-5 text-blue-600" />,
      text: `Seu período de teste termina em ${subscription.trialDaysLeft} dia${subscription.trialDaysLeft !== 1 ? 's' : ''}.`,
      action: 'Ver assinatura',
    },
    INCOMPLETE: {
      bg: 'bg-amber-50 border-amber-200',
      icon: <FiAlertTriangle className="h-5 w-5 text-amber-600" />,
      text: 'Sua assinatura ainda não foi concluída. Finalize o checkout para liberar o acesso.',
      action: 'Concluir assinatura',
    },
    INCOMPLETE_EXPIRED: {
      bg: 'bg-slate-100 border-slate-200',
      icon: <FiAlertTriangle className="h-5 w-5 text-slate-600" />,
      text: 'A sessão anterior expirou. Inicie uma nova assinatura para continuar.',
      action: 'Assinar agora',
    },
    PAST_DUE: {
      bg: 'bg-amber-50 border-amber-200',
      icon: <FiAlertTriangle className="h-5 w-5 text-amber-600" />,
      text: 'Existe um pagamento pendente. Atualize o método de pagamento para manter o acesso.',
      action: 'Regularizar',
    },
    UNPAID: {
      bg: 'bg-red-50 border-red-200',
      icon: <FiAlertTriangle className="h-5 w-5 text-red-600" />,
      text: 'A última cobrança não foi concluída. Revise a assinatura para evitar interrupções.',
      action: 'Gerenciar',
    },
    CANCELED: {
      bg: 'bg-slate-100 border-slate-200',
      icon: <FiAlertTriangle className="h-5 w-5 text-slate-600" />,
      text: 'Sua assinatura foi cancelada. Inicie uma nova assinatura para reativar o sistema.',
      action: 'Reativar',
    },
  };

  const config = configs[status];
  if (!config) {
    return null;
  }

  return (
    <div className={`mx-4 mt-3 flex items-center gap-3 rounded-xl border px-4 py-3 ${config.bg}`}>
      {config.icon}
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-800">{getSubscriptionStatusLabel(status)}</p>
        <p className="mt-0.5 text-sm text-slate-700">{config.text}</p>
      </div>
      <Link to="/admin/subscription" className="whitespace-nowrap text-sm font-semibold text-blue-600 transition hover:text-blue-700">
        {config.action}
      </Link>
      <button type="button" onClick={() => setDismissed(true)} className="text-slate-400 transition hover:text-slate-600">
        <FiX className="h-4 w-4" />
      </button>
    </div>
  );
}
