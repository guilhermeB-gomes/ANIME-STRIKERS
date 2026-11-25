import { Loader2, WifiOff } from 'lucide-react';
import type { ConnectionStatus } from '../socket/GameProvider';

export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  if (status === 'connected' || status === 'idle') return null;
  const reconnecting = status === 'reconnecting';
  return (
    <div role="status" className={`flex items-center justify-center gap-2 px-3 py-2 text-sm font-bold ${reconnecting ? 'bg-amber-500/20 text-amber-100' : 'bg-cyan-500/15 text-cyan-100'}`}>
      {reconnecting ? <WifiOff className="h-4 w-4" aria-hidden="true" /> : <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {reconnecting ? 'Conexão perdida. Reconectando… o jogo continua para os outros jogadores.' : 'Conectando ao servidor…'}
    </div>
  );
}
