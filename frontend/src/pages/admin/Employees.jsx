import { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { FiPlus, FiSearch, FiEdit2, FiTrash2, FiExternalLink } from 'react-icons/fi';
import { maskCPF, maskPhone, formatCPFDisplay, unmask } from '../../utils/masks';
import AdminLayout from '../../components/AdminLayout';

const SCHEDULE_LABELS = {
  standard: 'Padrão CLT (com almoço)',
  no_break: 'Sem intervalo (entrada/saída)',
  shift:    'Escala (ex: 12x36)',
};

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: '', cpf: '', email: '', password: '', phone: '',
    position: '', department: '', workloadHours: 8,
    workScheduleType: 'standard', geofenceExempt: false,
  });
  const [editing, setEditing] = useState(null);

  useEffect(() => { fetchEmployees(); }, [search]);

  async function fetchEmployees() {
    try {
      const response = await api.get(`/employees?search=${search}`);
      setEmployees(response.data.employees);
    } catch (error) { toast.error('Erro ao carregar funcionários'); }
    finally { setLoading(false); }
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    if (name === 'cpf') return setForm({ ...form, cpf: maskCPF(value) });
    if (name === 'phone') return setForm({ ...form, phone: maskPhone(value) });
    if (type === 'checkbox') return setForm({ ...form, [name]: checked });
    setForm({ ...form, [name]: value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        cpf: unmask(form.cpf),
        phone: unmask(form.phone),
        workloadHours: parseFloat(form.workloadHours) || 8,
        geofenceExempt: !!form.geofenceExempt,
      };
      if (editing) {
        await api.put(`/employees/${editing}`, payload);
        toast.success('Funcionário atualizado!');
      } else {
        await api.post('/employees', payload);
        toast.success('Funcionário cadastrado!');
      }
      setShowModal(false);
      setForm({ name: '', cpf: '', email: '', password: '', phone: '', position: '', department: '', workloadHours: 8, workScheduleType: 'standard', geofenceExempt: false });
      setEditing(null);
      fetchEmployees();
    } catch (error) { toast.error(error.response?.data?.error || 'Erro ao salvar'); }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Desativar ${name}?`)) return;
    try { await api.delete(`/employees/${id}`); toast.success('Funcionário desativado'); fetchEmployees(); }
    catch (error) { toast.error('Erro ao desativar'); }
  }

  function openEdit(emp) {
    setForm({
      name: emp.name, cpf: maskCPF(emp.cpf), email: emp.email, password: '',
      phone: maskPhone(emp.phone || ''), position: emp.position || '',
      department: emp.department || '', workloadHours: emp.workloadHours,
      workScheduleType: emp.workScheduleType || 'standard',
      geofenceExempt: emp.geofenceExempt || false,
    });
    setEditing(emp.id);
    setShowModal(true);
  }

  return (
    <AdminLayout title="Funcionários">
      <div className="max-w-6xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="relative">
            <FiSearch className="absolute left-3 top-3 text-gray-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, CPF ou e-mail..."
              className="pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none w-80" />
          </div>
        <button onClick={() => { setShowModal(true); setEditing(null); setForm({ name: '', cpf: '', email: '', password: '', phone: '', position: '', department: '', workloadHours: 8, workScheduleType: 'standard', geofenceExempt: false }); }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
            <FiPlus /> Novo Funcionário
          </button>
        </div>
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {['Nome','CPF','Cargo','Depto','Jornada','Status','Ações'].map(h => (
                  <th key={h} className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-800">{emp.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 font-mono">{formatCPFDisplay(emp.cpf)}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{emp.position || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{emp.department || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <div>{SCHEDULE_LABELS[emp.workScheduleType] || 'Padrão CLT'}</div>
                    <div className="text-xs text-gray-400">{emp.workloadHours}h/dia{emp.geofenceExempt ? ' · Isento de cerca' : ''}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${emp.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {emp.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 flex gap-2">
                    <button onClick={() => openEdit(emp)} className="text-blue-500 hover:text-blue-700"><FiEdit2 /></button>
                    <button onClick={() => handleDelete(emp.id, emp.name)} className="text-red-400 hover:text-red-600"><FiTrash2 /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">{editing ? 'Editar' : 'Novo'} Funcionário</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo *</label>
                <input name="name" value={form.name} onChange={handleChange} placeholder="João da Silva" required className="w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              {!editing && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CPF *</label>
                  <input name="cpf" value={form.cpf} onChange={handleChange} placeholder="000.000.000-00" required maxLength={14} className="w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none font-mono" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
                <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="joao@empresa.com" required className="w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              {!editing && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Senha * <span className="text-xs text-gray-400">(mín. 6 caracteres)</span></label>
                  <input name="password" type="password" value={form.password} onChange={handleChange} placeholder="••••••" required minLength={6} className="w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <input name="phone" value={form.phone} onChange={handleChange} placeholder="(11) 99999-9999" maxLength={15} className="w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                  <input name="position" value={form.position} onChange={handleChange} placeholder="Ex: Desenvolvedor" className="w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Departamento</label>
                  <input name="department" value={form.department} onChange={handleChange} placeholder="Ex: TI" className="w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Carga horária diária (h)</label>
                <input name="workloadHours" type="number" min="1" max="24" step="0.5" value={form.workloadHours} onChange={handleChange} placeholder="8" className="w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              {/* Tipo de jornada */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de jornada</label>
                <div className="space-y-2">
                  {Object.entries(SCHEDULE_LABELS).map(([value, label]) => (
                    <label key={value} className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition ${form.workScheduleType === value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="radio" name="workScheduleType" value={value} checked={form.workScheduleType === value} onChange={handleChange} className="mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">{label}</p>
                        <p className="text-xs text-gray-400">
                          {value === 'standard' && 'Registra: Entrada → Saída p/ Almoço → Volta Almoço → Saída'}
                          {value === 'no_break' && 'Registra apenas: Entrada → Saída (sem intervalo)'}
                          {value === 'shift' && 'Escala livre: pares Entrada/Saída ilimitados no dia'}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Isenção de cerca virtual */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" name="geofenceExempt" checked={form.geofenceExempt} onChange={handleChange} className="mt-1 w-4 h-4 rounded accent-amber-500" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Isento de cerca virtual</p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Permite que este funcionário bata ponto fora da área definida,
                      mesmo quando a empresa usa o modo "Bloquear". Ideal para trabalhadores externos ou em campo.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">{editing ? 'Atualizar' : 'Cadastrar'}</button>
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
