import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bot, DoorOpen, Gamepad2, Info, LogOut, Play, Plus, Settings, Trophy } from 'lucide-react';
import type { BotLevel } from '@strikers/shared';
import { Logo } from '../components/Logo';
import { NameForm } from '../components/NameForm';
import { api, type MatchHistoryEntry } from '../services/api';
import { useGame } from '../socket/GameProvider';

const LEVELS: { value: BotLevel; label: string }[] = [
  { value: 'FACIL', label: 'Fácil' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'DIFICIL', label: 'Difícil' },
];

function LevelSelect({ value, onChange, id }: { value: BotLevel; onChange: (v: BotLevel) => void; id: string }) {
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value as BotLevel)}>
      {LEVELS.map((l) => (
        <option key={l.value} value={l.value}>
          {l.label}
        </option>
      ))}
    </select>
  );
}

export function HomePage() {
  const { session, room, createRoom, joinRoom, logout, connection } = useGame();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [botCount, setBotCount] = useState(3);
  const [botLevel, setBotLevel] = useState<BotLevel>('NORMAL');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [roomBots, setRoomBots] = useState(0);
  const [roomLevel, setRoomLevel] = useState<BotLevel>('NORMAL');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ wins: number; draws: number; losses: number } | null>(null);
  const [history, setHistory] = useState<MatchHistoryEntry[]>([]);

  useEffect(() => {
    if (!session) return;
    api
      .me(session.token)
      .then((r) => {
        setStats(r.player);
        setHistory(r.history.slice(0, 5));
      })
      .catch(() => setStats(null));
  }, [session, room?.status]);

  const playSolo = async (opponents: number, level: BotLevel, key: string) => {
    setBusy(key);
    const res = await createRoom({ mode: 'solo', maxPlayers: opponents + 1, botSlots: opponents, botLevel: level });
    setBusy(null);
    if (res.ok) navigate('/sala');
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('room');
    const res = await createRoom({ mode: 'multi', maxPlayers, botSlots: Math.min(roomBots, maxPlayers - 1), botLevel: roomLevel });
    setBusy(null);
    if (res.ok) navigate('/sala');
  };

  const join = async (e: FormEvent) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean.length !== 5) {
      setCodeError('O código tem 5 caracteres.');
      return;
    }
    setCodeError(null);
    setBusy('join');
    const res = await joinRoom(clean);
    setBusy(null);
    if (res.ok) navigate('/sala');
    else setCodeError(res.error.message);
  };

  const ready = connection === 'connected';

  return (
    <div className="space-y-8 pt-8">
      <section className="flex flex-col items-center gap-4 text-center">
        <Logo />
        <p className="max-w-xl text-base text-mist sm:text-lg">Dispute personagens de anime em leilões em tempo real, monte seu time de 5 e vença o campeonato.</p>
      </section>

      {!session ? (
        <div className="mx-auto w-full max-w-md">
          <NameForm />
        </div>
      ) : (
        <>
          {room && (
            <div className="panel mx-auto flex max-w-2xl flex-col items-center justify-between gap-3 border-neon/60 p-4 sm:flex-row">
              <p className="text-sm font-semibold">
                {room.status === 'FINISHED' ? 'Seu campeonato terminou' : 'Você tem uma partida em andamento'} · sala <span className="font-black tracking-widest text-neon">{room.code}</span>
              </p>
              <Link to="/sala" className="btn btn-primary">
                <Play className="h-4 w-4" aria-hidden="true" />
                {room.status === 'FINISHED' ? 'Ver resultado' : 'Voltar à partida'}
              </Link>
            </div>
          )}

          <div className="mx-auto flex max-w-2xl flex-col items-center gap-3">
            <button type="button" className="btn btn-primary w-full !min-h-16 text-2xl font-display italic sm:w-auto sm:px-20" disabled={!ready || busy !== null || room !== null} onClick={() => void playSolo(3, 'NORMAL', 'quick')}>
              <Gamepad2 className="h-6 w-6" aria-hidden="true" />
              {busy === 'quick' ? 'Criando partida…' : 'JOGAR'}
            </button>
            <p className="text-center text-xs text-mist">{room ? 'Termine ou saia da partida atual para começar outra.' : 'Partida rápida: você contra 3 bots (nível normal).'}</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <form onSubmit={(e) => void create(e)} className="panel space-y-3 p-5" aria-labelledby="create-title">
              <h2 id="create-title" className="flex items-center gap-2 font-display text-lg font-black">
                <Plus className="h-5 w-5 text-neon" aria-hidden="true" /> Criar sala
              </h2>
              <p className="text-sm text-mist">Sala privada com código para convidar amigos.</p>
              <label className="block text-sm font-bold">
                Participantes (2 a 8)
                <input className="input mt-1" type="number" min={2} max={8} value={maxPlayers} onChange={(e) => setMaxPlayers(Math.max(2, Math.min(8, Number(e.target.value) || 2)))} />
              </label>
              <label className="block text-sm font-bold">
                Vagas preenchidas por bots
                <input className="input mt-1" type="number" min={0} max={maxPlayers - 1} value={Math.min(roomBots, maxPlayers - 1)} onChange={(e) => setRoomBots(Math.max(0, Math.min(maxPlayers - 1, Number(e.target.value) || 0)))} />
              </label>
              <label className="block text-sm font-bold" htmlFor="room-level">
                Nível dos bots
              </label>
              <LevelSelect id="room-level" value={roomLevel} onChange={setRoomLevel} />
              <button type="submit" className="btn btn-primary w-full" disabled={!ready || busy !== null || room !== null}>
                {busy === 'room' ? 'Criando…' : 'Criar sala'}
              </button>
            </form>

            <form onSubmit={(e) => void join(e)} className="panel space-y-3 p-5" aria-labelledby="join-title" noValidate>
              <h2 id="join-title" className="flex items-center gap-2 font-display text-lg font-black">
                <DoorOpen className="h-5 w-5 text-magenta" aria-hidden="true" /> Entrar em sala
              </h2>
              <p className="text-sm text-mist">Digite o código que seu amigo enviou.</p>
              <label className="block text-sm font-bold">
                Código da sala
                <input className="input mt-1 text-center font-display text-2xl uppercase tracking-[0.4em]" value={code} maxLength={5} onChange={(e) => setCode(e.target.value.toUpperCase())} aria-invalid={codeError !== null} aria-describedby="code-error" placeholder="ABCDE" autoComplete="off" />
              </label>
              <p id="code-error" role="alert" className="min-h-5 text-sm font-semibold text-rose-300">
                {codeError}
              </p>
              <button type="submit" className="btn btn-primary w-full" disabled={!ready || busy !== null || room !== null}>
                {busy === 'join' ? 'Entrando…' : 'Entrar'}
              </button>
            </form>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void playSolo(botCount, botLevel, 'bots');
              }}
              className="panel space-y-3 p-5"
              aria-labelledby="bots-title"
            >
              <h2 id="bots-title" className="flex items-center gap-2 font-display text-lg font-black">
                <Bot className="h-5 w-5 text-gold" aria-hidden="true" /> Jogar contra bots
              </h2>
              <p className="text-sm text-mist">Você disputa o leilão contra adversários controlados por IA.</p>
              <label className="block text-sm font-bold">
                Adversários (1 a 7)
                <input className="input mt-1" type="number" min={1} max={7} value={botCount} onChange={(e) => setBotCount(Math.max(1, Math.min(7, Number(e.target.value) || 1)))} />
              </label>
              <label className="block text-sm font-bold" htmlFor="bots-level">
                Dificuldade
              </label>
              <LevelSelect id="bots-level" value={botLevel} onChange={setBotLevel} />
              <button type="submit" className="btn btn-gold w-full" disabled={!ready || busy !== null || room !== null}>
                {busy === 'bots' ? 'Criando…' : 'Começar contra bots'}
              </button>
            </form>
          </div>

          <section className="panel p-5" aria-labelledby="stats-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="stats-title" className="flex items-center gap-2 font-display text-lg font-black">
                <Trophy className="h-5 w-5 text-gold" aria-hidden="true" /> {session.name}
              </h2>
              <dl className="flex gap-4 text-center text-sm">
                {[
                  ['Vitórias', stats?.wins ?? 0],
                  ['Empates', stats?.draws ?? 0],
                  ['Derrotas', stats?.losses ?? 0],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-mist">{label}</dt>
                    <dd className="font-display text-xl font-black">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {history.length > 0 ? (
              <ul className="mt-4 divide-y divide-line/60 text-sm" aria-label="Últimas partidas">
                {history.map((h) => (
                  <li key={h.matchId} className="flex items-center justify-between gap-3 py-2">
                    <span className="truncate">
                      {h.homeName} <b className="tabular-nums">{h.homeGoals} x {h.awayGoals}</b> {h.awayName}
                    </span>
                    <span className={`rounded px-2 py-0.5 text-xs font-black ${h.result === 'V' ? 'bg-emerald-500/25 text-emerald-200' : h.result === 'D' ? 'bg-rose-500/25 text-rose-200' : 'bg-slate-500/30 text-slate-200'}`}>{h.result === 'V' ? 'Vitória' : h.result === 'D' ? 'Derrota' : 'Empate'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-mist">Seu histórico aparece aqui depois do primeiro campeonato.</p>
            )}
          </section>
        </>
      )}

      <nav className="flex flex-wrap items-center justify-center gap-3" aria-label="Mais opções">
        <Link to="/como-jogar" className="btn btn-ghost">
          <Info className="h-4 w-4" aria-hidden="true" /> Como jogar
        </Link>
        <Link to="/configuracoes" className="btn btn-ghost">
          <Settings className="h-4 w-4" aria-hidden="true" /> Configurações
        </Link>
        {session && (
          <button type="button" className="btn btn-ghost" onClick={logout}>
            <LogOut className="h-4 w-4" aria-hidden="true" /> Trocar de treinador
          </button>
        )}
      </nav>
    </div>
  );
}
