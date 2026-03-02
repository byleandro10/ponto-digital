import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { FiSave, FiCamera, FiMapPin, FiLock, FiEye, FiEyeOff, FiX, FiImage, FiTrash2, FiUpload } from 'react-icons/fi';
import AdminLayout from '../../components/AdminLayout';
import { useAuth } from '../../contexts/AuthContext';

export default function Settings() {
  const { user, updateCompanyLogo } = useAuth();
  const [config, setConfig] = useState({ requireSelfie: false, geofenceMode: 'off' });
  const [loading, setLoading] = useState(true);

  // Estado do logo
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoLoading, setLogoLoading] = useState(false);
  const logoInputRef = useRef(null);

  // Estado do modal de alterar senha
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwdLoading, setPwdLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => { fetchConfig(); }, []);

  useEffect(() => {
    // Carrega preview da logo atual salva no contexto
    if (user?.company?.logoUrl) setLogoPreview(user.company.logoUrl);
  }, [user?.company?.logoUrl]);

  async function fetchConfig() {
    try {
      const res = await api.get('/geofences/config');
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

  function onLogoFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      return toast.error('Selecione um arquivo de imagem (PNG, JPG, SVG, WEBP).');
    }
    if (file.size > 600_000) {
      return toast.error('Imagem muito grande. Máximo 600 KB.');
    }
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function handleUploadLogo() {
    if (!logoPreview || logoPreview === user?.company?.logoUrl) return;
    setLogoLoading(true);
    try {
      const res = await api.put('/geofences/logo', { logoBase64: logoPreview });
      updateCompanyLogo(res.data.logoUrl);
      toast.success('Logo salva com sucesso!');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao salvar logo');
    } finally {
      setLogoLoading(false);
    }
  }

  async function handleRemoveLogo() {
    setLogoLoading(true);
    try {
      await api.delete('/geofences/logo');
      updateCompanyLogo(null);
      setLogoPreview(null);
      if (logoInputRef.current) logoInputRef.current.value = '';
      toast.success('Logo removida.');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao remover logo');
    } finally {
      setLogoLoading(false);
    }
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
      await api.put('/auth/change-password/admin', {
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

  const geofenceModes = [
    { value: 'off',   label: 'Desligado', desc: 'Geofencing não será verificado',                           icon: '🔵' },
    { value: 'warn',  label: 'Avisar',    desc: 'Registra o ponto, mas avisa que está fora da cerca',       icon: '🟡' },
    { value: 'block', label: 'Bloquear',  desc: 'Impede o registro de ponto fora da cerca',                 icon: '🔴' },
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
              <input type="checkbox" checked={config.requireSelfie}
                onChange={e => setConfig({ ...config, requireSelfie: e.target.checked })}
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
                  onChange={e => setConfig({ ...config, geofenceMode: e.target.value })}
                  className="mt-1" />
                <div>
                  <span className="font-medium text-gray-800">{mode.icon} {mode.label}</span>
                  <p className="text-sm text-gray-500">{mode.desc}</p>
                </div>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Configure as cercas em <Link to="/admin/geofences" className="text-blue-500 underline">Cercas Virtuais</Link>
          </p>
        </div>

        {/* Logomarca da Empresa */}
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="bg-indigo-100 p-2 rounded-lg"><FiImage className="w-5 h-5 text-indigo-600" /></div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Logomarca da Empresa</h2>
              <p className="text-sm text-gray-500">Aparece no sidebar e na tela de ponto dos funcionários</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start gap-5">
            {/* Preview */}
            <div
              className="w-28 h-28 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden cursor-pointer hover:border-indigo-400 transition flex-shrink-0"
              onClick={() => logoInputRef.current?.click()}
              title="Clique para selecionar imagem"
            >
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-2" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-gray-300">
                  <FiImage className="w-8 h-8" />
                  <span className="text-xs">Sem logo</span>
                </div>
              )}
            </div>

            {/* Ações */}
            <div className="flex flex-col gap-2 flex-1">
              <p className="text-xs text-gray-400 mb-1">PNG, JPG, SVG ou WEBP • Máx. 600 KB • Recomendado: 200×200px</p>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={onLogoFileChange}
                className="hidden"
              />
              <button
                onClick={() => logoInputRef.current?.click()}
                className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium px-4 py-2 rounded-lg transition text-sm w-fit"
              >
                <FiUpload className="w-4 h-4" /> Selecionar imagem
              </button>

              {logoPreview && logoPreview !== user?.company?.logoUrl && (
                <button
                  onClick={handleUploadLogo}
                  disabled={logoLoading}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 rounded-lg transition text-sm w-fit disabled:opacity-50"
                >
                  <FiSave className="w-4 h-4" /> {logoLoading ? 'Salvando...' : 'Salvar logo'}
                </button>
              )}

              {user?.company?.logoUrl && (
                <button
                  onClick={handleRemoveLogo}
                  disabled={logoLoading}
                  className="flex items-center gap-2 text-red-500 hover:text-red-700 text-sm font-medium px-2 py-1 w-fit transition disabled:opacity-50"
                >
                  <FiTrash2 className="w-4 h-4" /> Remover logo
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Segurança — Alterar Senha */}
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-red-100 p-2 rounded-lg"><FiLock className="w-5 h-5 text-red-600" /></div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Segurança</h2>
              <p className="text-sm text-gray-500">Altere a senha da sua conta de administrador</p>
            </div>
          </div>
          <button
            onClick={() => setShowPwdModal(true)}
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-4 py-2.5 rounded-lg transition text-sm"
          >
            <FiLock className="w-4 h-4" /> Alterar Senha
          </button>
        </div>

        {/* Save */}
        <button onClick={handleSave}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 transition font-bold text-lg shadow">
          <FiSave /> Salvar Configurações
        </button>
      </div>

      {/* Modal Alterar Senha */}
      {showPwdModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <FiLock className="w-5 h-5 text-red-500" /> Alterar Senha
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
                {/* Barra de força da senha */}
                {pwdForm.newPassword && (
                  <div className="mt-1.5">
                    <div className="flex gap-1 h-1">
                      {[1, 2, 3, 4].map(i => {
                        const strength = [
                          pwdForm.newPassword.length >= 6,
                          pwdForm.newPassword.length >= 10,
                          /[A-Z]/.test(pwdForm.newPassword) && /[0-9]/.test(pwdForm.newPassword),
                          /[^A-Za-z0-9]/.test(pwdForm.newPassword),
                        ].filter(Boolean).length;
                        const colors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-green-500'];
                        return <div key={i} className={`flex-1 rounded-full ${i <= strength ? colors[strength - 1] : 'bg-gray-200'}`} />;
                      })}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {[
                        pwdForm.newPassword.length >= 6,
                        pwdForm.newPassword.length >= 10,
                        /[A-Z]/.test(pwdForm.newPassword) && /[0-9]/.test(pwdForm.newPassword),
                        /[^A-Za-z0-9]/.test(pwdForm.newPassword),
                      ].filter(Boolean).length <= 1 ? 'Fraca' :
                       [
                        pwdForm.newPassword.length >= 6,
                        pwdForm.newPassword.length >= 10,
                        /[A-Z]/.test(pwdForm.newPassword) && /[0-9]/.test(pwdForm.newPassword),
                        /[^A-Za-z0-9]/.test(pwdForm.newPassword),
                       ].filter(Boolean).length === 2 ? 'Razoável' :
                       [
                        pwdForm.newPassword.length >= 6,
                        pwdForm.newPassword.length >= 10,
                        /[A-Z]/.test(pwdForm.newPassword) && /[0-9]/.test(pwdForm.newPassword),
                        /[^A-Za-z0-9]/.test(pwdForm.newPassword),
                       ].filter(Boolean).length === 3 ? 'Boa' : 'Forte'}
                    </p>
                  </div>
                )}
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
    </AdminLayout>
  );
}
