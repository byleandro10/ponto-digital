/**
 * InstallPWA — botão "Instalar App" que aparece quando o navegador dispara
 * o evento beforeinstallprompt (Android/Desktop Chrome/Edge).
 */
import { useState, useEffect } from 'react';
import { FiDownload, FiX } from 'react-icons/fi';

export default function InstallPWA() {
  const [prompt, setPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('pwa-install-dismissed') === 'true'
  );
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Detecta se já está instalado (standalone)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setInstalled(true));

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setPrompt(null);
  }

  function handleDismiss() {
    localStorage.setItem('pwa-install-dismissed', 'true');
    setDismissed(true);
  }

  if (installed || dismissed || !prompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-80">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
          <FiDownload className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm">Instalar Ponto Digital</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Adicione à tela inicial para bater ponto offline, a qualquer hora.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleInstall}
              className="flex-1 bg-blue-600 text-white text-xs font-semibold py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Instalar
            </button>
            <button
              onClick={handleDismiss}
              className="flex-1 bg-gray-100 text-gray-600 text-xs font-semibold py-2 rounded-lg hover:bg-gray-200 transition"
            >
              Agora não
            </button>
          </div>
        </div>
        <button onClick={handleDismiss} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
          <FiX className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
