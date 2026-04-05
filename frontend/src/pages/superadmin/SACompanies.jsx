import { useState, useEffect } from 'react';
import SuperAdminLayout from '../../components/SuperAdminLayout';
import api from '../../services/api';
import { FiSearch, FiX, FiUsers, FiCalendar, FiActivity } from 'react-icons/fi';

const STATUS_COLORS = {
  TRIALING: 'bg-blue-900/30 text-blue-400',
  ACTIVE: 'bg-green-900/30 text-green-400',
  PAST_DUE: 'bg-yellow-900/30 text-yellow-400',
  UNPAID: 'bg-red-900/30 text-red-400',
  CANCELED: 'bg-slate-800 text-slate-300',
  INCOMPLETE: 'bg-slate-800 text-slate-300',
  INCOMPLETE_EXPIRED: 'bg-slate-800 text-slate-300',
};

export default function SACompanies() {
  const [companies, setCompanies] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchCompanies = () => {
    setLoading(true);
    const params = { page, limit: 15 };
    if (search) params.search = search;
    if (filterPlan) params.plan = filterPlan;
    if (filterStatus) params.status = filterStatus;

    api.get('/super-admin/companies', { params })
      .then((res) => {
        setCompanies(res.data.companies || []);
        setTotal(res.data.total || 0);
        setPages(res.data.pages || 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCompanies(); }, [page, filterPlan, filterStatus]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchCompanies();
  };

  const openDetail = (id) => {
    setSelected(id);
    setDetailLoading(true);
    api.get(`/super-admin/companies/${id}`)
      .then((res) => setDetail(res.data))
      .catch(console.error)
      .finally(() => setDetailLoading(false));
  };

  return (
    <SuperAdminLayout title="Empresas">
      <div className="p-4 lg:p-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <div className="flex-1 relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou CNPJ..."
                className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition">Buscar</button>
          </form>
          <select
            value={filterPlan}
            onChange={(e) => { setFilterPlan(e.target.value); setPage(1); }}
            className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-300"
          >
            <option value="">Todos os planos</option>
            <option value="basic">Básico</option>
            <option value="professional">Profissional</option>
            <option value="enterprise">Empresarial</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-300"
          >
            <option value="">Todos os status</option>
            <option value="TRIALING">Trial</option>
            <option value="ACTIVE">Ativo</option>
            <option value="PAST_DUE">Pagamento pendente</option>
            <option value="UNPAID">Não pago</option>
            <option value="CANCELED">Cancelado</option>
          </select>
        </div>

        <p className="text-sm text-gray-500">{total} empresa{total !== 1 ? 's' : ''} encontrada{total !== 1 ? 's' : ''}</p>

        {/* Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800 bg-gray-900">
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">Plano</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Funcionários</th>
                  <th className="px-4 py-3 font-medium">Batidas/Mês</th>
                  <th className="px-4 py-3 font-medium">Cadastro</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-500">Carregando...</td></tr>
                ) : companies.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-500">Nenhuma empresa encontrada.</td></tr>
                ) : companies.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => openDetail(c.id)}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer transition"
                  >
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{c.name}</p>
                      <p className="text-gray-500 text-xs">{c.cnpj}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-300 capitalize">{c.plan}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-bold ${STATUS_COLORS[c.subscriptionStatus] || STATUS_COLORS.INCOMPLETE_EXPIRED}`}>
                        {c.subscriptionStatus}
                      </span>
                      {c.subscriptionStatus === 'TRIALING' && (
                        <span className="text-xs text-gray-500 ml-2">{c.trialDaysLeft}d</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{c.employeeCount}</td>
                    <td className="px-4 py-3 text-gray-300">{c.punchesThisMonth}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(c.createdAt).toLocaleDateString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex justify-center gap-2">
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition ${
                  page === p ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Detail Drawer */}
        {selected && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="fixed inset-0 bg-black/60" onClick={() => setSelected(null)} />
            <div className="relative w-full max-w-lg bg-gray-900 border-l border-gray-800 overflow-y-auto">
              <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between z-10">
                <h3 className="text-white font-bold">Detalhes da Empresa</h3>
                <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-300">
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              {detailLoading ? (
                <div className="flex items-center justify-center p-20">
                  <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
                </div>
              ) : detail ? (
                <div className="p-6 space-y-6">
                  <div>
                    <h4 className="text-white font-bold text-lg">{detail.company.name}</h4>
                    <p className="text-gray-500 text-sm">{detail.company.cnpj}</p>
                    <p className="text-gray-500 text-sm mt-1">
                      Plano: <span className="text-gray-300 capitalize">{detail.company.plan}</span> |
                      Status: <span className="text-gray-300">{detail.company.subscriptionStatus}</span>
                    </p>
                    <p className="text-gray-500 text-sm">
                      {detail.company._count?.employees || 0} funcionários
                    </p>
                  </div>

                  {detail.company.users?.length > 0 && (
                    <div>
                      <h4 className="text-gray-400 font-semibold text-sm mb-2">Administradores</h4>
                      {detail.company.users.map((u) => (
                        <div key={u.id} className="bg-gray-800 rounded-xl p-3 mb-2">
                          <p className="text-white text-sm font-medium">{u.name}</p>
                          <p className="text-gray-500 text-xs">{u.email} — {u.role}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {detail.company.subscriptions?.length > 0 && (
                    <div>
                      <h4 className="text-gray-400 font-semibold text-sm mb-2">Histórico de Assinaturas</h4>
                      {detail.company.subscriptions.map((s) => (
                        <div key={s.id} className="bg-gray-800 rounded-xl p-3 mb-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-300 capitalize">{s.plan?.toLowerCase()}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${STATUS_COLORS[s.status] || ''}`}>{s.status}</span>
                          </div>
                          <p className="text-gray-500 text-xs mt-1">
                            Criada em {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                            {s.trialEndsAt && ` — Trial até ${new Date(s.trialEndsAt).toLocaleDateString('pt-BR')}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {detail.company.payments?.length > 0 && (
                    <div>
                      <h4 className="text-gray-400 font-semibold text-sm mb-2">Pagamentos</h4>
                      {detail.company.payments.map((p) => (
                        <div key={p.id} className="flex justify-between bg-gray-800 rounded-xl p-3 mb-2 text-sm">
                          <div>
                            <p className="text-white font-medium">R${parseFloat(p.amount).toFixed(2)}</p>
                            <p className="text-gray-500 text-xs">{new Date(p.createdAt).toLocaleDateString('pt-BR')}</p>
                          </div>
                          <span className={`text-xs font-bold ${p.status === 'PAID' ? 'text-green-400' : p.status === 'FAILED' ? 'text-red-400' : 'text-yellow-400'}`}>
                            {p.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {detail.usageLogs?.length > 0 && (
                    <div>
                      <h4 className="text-gray-400 font-semibold text-sm mb-2">Uso (últimos 30 dias)</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-800 rounded-xl p-3 text-center">
                          <p className="text-xl font-bold text-white">
                            {detail.usageLogs.reduce((s, l) => s + l.totalPunches, 0)}
                          </p>
                          <p className="text-gray-500 text-xs">Batidas</p>
                        </div>
                        <div className="bg-gray-800 rounded-xl p-3 text-center">
                          <p className="text-xl font-bold text-white">
                            {detail.usageLogs.reduce((s, l) => s + l.adminLogins + l.employeeLogins, 0)}
                          </p>
                          <p className="text-gray-500 text-xs">Logins</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </SuperAdminLayout>
  );
}
