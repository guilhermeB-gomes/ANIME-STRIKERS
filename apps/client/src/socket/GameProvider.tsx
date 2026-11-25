import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  Ack,
  AuctionView,
  Formation,
  Notice,
  RoomCreateInput,
  RoomSettingsInput,
  RoomView,
  TeamView,
  TournamentView,
} from '@strikers/shared';
import { api, ApiError, SERVER_URL } from '../services/api';
import { FRIENDLY } from '../services/messages';
import { storage, type StoredSession } from '../services/storage';
import { useToast } from '../stores/toasts';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting';

interface GameContextValue {
  session: StoredSession | null;
  connection: ConnectionStatus;
  room: RoomView | null;
  auction: AuctionView | null;
  teams: TeamView[];
  tournament: TournamentView | null;
  /** Diferença (ms) entre o relógio do servidor e o do navegador, medida no último evento de leilão. */
  clockOffset: number;
  login: (name: string) => Promise<boolean>;
  logout: () => void;
  createRoom: (input: RoomCreateInput) => Promise<Ack<{ code: string }>>;
  joinRoom: (code: string) => Promise<Ack<{ code: string }>>;
  leaveRoom: () => Promise<Ack>;
  updateSettings: (input: RoomSettingsInput) => Promise<Ack>;
  startGame: () => Promise<Ack>;
  bid: (amount: number) => Promise<Ack<{ amount: number }>>;
  setLineup: (formation: Formation, lineup: (string | null)[]) => Promise<Ack>;
  startTournament: () => Promise<Ack>;
  playRound: (all: boolean) => Promise<Ack>;
}

const GameContext = createContext<GameContextValue | null>(null);

const ACK_TIMEOUT_MS = 8000;

export function GameProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [session, setSession] = useState<StoredSession | null>(() => storage.getSession());
  const [connection, setConnection] = useState<ConnectionStatus>('idle');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [auction, setAuction] = useState<AuctionView | null>(null);
  const [teams, setTeams] = useState<TeamView[]>([]);
  const [tournament, setTournament] = useState<TournamentView | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const hadRoom = useRef(false);

  const clearGame = useCallback(() => {
    setRoom(null);
    setAuction(null);
    setTeams([]);
    setTournament(null);
  }, []);

  const logout = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    storage.clearSession();
    setSession(null);
    setConnection('idle');
    clearGame();
  }, [clearGame]);

  useEffect(() => {
    if (!session) return;
    setConnection('connecting');
    const socket = io(SERVER_URL || undefined, { auth: { token: session.token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnection('connected'));
    socket.on('disconnect', () => setConnection('reconnecting'));
    socket.on('connect_error', (err) => {
      if (err.message === 'UNAUTHENTICATED') {
        toast('error', FRIENDLY.UNAUTHENTICATED);
        logout();
      } else {
        setConnection('reconnecting');
      }
    });
    socket.on('room:state', (r: RoomView) => {
      hadRoom.current = true;
      setRoom(r);
    });
    socket.on('auction:state', (a: AuctionView | null) => {
      if (a) setClockOffset(a.serverNow - Date.now());
      setAuction(a);
    });
    socket.on('teams:state', (t: TeamView[]) => setTeams(t));
    socket.on('tournament:state', (t: TournamentView | null) => setTournament(t));
    socket.on('room:closed', () => {
      if (hadRoom.current) toast('warning', 'A sala não está mais disponível.');
      hadRoom.current = false;
      clearGame();
    });
    socket.on('notice', (n: Notice) => toast(n.kind, n.message));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [session, toast, logout, clearGame]);

  const call = useCallback(
    <T,>(event: string, payload: unknown): Promise<Ack<T>> =>
      new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) {
          const res: Ack<T> = { ok: false, error: { code: 'INTERNAL', message: 'Sem conexão com o servidor. Aguarde a reconexão.' } };
          toast('error', res.error.message);
          resolve(res);
          return;
        }
        const timer = window.setTimeout(() => {
          const res: Ack<T> = { ok: false, error: { code: 'INTERNAL', message: 'O servidor demorou para responder. Tente de novo.' } };
          toast('error', res.error.message);
          resolve(res);
        }, ACK_TIMEOUT_MS);
        socket.emit(event, payload, (res: Ack<T>) => {
          window.clearTimeout(timer);
          if (!res.ok) toast('error', res.error.message || FRIENDLY[res.error.code]);
          resolve(res);
        });
      }),
    [toast],
  );

  const login = useCallback(
    async (name: string) => {
      try {
        const { player, token } = await api.createGuest(name);
        const next: StoredSession = { token, playerId: player.id, name: player.name };
        storage.setSession(next);
        storage.setPrefs({ ...storage.getPrefs(), lastName: player.name });
        setSession(next);
        return true;
      } catch (error) {
        toast('error', error instanceof ApiError ? error.message : 'Não foi possível entrar agora.');
        return false;
      }
    },
    [toast],
  );

  const value = useMemo<GameContextValue>(
    () => ({
      session,
      connection,
      room,
      auction,
      teams,
      tournament,
      clockOffset,
      login,
      logout,
      createRoom: (input) => call<{ code: string }>('room:create', input),
      joinRoom: (code) => call<{ code: string }>('room:join', { code }),
      leaveRoom: async () => {
        const res = await call<undefined>('room:leave', {});
        if (res.ok) {
          hadRoom.current = false;
          clearGame();
        }
        return res;
      },
      updateSettings: (input) => call<undefined>('room:settings', input),
      startGame: () => call<undefined>('room:start', {}),
      bid: (amount) => (auction ? call<{ amount: number }>('auction:bid', { auctionId: auction.id, amount }) : Promise.resolve({ ok: false, error: { code: 'AUCTION_CLOSED', message: 'Não há leilão ativo.' } } as Ack<{ amount: number }>)),
      setLineup: (formation, lineup) => call<undefined>('team:setLineup', { formation, lineup }),
      startTournament: () => call<undefined>('tournament:start', {}),
      playRound: (all) => call<undefined>('tournament:playRound', { all }),
    }),
    [session, connection, room, auction, teams, tournament, clockOffset, login, logout, call, clearGame],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame fora do GameProvider');
  return ctx;
}
