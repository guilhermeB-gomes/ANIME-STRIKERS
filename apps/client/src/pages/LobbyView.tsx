import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Check, Copy, Crown, LogOut, Play, Wifi, WifiOff } from 'lucide-react';
import type { BotLevel } from '@strikers/shared';
import { useGame } from '../socket/GameProvider';
import { useToast } from '../stores/toasts';

export function LobbyView() {
  const { room, leaveRoom, startGame, updateSettings } = useGame();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(room?.maxPlayers ?? 4);
  const [botSlots, setBotSlots] = useState(room?.botSlots ?? 0);
  const [botLevel, setBotLevel] = useState<BotLevel>(room?.botLevel ?? 'NORMAL');
  if (!room) return null;

  const isHost = room.hostId === room.youId;
  const humanCapacity = room.maxPlayers - room.botSlots;
  const humans = room.participants.filter((p) => !p.isBot).length;
  const emptySlots = Math.max(0, humanCapacity - humans);
  const inviteUrl = `${window.location.origin}/entrar/${room.code}`;
  const canStart = isHost && room.participants.length >= 2;

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast('success', 'Convite copiado! Envie para seus amigos.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('warning', `Não foi possível copiar automaticamente. Link: ${inviteUrl}`);
    }
  };

  const apply = async () => {
    setBusy(true);
    await updateSettings({ maxPlayers, botSlots: Math.min(botSlots, maxPlayers - 1), botLevel });
    setBusy(false);
  };

  return (
    <div className="space-y-5 pt-2">
      <section className="panel flex flex-col items-center gap-3 p-6 text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-mist">Código da sala</p>
        <p className="font-display text-6xl font-black tracking-[0.3em] text-neon sm:text-7xl" data-testid="room-code" aria-label={`Código da sala: ${room.code.split('').join(' ')}`}>
          {room.code}
        </p>
        <button type="button" className="btn btn-ghost" onClick={() => void copyInvite()}>
          {copied ? <Check className="h-4 w-4 text-emerald-300" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          Copiar convite
        </button>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="panel p-5" aria-labelledby="players-title">
          <h2 id="players-title" className="mb-3 font-display text-lg font-black">
            Participantes ({room.participants.length}/{room.maxPlayers})
          </h2>
          <ul className="space-y-2">
            {room.participants.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line/70 bg-ink-800/60 px-3 py-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet to-neon font-display text-lg font-black text-white" aria-hidden="true">
                  {p.isBot ? <Bot className="h-5 w-5" /> : p.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 font-bold">
                    <span className="truncate">{p.name}</span>
                    {p.isHost && (
                      <span className="inline-flex items-center gap-1 rounded bg-gold/20 px-1.5 text-xs text-gold">
                        <Crown className="h-3 w-3" aria-hidden="true" /> Anfitrião
                      </span>
                    )}
                    {p.id === room.youId && <span className="rounded bg-neon/20 px-1.5 text-xs text-neon">Você</span>}
                    {p.isBot && <span className="rounded bg-violet/25 px-1.5 text-xs text-violet-200">Bot · {p.botLevel === 'FACIL' ? 'Fácil' : p.botLevel === 'DIFICIL' ? 'Difícil' : 'Normal'}</span>}
                  </span>
                  <span className="text-xs text-mist">Orçamento {p.budget} M</span>
                </span>
                <span className={`flex items-center gap-1 text-xs font-bold ${p.connected ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {p.connected ? <Wifi className="h-4 w-4" aria-hidden="true" /> : <WifiOff className="h-4 w-4" aria-hidden="true" />}
                  {p.connected ? 'Conectado' : 'Desconectado'}
                </span>
              </li>
            ))}
            {Array.from({ length: emptySlots }, (_, i) => (
              <li key={`empty-${i}`} className="rounded-xl border border-dashed border-line px-3 py-3 text-center text-sm text-mist">
                Vaga aberta — aguardando jogador
              </li>
            ))}
          </ul>
        </section>

        <section className="panel space-y-3 p-5" aria-labelledby="settings-title">
          <h2 id="settings-title" className="font-display text-lg font-black">
            Configurações da sala
          </h2>
          <label className="block text-sm font-bold">
            Participantes (2 a 8)
            <input className="input mt-1" type="number" min={2} max={8} disabled={!isHost} value={maxPlayers} onChange={(e) => setMaxPlayers(Math.max(2, Math.min(8, Number(e.target.value) || 2)))} />
          </label>
          <label className="block text-sm font-bold">
            Vagas de bots
            <input className="input mt-1" type="number" min={0} max={maxPlayers - 1} disabled={!isHost} value={Math.min(botSlots, maxPlayers - 1)} onChange={(e) => setBotSlots(Math.max(0, Math.min(maxPlayers - 1, Number(e.target.value) || 0)))} />
          </label>
          <label className="block text-sm font-bold">
            Nível dos bots
            <select className="input mt-1" disabled={!isHost} value={botLevel} onChange={(e) => setBotLevel(e.target.value as BotLevel)}>
              <option value="FACIL">Fácil</option>
              <option value="NORMAL">Normal</option>
              <option value="DIFICIL">Difícil</option>
            </select>
          </label>
          {isHost ? (
            <button type="button" className="btn btn-ghost w-full" disabled={busy} onClick={() => void apply()}>
              Aplicar configurações
            </button>
          ) : (
            <p className="text-xs text-mist">Só o anfitrião altera as configurações.</p>
          )}
        </section>
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          className="btn btn-danger"
          onClick={() =>
            void leaveRoom().then((res) => {
              if (res.ok) navigate('/');
            })
          }
        >
          <LogOut className="h-4 w-4" aria-hidden="true" /> Sair da sala
        </button>
        {isHost ? (
          <div className="text-center sm:text-right">
            <button
              type="button"
              className="btn btn-primary !min-h-14 px-10 text-lg"
              disabled={!canStart || busy}
              onClick={() => {
                setBusy(true);
                void startGame().then(() => setBusy(false));
              }}
            >
              <Play className="h-5 w-5" aria-hidden="true" /> Iniciar leilão
            </button>
            {!canStart && <p className="mt-1 text-xs text-amber-200">São necessários pelo menos 2 participantes. Convide alguém ou adicione bots.</p>}
          </div>
        ) : (
          <p className="text-center text-sm text-mist" role="status">
            Aguardando o anfitrião iniciar a partida…
          </p>
        )}
      </div>
    </div>
  );
}
