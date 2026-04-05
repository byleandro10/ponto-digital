import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  FiClock,
  FiCreditCard,
  FiEdit2,
  FiFileText,
  FiGrid,
  FiInbox,
  FiLogOut,
  FiMap,
  FiMapPin,
  FiMenu,
  FiSettings,
  FiUsers,
  FiX,
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import SubscriptionBanner from './SubscriptionBanner';
import { hasBillingAccess } from '../utils/billing';

export const NAV_ITEMS = [
  { to: '/admin/dashboard', icon: FiGrid, label: 'Painel', color: 'text-blue-500' },
  { to: '/admin/employees', icon: FiUsers, label: 'Funcionários', color: 'text-indigo-500' },
  { to: '/admin/reports', icon: FiFileText, label: 'Relatórios', color: 'text-green-500' },
  { to: '/admin/adjustments', icon: FiEdit2, label: 'Ajuste de ponto', color: 'text-yellow-500' },
  { to: '/admin/adjustment-requests', icon: FiInbox, label: 'Solicitações', color: 'text-orange-500' },
  { to: '/admin/punch-map', icon: FiMap, label: 'Mapa de batidas', color: 'text-purple-500' },
  { to: '/admin/geofences', icon: FiMapPin, label: 'Cercas virtuais', color: 'text-red-500', minPlan: 'professional' },
  { to: '/admin/subscription', icon: FiCreditCard, label: 'Assinatura', color: 'text-emerald-500' },
  { to: '/admin/settings', icon: FiSettings, label: 'Configurações', color: 'text-slate-500' },
];

function Sidebar({ open, onClose, user, logout }) {
  const { pathname } = useLocation();

  const subscriptionInactive = !hasBillingAccess(user?.subscriptionStatus);
  const companyPlan = user?.company?.plan || 'basic';
  const planOrder = { basic: 0, professional: 1, enterprise: 2 };
  const userPlanLevel = planOrder[companyPlan] ?? 0;

  const visibleNavItems = subscriptionInactive
    ? NAV_ITEMS.filter((item) => item.to === '/admin/subscription')
    : NAV_ITEMS.filter((item) => {
        if (!item.minPlan) return true;
        return userPlanLevel >= (planOrder[item.minPlan] ?? 0);
      });

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed left-0 top-0 z-40 flex h-full w-64 flex-col border-r border-slate-100 bg-white shadow-xl transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } lg:static lg:z-auto lg:translate-x-0 lg:shadow-none`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5">
          <div className="flex items-center gap-3">
            {user?.company?.logoUrl ? (
              <img
                src={user.company.logoUrl}
                alt={user.company.name}
                className="h-9 w-9 rounded-xl border border-slate-100 bg-slate-50 object-contain"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
                <FiClock className="h-5 w-5 text-white" />
              </div>
            )}

            <div>
              <p className="text-sm font-bold leading-tight text-slate-900">Ponto Digital</p>
              <p className="max-w-[120px] truncate text-xs text-slate-400">{user?.company?.name}</p>
            </div>
          </div>

          <button type="button" onClick={onClose} className="text-slate-400 transition hover:text-slate-600 lg:hidden">
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {subscriptionInactive && (
            <div className="mx-1 mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-800">Acesso limitado</p>
              <p className="mt-0.5 text-xs text-amber-700">Regularize a assinatura para liberar o sistema.</p>
            </div>
          )}

          {visibleNavItems.map((item) => {
            const active = pathname === item.to;

            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <item.icon className={`h-4 w-4 shrink-0 ${active ? 'text-blue-600' : item.color}`} />
                {item.label}
                {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-600" />}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-100 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white">
              {user?.name?.[0]?.toUpperCase() || 'A'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{user?.name || 'Administrador'}</p>
              <p className="text-xs text-slate-400">Administrador</p>
            </div>
            <button type="button" onClick={logout} title="Sair" className="text-slate-400 transition hover:text-red-500">
              <FiLogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export default function AdminLayout({ title, children }) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} logout={logout} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3 lg:px-6">
          <button type="button" onClick={() => setSidebarOpen(true)} className="text-slate-500 transition hover:text-slate-700 lg:hidden">
            <FiMenu className="h-6 w-6" />
          </button>
          <h1 className="flex-1 text-base font-bold text-slate-900">{title}</h1>
        </header>

        <main className="flex-1 overflow-auto">
          <SubscriptionBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
