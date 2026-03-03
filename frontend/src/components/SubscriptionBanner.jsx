import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiAlertTriangle, FiClock, FiX } from 'react-icons/fi';
import api from '../services/api';

export default function SubscriptionBanner() {
  const [subscription, setSubscription] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    api.get('/subscriptions/status')
      .then((res) => setSubscription(res.data.subscription))
      .catch(() => {});
  }, []);

  if (!subscription || dismissed) return null;

  const { status, trialDaysLeft, planName } = subscription;

  if (status === 'ACTIVE') return null;

  if (status === 'TRIAL' && trialDaysLeft > 7) return null;

  const configs = {
    TRIAL: {
      bg: 'bg-blue-50 border-blue-200',
      icon: <FiClock className="w-5 h-5 text-blue-600" />,
      text: `Período de teste: ${trialDaysLeft} dia${trialDaysLeft !== 1 ? 's' : ''} restante${trialDaysLeft !== 1 ? 's' : ''}.`,
      action: 'Gerenciar assinatura',
      link: '/admin/subscription',
    },
    PAST_DUE: {
      bg: 'bg-yellow-50 border-yellow-300',
      icon: <FiAlertTriangle className="w-5 h-5 text-yellow-600" />,
      text: 'Pagamento pendente. Regularize para manter o acesso.',
      action: 'Atualizar pagamento',
      link: '/admin/subscription',
    },
    CANCELLED: {
      bg: 'bg-red-50 border-red-200',
      icon: <FiAlertTriangle className="w-5 h-5 text-red-600" />,
      text: 'Assinatura cancelada. Reative para continuar usando.',
      action: 'Reativar',
      link: '/admin/subscription',
    },
    EXPIRED: {
      bg: 'bg-red-50 border-red-200',
      icon: <FiAlertTriangle className="w-5 h-5 text-red-600" />,
      text: 'Assinatura expirada.',
      action: 'Reativar',
      link: '/admin/subscription',
    },
  };

  const config = configs[status];
  if (!config) return null;

  return (
    <div className={`border rounded-xl px-4 py-3 mx-4 mt-3 flex items-center gap-3 ${config.bg}`}>
      {config.icon}
      <p className="text-sm flex-1 text-gray-800">
        {config.text}
      </p>
      <Link to={config.link} className="text-sm font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap">
        {config.action}
      </Link>
      <button onClick={() => setDismissed(true)} className="text-gray-400 hover:text-gray-600">
        <FiX className="w-4 h-4" />
      </button>
    </div>
  );
}
