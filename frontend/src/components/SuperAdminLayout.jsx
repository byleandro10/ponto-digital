import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  FiGrid, FiUsers, FiDollarSign, FiBarChart2, FiLogOut,
  FiMenu, FiX, FiClock, FiTrendingDown
} from 'react-icons/fi';

const SA_NAV_ITEMS = [
  { to: '/super-admin/dashboard', icon: FiGrid,         label: 'Dashboard',    color: 'text-blue-500' },
  { to: '/super-admin/companies', icon: FiUsers,        label: 'Empresas',     color: 'text-indigo-500' },
  { to: '/super-admin/revenue',   icon: FiDollarSign,   label: 'Receita',      color: 'text-green-500' },
  { to: '/super-admin/usage',     icon: FiBarChart2,    label: 'Uso',          color: 'text-purple-500' },
];

function SASidebar({ open, onClose, user, logout }) {
  const { pathname } = useLocation();
  return (
    <>
      {open && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={onClose} />}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-gray-900 z-40
        flex flex-col transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        <div className="flex items-center justify-between px-5 py-5 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <FiClock className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-sm leading-tight">Ponto Digital</p>
              <p className="text-xs text-gray-500">Super Admin</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 lg:hidden">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {SA_NAV_ITEMS.map(item => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}
                `}
              >
                <item.icon className={`w-4 h-4 ${active ? 'text-white' : item.color}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
              SA
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-200 truncate">{user?.name || 'Super Admin'}</p>
              <p className="text-xs text-gray-500">Super Admin</p>
            </div>
            <button onClick={logout} title="Sair" className="text-gray-500 hover:text-red-400 transition">
              <FiLogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export default function SuperAdminLayout({ title, children }) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-950 flex">
      <SASidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} logout={logout} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3 lg:px-6 sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-gray-200 lg:hidden">
            <FiMenu className="w-6 h-6" />
          </button>
          <h1 className="text-base font-bold text-white flex-1">{title}</h1>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
