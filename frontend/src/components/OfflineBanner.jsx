/**
 * OfflineBanner — exibe status de conexão e fila de pontos offline
 */
import { FiWifiOff, FiRefreshCw, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';

export default function OfflineBanner({ isOnline, pendingCount, isSyncing, onSync }) {
  // Online e sem pendentes → sem banner
  if (isOnline && pendingCount === 0) return null;

  return (
    <div className={`
      flex items-center gap-3 px-4 py-2.5 text-sm font-medium
      ${!isOnline
        ? 'bg-orange-500 text-white'
        : pendingCount > 0
          ? 'bg-yellow-500 text-white'
          : 'bg-green-500 text-white'
      }
    `}>
      {!isOnline ? (
        <>
          <FiWifiOff className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">
            Sem conexão — ponto será salvo e enviado quando voltar online
            {pendingCount > 0 && ` (${pendingCount} pendente${pendingCount > 1 ? 's' : ''})`}
          </span>
        </>
      ) : isSyncing ? (
        <>
          <FiRefreshCw className="w-4 h-4 flex-shrink-0 animate-spin" />
          <span className="flex-1">Sincronizando {pendingCount} registro{pendingCount > 1 ? 's' : ''} offline...</span>
        </>
      ) : (
        <>
          <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">
            {pendingCount} registro{pendingCount > 1 ? 's' : ''} offline aguardando envio
          </span>
          <button
            onClick={onSync}
            className="flex items-center gap-1 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition text-xs font-semibold"
          >
            <FiRefreshCw className="w-3 h-3" /> Sincronizar
          </button>
        </>
      )}
    </div>
  );
}
