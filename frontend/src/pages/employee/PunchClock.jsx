import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import { FiClock, FiMapPin, FiCheckCircle, FiLogOut, FiCamera, FiAlertTriangle, FiList, FiWifiOff, FiLock, FiEye, FiEyeOff, FiX } from 'react-icons/fi';
import SelfieCapture from '../../components/SelfieCapture';
import OfflineBanner from '../../components/OfflineBanner';
import useOfflineQueue, { enqueueOfflinePunch } from '../../hooks/useOfflineQueue';

dayjs.locale('pt-br');

export default function PunchClock() {
  const { user, logout } = useAuth();
  const [currentTime, setCurrentTime] = useState(dayjs());
  const [todayEntries, setTodayEntries] = useState([]);
  const [nextPunch, setNextPunch] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [selfieData, setSelfieData] = useState(null);
  const [requireSelfie, setRequireSelfie] = useState(false);
  const [hourBankBalance, setHourBankBalance] = useState(null);
  const [geoWarning, setGeoWarning] = useState(null);

  // Estado do modal de alterar senha
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwdLoading, setPwdLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Função da API encapsulada em useCallback para o hook de offline
  const apiPunch = useCallback(async (data) => {
    const response = await api.post('/time-entries/punch', data);
    return response;
  }, []);

  const { isOnline, pendingCount, isSyncing, syncQueue } = useOfflineQueue(apiPunch);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(dayjs()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => { fetchTodayEntries(); getLocation(); fetchCompanyConfig(); }, []);

  async function fetchCompanyConfig() {
    try {
      const res = await api.get('/geofences/config');
      // O backend retorna { config: { requireSelfie, geofenceMode, ... } }
      const config = res.data.config || res.data;
      setRequireSelfie(config.requireSelfie || false);
    } catch (err) { /* empresa pode não ter config */ }
  }

  async function fetchTodayEntries() {
    try {
      const response = await api.get('/time-entries/today');
      setTodayEntries(response.data.entries);
      setNextPunch(response.data.nextPunch);
      setIsComplete(response.data.isComplete);
      if (response.data.hourBankBalance !== undefined) {
        setHourBankBalance(response.data.hourBankBalance);
      }
    } catch (error) { console.error(error); }
  }

  function getLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
        () => console.log('Geolocalização não disponível')
      );
    }
  }

  async function handlePunch(photo = null) {
    if (isComplete) return;

    // Se selfie obrigatória e não tem foto, abrir câmera
    if (requireSelfie && !photo && !selfieData) {
      setShowCamera(true);
      return;
    }

    setLoading(true);
    setGeoWarning(null);

    const punchData = {
      latitude: location?.latitude,
      longitude: location?.longitude,
      deviceInfo: navigator.userAgent,
      photo: photo || selfieData || undefined
    };

    // MODO OFFLINE: sem internet → enfileira no IndexedDB
    if (!isOnline) {
      try {
        await enqueueOfflinePunch(punchData);
        setSelfieData(null);
        toast('📶 Sem conexão — ponto salvo localmente e será enviado ao voltar online.', {
          icon: '📋',
          duration: 5000,
          style: { background: '#f97316', color: 'white' }
        });
        // Atualiza UI local otimisticamente
        setTodayEntries(prev => [
          ...prev,
          {
            type: nextPunch || 'CLOCK_IN',
            typeLabel: '(offline) ' + (nextPunch || 'Entrada'),
            time: dayjs().format('HH:mm'),
            offline: true
          }
        ]);
      } catch {
        toast.error('Erro ao salvar ponto offline');
      } finally {
        setLoading(false);
      }
      return;
    }

    // MODO ONLINE: envia normalmente
    try {
      const response = await api.post('/time-entries/punch', punchData);
      toast.success(response.data.message);
      if (response.data.warning) {
        setGeoWarning(response.data.warning);
      }
      setSelfieData(null);
      fetchTodayEntries();
    } catch (error) {
      // Se perdeu a conexão no meio do processo, salva offline
      if (!navigator.onLine || error.code === 'ERR_NETWORK') {
        await enqueueOfflinePunch(punchData);
        toast('📋 Conexão perdida — ponto salvo localmente.', {
          icon: '📶',
          duration: 5000,
          style: { background: '#f97316', color: 'white' }
        });
      } else {
        toast.error(error.response?.data?.error || 'Erro ao registrar ponto');
      }
    } finally {
      setLoading(false);
    }
  }

  function onSelfieCapture(dataUrl) {
    setSelfieData(dataUrl);
    setShowCamera(false);
    // Auto-punch after selfie
    handlePunch(dataUrl);
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      return toast.error('A nova senha e a confirmação não coincidem.');
    }
    if (pwdForm.newPassword.length < 6) {
      return toast.error('Nova senha deve ter no mínimo 6 caracteres.');
    }
    setPwdLoading(true);
    try {
      await api.put('/auth/change-password/employee', {
        currentPassword: pwdForm.currentPassword,
        newPassword: pwdForm.newPassword,
      });
      toast.success('Senha alterada com sucesso!');
      setShowPwdModal(false);
      setPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao alterar senha');
    } finally {
      setPwdLoading(false);
    }
  }

  function closePwdModal() {
    setShowPwdModal(false);
    setPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
  }

  const typeColors = {
    CLOCK_IN: 'bg-green-100 text-green-700',
    BREAK_START: 'bg-yellow-100 text-yellow-700',
    BREAK_END: 'bg-blue-100 text-blue-700',
    CLOCK_OUT: 'bg-red-100 text-red-700'
  };

  return (
    <>
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {showCamera && <SelfieCapture onCapture={onSelfieCapture} onCancel={() => setShowCamera(false)} />}

      {/* Banner de offline / pendentes */}
      <OfflineBanner
        isOnline={isOnline}
        pendingCount={pendingCount}
        isSyncing={isSyncing}
        onSync={syncQueue}
      />

      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {user?.company?.logoUrl ? (
            <img
              src={user.company.logoUrl}
              alt={user.company.name}
              className="w-8 h-8 rounded-lg object-contain"
            />
          ) : null}
          <div>
            <h1 className="text-lg font-bold text-gray-800">Ponto Digital</h1>
            <p className="text-xs text-gray-500">{user?.company?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/employee/history"
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
            title="Meu Histórico"
          >
            <FiList className="w-4 h-4" />
            <span className="hidden sm:inline">Histórico</span>
          </Link>
          <button
            onClick={() => setShowPwdModal(true)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
            title="Alterar Senha"
          >
            <FiLock className="w-4 h-4" />
            <span className="hidden sm:inline">Senha</span>
          </button>
          <span className="text-sm text-gray-600">{user?.name}</span>
          <button onClick={logout} className="text-gray-400 hover:text-red-500"><FiLogOut /></button>
        </div>
      </header>
      <div className="max-w-lg mx-auto p-4 space-y-6 mt-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <p className="text-gray-500 text-sm capitalize">{currentTime.format('dddd, DD [de] MMMM [de] YYYY')}</p>
          <p className="text-6xl font-bold text-gray-800 mt-2 font-mono">{currentTime.format('HH:mm:ss')}</p>
          <div className="flex items-center justify-center gap-4 mt-3">
            {location && (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <FiMapPin className="w-3 h-3" /><span>Localização capturada</span>
              </div>
            )}
            {requireSelfie && (
              <div className="flex items-center gap-1 text-xs text-blue-600">
                <FiCamera className="w-3 h-3" /><span>Selfie obrigatória</span>
              </div>
            )}
          </div>
        </div>

        {geoWarning && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
            <FiAlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-700">{geoWarning}</p>
          </div>
        )}

        {hourBankBalance !== null && (
          <div className="bg-white rounded-xl shadow p-4 flex items-center justify-between">
            <span className="text-sm text-gray-600">Banco de Horas</span>
            <span className={`text-lg font-bold font-mono ${hourBankBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {hourBankBalance >= 0 ? '+' : ''}{Math.floor(hourBankBalance / 60)}h{String(Math.abs(hourBankBalance) % 60).padStart(2, '0')}min
            </span>
          </div>
        )}

        <div className="text-center">
          {isComplete ? (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-6">
              <FiCheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <p className="text-green-700 font-medium mt-2">Dia completo!</p>
              <p className="text-green-500 text-sm">Todos os pontos foram registrados.</p>
            </div>
          ) : (
            <>
              <p className="text-gray-500 text-sm mb-1">Próximo registro: <strong>{nextPunch}</strong></p>
              {requireSelfie && (
                <p className="text-blue-500 text-xs mb-3 flex items-center justify-center gap-1">
                  <FiCamera className="w-3 h-3" /> A câmera será aberta para tirar a selfie
                </p>
              )}
              <button onClick={() => handlePunch()} disabled={loading}
                className={`w-40 h-40 rounded-full text-white text-lg font-bold shadow-lg active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center mx-auto ${
                  !isOnline
                    ? 'bg-orange-500 hover:bg-orange-600'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}>
                {loading ? (
                  <div className="animate-spin w-8 h-8 border-4 border-white border-t-transparent rounded-full" />
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    {!isOnline
                      ? <FiWifiOff className="w-8 h-8" />
                      : requireSelfie
                        ? <FiCamera className="w-8 h-8" />
                        : <FiClock className="w-8 h-8" />
                    }
                    <span className="text-sm">
                      {!isOnline ? 'PONTO OFFLINE' : requireSelfie ? 'SELFIE + PONTO' : 'BATER PONTO'}
                    </span>
                  </div>
                )}
              </button>
            </>
          )}
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Registros de Hoje</h2>
          {todayEntries.length === 0 ? (
            <p className="text-gray-400 text-center py-4">Nenhum registro ainda.</p>
          ) : (
            <div className="space-y-3">
              {todayEntries.map((entry, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${typeColors[entry.type]}`}>{entry.typeLabel}</span>
                  <span className="text-lg font-mono font-bold text-gray-700">{entry.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>

      {/* Modal Alterar Senha — Funcionário */}
      {showPwdModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <FiLock className="w-5 h-5 text-blue-500" /> Alterar Senha
            </h2>
            <button onClick={closePwdModal} className="text-gray-400 hover:text-red-500 transition">
              <FiX className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleChangePassword} className="p-6 space-y-4">
            {/* Senha atual */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha atual</label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={pwdForm.currentPassword}
                  onChange={e => setPwdForm({ ...pwdForm, currentPassword: e.target.value })}
                  placeholder="••••••"
                  required
                  className="w-full px-4 py-2.5 pr-10 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
                <button type="button" onClick={() => setShowCurrent(v => !v)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                  {showCurrent ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {/* Nova senha */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={pwdForm.newPassword}
                  onChange={e => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  className="w-full px-4 py-2.5 pr-10 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
                <button type="button" onClick={() => setShowNew(v => !v)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                  {showNew ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {/* Confirmar nova senha */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nova senha</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={pwdForm.confirmPassword}
                  onChange={e => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
                  placeholder="Repita a nova senha"
                  required
                  className={`w-full px-4 py-2.5 pr-10 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none text-sm ${
                    pwdForm.confirmPassword && pwdForm.newPassword !== pwdForm.confirmPassword
                      ? 'border-red-400 bg-red-50'
                      : 'border-gray-300'
                  }`}
                />
                <button type="button" onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                  {showConfirm ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                </button>
              </div>
              {pwdForm.confirmPassword && pwdForm.newPassword !== pwdForm.confirmPassword && (
                <p className="text-xs text-red-500 mt-1">As senhas não coincidem</p>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={pwdLoading}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 font-medium transition disabled:opacity-50"
              >
                {pwdLoading ? 'Salvando...' : 'Alterar Senha'}
              </button>
              <button type="button" onClick={closePwdModal}
                className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 font-medium transition">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    </>
  );
}
