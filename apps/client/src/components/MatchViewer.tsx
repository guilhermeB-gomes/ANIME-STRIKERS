import { useEffect, useMemo, useState } from 'react';
import { FastForward, X } from 'lucide-react';
import { getCharacter, type MatchEventView, type MatchResultView } from '@strikers/shared';
import { CharacterCard } from './CharacterCard';

interface Props {
  match: MatchResultView;
  nameOf: (participantId: string) => string;
  onClose: () => void;
}

function prefersReducedMotion(): boolean {
  return document.documentElement.dataset.reduceMotion === 'true' || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** Posição da bola (percentual) a partir do último evento. O mandante ataca para a direita. */
export function ballPosition(event: MatchEventView | undefined, homeId: string): { x: number; y: number } {
  if (!event) return { x: 50, y: 50 };
  const y = 28 + ((event.minute * 13) % 44);
  const home = event.participantId === homeId;
  switch (event.type) {
    case 'ATAQUE':
    case 'CONTRA_ATAQUE':
    case 'PASSE':
    case 'HABILIDADE':
      return { x: home ? 62 : 38, y };
    case 'FINALIZACAO':
      return { x: home ? 88 : 12, y: 50 };
    case 'GOL':
      return { x: home ? 97 : 3, y: 50 };
    case 'DEFESA':
      return { x: home ? 12 : 88, y: 50 };
    default:
      return { x: 50, y: 50 };
  }
}

export function MatchViewer({ match, nameOf, onClose }: Props) {
  const total = match.events.length;
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? total : 0));

  useEffect(() => {
    if (shown >= total) return;
    const next = match.events[shown];
    const delay = next?.type === 'GOL' ? 1100 : next?.type === 'HABILIDADE' ? 500 : 750;
    const id = window.setTimeout(() => setShown((s) => s + 1), delay);
    return () => window.clearTimeout(id);
  }, [shown, total, match.events]);

  const visible = useMemo(() => match.events.slice(0, shown), [match.events, shown]);
  const last = visible[visible.length - 1];
  const homeGoals = visible.filter((e) => e.type === 'GOL' && e.participantId === match.homeId).length;
  const awayGoals = visible.filter((e) => e.type === 'GOL' && e.participantId === match.awayId).length;
  const finished = shown >= total;
  const ball = ballPosition(last, match.homeId);
  const scorers = match.events.filter((e) => e.type === 'GOL');
  const mvp = match.mvpCharacterId ? getCharacter(match.mvpCharacterId) : null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Partida: ${nameOf(match.homeId)} contra ${nameOf(match.awayId)}`}>
      <div className="panel max-h-[94vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-b-none p-4 sm:rounded-b-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-bold text-mist">Rodada {match.round}</p>
          <button type="button" className="btn btn-ghost !min-h-10 !px-3" onClick={onClose} aria-label="Fechar partida">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center" aria-live="polite">
          <p className="truncate font-display text-lg font-black sm:text-2xl">{nameOf(match.homeId)}</p>
          <p className="rounded-xl bg-black/50 px-4 py-2 font-display text-4xl font-black tabular-nums sm:text-5xl" data-testid="scoreboard">
            {homeGoals} <span className="text-mist">x</span> {awayGoals}
          </p>
          <p className="truncate font-display text-lg font-black sm:text-2xl">{nameOf(match.awayId)}</p>
        </div>
        <p className="text-center text-sm font-bold text-neon">{last ? `${last.minute}'` : '0\''}{finished ? ' · Fim de jogo' : ''}</p>

        <div className="pitch relative aspect-[16/8] w-full" aria-hidden="true">
          <div className="circle" />
          <div className="absolute inset-y-[30%] left-0 w-[5%] border-2 border-l-0 border-white/50" />
          <div className="absolute inset-y-[30%] right-0 w-[5%] border-2 border-r-0 border-white/50" />
          <span className="absolute -translate-x-1/2 -translate-y-1/2 text-2xl transition-all duration-500 ease-out" style={{ left: `${ball.x}%`, top: `${ball.y}%` }}>
            ⚽
          </span>
        </div>

        <ol className="max-h-44 space-y-1 overflow-y-auto text-sm" aria-label="Narração da partida" aria-live="polite">
          {[...visible].reverse().map((e, i) => (
            <li key={`${e.minute}-${visible.length - i}`} className={`flex gap-2 rounded px-2 py-1 ${e.type === 'GOL' ? 'bg-gold/20 font-black text-gold' : e.type === 'HABILIDADE' ? 'bg-violet/20 text-violet-200' : 'bg-black/20'} ${i === 0 ? 'pop-in' : ''}`}>
              <span className="w-8 shrink-0 tabular-nums text-mist">{e.minute}'</span>
              <span>{e.text}</span>
            </li>
          ))}
        </ol>

        {!finished ? (
          <button type="button" className="btn btn-ghost w-full" onClick={() => setShown(total)}>
            <FastForward className="h-4 w-4" aria-hidden="true" /> Pular narração
          </button>
        ) : (
          <div className="space-y-4">
            <table className="w-full text-center text-sm" aria-label="Estatísticas da partida">
              <thead className="text-xs text-mist">
                <tr>
                  <th scope="col">{nameOf(match.homeId)}</th>
                  <th scope="col" />
                  <th scope="col">{nameOf(match.awayId)}</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Posse', 'possession', '%'],
                    ['Finalizações', 'shots', ''],
                    ['No alvo', 'onTarget', ''],
                    ['Defesas', 'saves', ''],
                  ] as const
                ).map(([label, key, suffix]) => (
                  <tr key={key} className="border-t border-line/50">
                    <td className="py-1 font-black tabular-nums">{match.stats.home[key]}{suffix}</td>
                    <td className="text-mist">{label}</td>
                    <td className="py-1 font-black tabular-nums">{match.stats.away[key]}{suffix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {scorers.length > 0 && (
              <ul className="space-y-1 text-sm" aria-label="Gols">
                {scorers.map((e, i) => (
                  <li key={i}>
                    ⚽ {e.minute}' <b>{e.characterId ? getCharacter(e.characterId).name : '—'}</b> ({e.participantId ? nameOf(e.participantId) : ''})
                    {e.assistCharacterId && <span className="text-mist"> · assistência de {getCharacter(e.assistCharacterId).name}</span>}
                  </li>
                ))}
              </ul>
            )}
            {mvp && (
              <div className="flex items-center gap-4">
                <CharacterCard character={mvp} size="sm" badge="MVP" />
                <p className="text-sm text-mist">
                  Destaque da partida: <b className="text-white">{mvp.name}</b>
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
