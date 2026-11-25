import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useGame } from '../socket/GameProvider';
import { AuctionView } from './AuctionView';
import { LobbyView } from './LobbyView';
import { TeamView } from './TeamView';
import { TournamentView } from './TournamentView';

/** Escolhe a tela pela fase da sala (controlada pelo servidor). Atualizar a página reconecta e volta aqui. */
export function RoomPage() {
  const { session, room, connection } = useGame();
  const [grace, setGrace] = useState(true);

  useEffect(() => {
    const id = window.setTimeout(() => setGrace(false), 1500);
    return () => window.clearTimeout(id);
  }, []);

  if (!session) return <Navigate to="/" replace />;
  if (!room) {
    if (connection !== 'connected' || grace) {
      return (
        <div className="flex items-center justify-center gap-3 pt-20 text-mist" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Carregando sala…
        </div>
      );
    }
    return <Navigate to="/" replace />;
  }

  switch (room.status) {
    case 'LOBBY':
      return <LobbyView />;
    case 'AUCTION':
      return <AuctionView />;
    case 'TEAM_BUILDING':
      return <TeamView />;
    default:
      return <TournamentView />;
  }
}
