import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { FiSave, FiCamera, FiMapPin } from 'react-icons/fi';
import AdminLayout from '../../components/AdminLayout';

export default function Settings() {
  const [config, setConfig] = useState({ requireSelfie: false, geofenceMode: 'off' });
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchConfig(); }, []);

  async function fetchConfig() {
    try {
      const res = await api.get('/geofences/config');
      // A API retorna { config: { requireSelfie, geofenceMode, ... } }
      const data = res.data.config || res.data;
      setConfig({
        requireSelfie: data.requireSelfie ?? false,
        geofenceMode: data.geofenceMode || 'off'
      });
    } catch { /* first time */ }
    finally { setLoading(false); }
  }

  async function handleSave() {
    try {
      await api.put('/geofences/config', config);
      toast.success('Configurações salvas!');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao salvar');
    }
  }

  const geofenceModes = [
    { value: 'off', label: 'Desligado', desc: 'Geofencing não será verificado', icon: '🔵' },
    { value: 'warn', label: 'Avisar', desc: 'Registra o ponto, mas avisa que está fora da cerca', icon: '🟡' },
    { value: 'block', label: 'Bloquear', desc: 'Impede o registro de ponto fora da cerca', icon: '🔴' }
  ];

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <AdminLayout title="Configurações">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Selfie */}
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-100 p-2 rounded-lg"><FiCamera className="w-5 h-5 text-blue-600" /></div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Foto no Ponto (Selfie)</h2>
              <p className="text-sm text-gray-500">Exigir que funcionários tirem selfie ao bater ponto</p>
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input type="checkbox" checked={config.requireSelfie} onChange={e => setConfig({...config, requireSelfie: e.target.checked})}
                className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 rounded-full peer-checked:bg-blue-600 transition-colors"></div>
              <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform"></div>
            </div>
            <span className="text-sm font-medium text-gray-700">{config.requireSelfie ? 'Ativado' : 'Desativado'}</span>
          </label>
        </div>

        {/* Geofencing */}
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-green-100 p-2 rounded-lg"><FiMapPin className="w-5 h-5 text-green-600" /></div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Cerca Virtual (Geofencing)</h2>
              <p className="text-sm text-gray-500">Controle de localização ao registrar ponto</p>
            </div>
          </div>
          <div className="space-y-3">
            {geofenceModes.map(mode => (
              <label key={mode.value}
                className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition ${config.geofenceMode === mode.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="geofenceMode" value={mode.value}
                  checked={config.geofenceMode === mode.value}
                  onChange={e => setConfig({...config, geofenceMode: e.target.value})}
                  className="mt-1" />
                <div>
                  <span className="font-medium text-gray-800">{mode.icon} {mode.label}</span>
                  <p className="text-sm text-gray-500">{mode.desc}</p>
                </div>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">Configure as cercas em <Link to="/admin/geofences" className="text-blue-500 underline">Cercas Virtuais</Link></p>
        </div>

        {/* Save */}
        <button onClick={handleSave}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 transition font-bold text-lg shadow">
          <FiSave /> Salvar Configurações
        </button>
      </div>
    </AdminLayout>
  );
}
