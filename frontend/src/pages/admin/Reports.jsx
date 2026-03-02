import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { FiArrowLeft, FiDownload, FiFileText, FiSearch, FiUsers } from 'react-icons/fi';

export default function Reports() {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [month, setMonth] = useState(dayjs().month() + 1);
  const [year, setYear] = useState(dayjs().year());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/employees').then(r => setEmployees(r.data.employees)).catch(() => {});
  }, []);

  async function fetchReport() {
    if (!selectedEmployee) return toast.error('Selecione um funcionário');
    setLoading(true);
    try {
      const res = await api.get(`/reports/monthly/${selectedEmployee}?month=${month}&year=${year}`);
      setReport(res.data);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao buscar relatório');
    } finally { setLoading(false); }
  }

  function downloadFile(format) {
    if (!selectedEmployee) return;
    const token = localStorage.getItem('token');
    const url = `/api/export/${format}/${selectedEmployee}?month=${month}&year=${year}`;
    
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        if (!res.ok) throw new Error('Erro no download');
        return res.blob();
      })
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const ext = format === 'pdf' ? 'pdf' : format === 'excel' ? 'xlsx' : 'csv';
        a.download = `espelho-ponto-${month}-${year}.${ext}`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast.success(`${format.toUpperCase()} baixado!`);
      })
      .catch(() => toast.error('Erro ao baixar arquivo'));
  }

  function downloadConsolidated() {
    const token = localStorage.getItem('token');
    fetch(`/api/export/consolidated?month=${month}&year=${year}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => { if (!res.ok) throw new Error(); return res.blob(); })
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `consolidado-${month}-${year}.xlsx`;
        a.click();
        toast.success('Consolidado baixado!');
      })
      .catch(() => toast.error('Erro ao baixar consolidado'));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm px-6 py-4 flex items-center gap-4">
        <Link to="/admin/dashboard" className="text-gray-400 hover:text-gray-600"><FiArrowLeft /></Link>
        <h1 className="text-xl font-bold text-gray-800">Relatórios</h1>
      </header>

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Filtros */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><FiSearch /> Buscar Relatório</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Funcionário</label>
              <select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="">Selecione...</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mês</label>
              <select value={month} onChange={e => setMonth(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none">
                {[...Array(12)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')} - {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][i]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ano</label>
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none">
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={fetchReport} disabled={loading}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-medium">
                {loading ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </div>
        </div>

        {/* Ações de exportação */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><FiDownload /> Exportar</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button onClick={() => downloadFile('pdf')} disabled={!selectedEmployee}
              className="flex items-center justify-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-lg hover:bg-red-100 transition disabled:opacity-40 font-medium text-sm border border-red-200">
              <FiFileText /> PDF Individual
            </button>
            <button onClick={() => downloadFile('excel')} disabled={!selectedEmployee}
              className="flex items-center justify-center gap-2 bg-green-50 text-green-700 px-4 py-3 rounded-lg hover:bg-green-100 transition disabled:opacity-40 font-medium text-sm border border-green-200">
              <FiFileText /> Excel Individual
            </button>
            <button onClick={() => downloadFile('csv')} disabled={!selectedEmployee}
              className="flex items-center justify-center gap-2 bg-purple-50 text-purple-700 px-4 py-3 rounded-lg hover:bg-purple-100 transition disabled:opacity-40 font-medium text-sm border border-purple-200">
              <FiFileText /> CSV Individual
            </button>
            <button onClick={downloadConsolidated}
              className="flex items-center justify-center gap-2 bg-blue-50 text-blue-700 px-4 py-3 rounded-lg hover:bg-blue-100 transition font-medium text-sm border border-blue-200">
              <FiUsers /> Consolidado Excel
            </button>
          </div>
        </div>

        {/* Tabela de relatório */}
        {report && (
          <div className="bg-white rounded-xl shadow">
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Espelho de Ponto</h2>
                <p className="text-sm text-gray-500">{report.employee.name} — {report.period}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {['Data', 'Entrada', 'Almoço Ida', 'Almoço Volta', 'Saída', 'Total'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {report.days.map((day, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium">{day.date}</td>
                      <td className="px-4 py-3 text-sm font-mono">{day.clockIn || '-'}</td>
                      <td className="px-4 py-3 text-sm font-mono">{day.breakStart || '-'}</td>
                      <td className="px-4 py-3 text-sm font-mono">{day.breakEnd || '-'}</td>
                      <td className="px-4 py-3 text-sm font-mono">{day.clockOut || '-'}</td>
                      <td className="px-4 py-3 text-sm font-mono font-bold">{day.totalHours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Resumo */}
            <div className="p-6 bg-gray-50 border-t grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Dias trabalhados', value: report.summary.daysWorked },
                { label: 'Total trabalhado', value: report.summary.totalWorked },
                { label: 'Horas extras', value: report.summary.overtime },
                { label: 'Déficit', value: report.summary.deficit },
              ].map((item, i) => (
                <div key={i} className="text-center">
                  <p className="text-sm text-gray-500">{item.label}</p>
                  <p className="text-xl font-bold text-gray-800">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
