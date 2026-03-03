import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  FiClock, FiLogOut, FiFileText, FiEdit2,
  FiList, FiShield, FiLock, FiChevronDown
} from 'react-icons/fi';

const TABS = [
  { to: '/employee/punch',        icon: FiClock,    label: 'Ponto' },
  { to: '/employee/history',      icon: FiList,     label: 'Histórico' },
  { to: '/employee/punch-mirror', icon: FiFileText, label: 'Espelho' },
  { to: '/employee/adjustments',  icon: FiEdit2,    label: 'Ajustes' },
  { to: '/employee/audit-log',    icon: FiShield,   label: 'Auditoria' },
];

/**
 * Layout padrão para páginas do funcionário.
 * Header compacto + bottom tab navigation (mobile-first).
 */
export default function EmployeeLayout({ children, onChangePassword }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initials = (user?.name || 'F')
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col">
      {/* ── Header ── */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-gray-200/60 px-4 py-2.5 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          {user?.company?.logoUrl ? (
            <img
              src={user.company.logoUrl}
              alt={user.company.name}
              className="w-8 h-8 rounded-xl object-contain bg-gray-50"
            />
          ) : (
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-sm">
              <FiClock className="w-4 h-4 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-bold text-sm text-gray-900 leading-tight">Ponto Digital</p>
            <p className="text-[11px] text-gray-400 leading-tight truncate max-w-[140px]">
              {user?.company?.name}
            </p>
          </div>
        </div>

        {/* Menu do usuário */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="flex items-center gap-1.5 hover:bg-gray-100 rounded-xl px-2 py-1.5 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
              {initials}
            </div>
            <span className="text-sm text-gray-700 font-medium hidden sm:block max-w-[100px] truncate">
              {user?.name?.split(' ')[0]}
            </span>
            <FiChevronDown
              className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${
                menuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 py-1 z-50 animate-fade-in">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-800 truncate">{user?.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{user?.position || 'Funcionário'}</p>
              </div>
              {onChangePassword && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onChangePassword();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <FiLock className="w-4 h-4 text-gray-400" />
                  Alterar Senha
                </button>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <FiLogOut className="w-4 h-4" />
                Sair
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Conteúdo ── */}
      <main className="flex-1 overflow-auto pb-20">
        {children}
      </main>

      {/* ── Bottom Tab Navigation ── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-gray-200 z-30">
        <div className="flex items-stretch justify-around max-w-lg mx-auto">
          {TABS.map(tab => {
            const active = pathname === tab.to;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`
                  relative flex flex-col items-center justify-center flex-1 py-2 transition-colors
                  ${active ? 'text-blue-600' : 'text-gray-400 active:text-gray-600'}
                `}
              >
                {/* Indicador ativo no topo */}
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-blue-600" />
                )}
                <div
                  className={`
                    flex items-center justify-center w-10 h-10 rounded-2xl transition-all duration-200
                    ${active ? 'bg-blue-50 scale-105' : ''}
                  `}
                >
                  <tab.icon className={`w-[22px] h-[22px] ${active ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
                </div>
                <span
                  className={`
                    text-[10px] leading-none mt-0.5 font-medium transition-colors
                    ${active ? 'text-blue-600' : 'text-gray-400'}
                  `}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
        {/* Safe area para iPhones com home indicator */}
        <div className="h-safe-area-bottom" />
      </nav>
    </div>
  );
}
