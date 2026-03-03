import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SubscriptionBanner from './SubscriptionBanner';
import {
  FiUsers, FiClock, FiLogOut, FiFileText, FiEdit2,
  FiMapPin, FiSettings, FiMap, FiGrid, FiMenu, FiX, FiInbox, FiCreditCard
} from 'react-icons/fi';

export const NAV_ITEMS = [
  { to: '/admin/dashboard',            icon: FiGrid,     label: 'Painel',              color: 'text-blue-500' },
  { to: '/admin/employees',            icon: FiUsers,    label: 'Funcionários',         color: 'text-indigo-500' },
  { to: '/admin/reports',              icon: FiFileText, label: 'Relatórios',           color: 'text-green-500' },
  { to: '/admin/adjustments',          icon: FiEdit2,    label: 'Ajuste de Ponto',      color: 'text-yellow-500' },
  { to: '/admin/adjustment-requests',  icon: FiInbox,    label: 'Solicitações',         color: 'text-orange-500' },
  { to: '/admin/punch-map',            icon: FiMap,      label: 'Mapa de Batidas',      color: 'text-purple-500' },
  { to: '/admin/geofences',            icon: FiMapPin,   label: 'Cercas Virtuais',      color: 'text-red-500',    minPlan: 'professional' },
  { to: '/admin/subscription',         icon: FiCreditCard, label: 'Assinatura',          color: 'text-emerald-500' },
  { to: '/admin/settings',             icon: FiSettings, label: 'Configurações',        color: 'text-gray-500' },
];

function Sidebar({ open, onClose, user, logout }) {
  const { pathname } = useLocation();

  // Determinar se a assinatura está inativa
  const status = user?.subscriptionStatus;
  const trialExpired = status === 'TRIAL' && user?.trialEndsAt && new Date(user.trialEndsAt) < new Date();
  const subscriptionInactive = ['CANCELLED', 'EXPIRED', 'PAST_DUE'].includes(status) || trialExpired;

  // Filtrar itens por status de assinatura e plano
  const companyPlan = user?.company?.plan || 'basic';
  const planOrder = { basic: 0, professional: 1, enterprise: 2 };
  const userPlanLevel = planOrder[companyPlan] ?? 0;

  const visibleNavItems = subscriptionInactive
    ? NAV_ITEMS.filter(item => item.to === '/admin/subscription')
    : NAV_ITEMS.filter(item => {
        if (!item.minPlan) return true;
        return userPlanLevel >= (planOrder[item.minPlan] ?? 0);
      });

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={onClose} />
      )}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-100 shadow-xl z-40
        flex flex-col transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:shadow-none lg:z-auto
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {user?.company?.logoUrl ? (
              <img
                src={user.company.logoUrl}
                alt={user.company.name}
                className="w-9 h-9 rounded-xl object-contain bg-gray-50 border border-gray-100"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
                <FiClock className="w-5 h-5 text-white" />
              </div>
            )}
            <div>
              <p className="font-bold text-gray-900 text-sm leading-tight">Ponto Digital</p>
              <p className="text-xs text-gray-400 truncate max-w-[120px]">{user?.company?.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 lg:hidden">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Navegação */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {subscriptionInactive && (
            <div className="mx-1 mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-xs text-red-700 font-semibold">Acesso limitado</p>
              <p className="text-xs text-red-600 mt-0.5">Ative sua assinatura para liberar o sistema.</p>
            </div>
          )}
          {visibleNavItems.map(item => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                `}
              >
                <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-blue-600' : item.color}`} />
                {item.label}
                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />}
              </Link>
            );
          })}
        </nav>

        {/* Usuário */}
        <div className="px-4 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user?.name?.[0]?.toUpperCase() || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{user?.name || 'Admin'}</p>
              <p className="text-xs text-gray-400">Administrador</p>
            </div>
            <button onClick={logout} title="Sair" className="text-gray-400 hover:text-red-500 transition">
              <FiLogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

/**
 * Layout padrão para páginas administrativas.
 * Inclui sidebar, topbar responsivo e área de conteúdo.
 *
 * @param {{ title: string, children: React.ReactNode }} props
 */
export default function AdminLayout({ title, children }) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} logout={logout} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 lg:px-6 sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-500 hover:text-gray-700 lg:hidden">
            <FiMenu className="w-6 h-6" />
          </button>
          <h1 className="text-base font-bold text-gray-900 flex-1">{title}</h1>
        </header>

        <main className="flex-1 overflow-auto">
          <SubscriptionBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
