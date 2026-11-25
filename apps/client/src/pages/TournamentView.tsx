import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FastForward, Home, Play, Trophy } from 'lucide-react';
import { getCharacter, type MatchResultView } from '@strikers/shared';
import { MatchViewer } from '../components/MatchViewer';
import { CharacterCard } from '../components/CharacterCard';
import { useGame } from '../socket/GameProvider';

export function TournamentView() {
  const { room, tournament, teams, playRound, leaveRoom } = useGame();
  const navigate = useNavigate();
  const [watching, setWatching] = useState<MatchResultView | null>(null);
  const [busy, setBusy] = useState(false);
  if (!room || !tournament) {
    return (
      <p className="pt-16 text-center text-mist" role="status">
        Preparando o campeonato…
      </p>
    );
  }

  const isHost = room.hostId === room.youId;
  const nameOf = (id: string) => room.participants.find((p) => p.id === id)?.name ?? '?';
  const finished = tournament.status === 'FINISHED';
  const champion = tournament.standings[0];
  const rounds = Array.from({ length: tournament.totalRounds }, (_, i) => i + 1);
  const run = async (all: boolean) => {
    setBusy(true);
    await playRound(all);
    setBusy(false);
  };
  const championTeam = champion ? teams.find((t) => t.participantId === champion.participantId) : undefined;
  const topStar = championTeam?.roster.map((r) => getCharacter(r.characterId)).sort((a, b) => b.ovr - a.ovr)[0];

  return (
    <div className="space-y-5 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-black">Campeonato</h1>
          <p className="text-sm text-mist" data-testid="round-progress">
            Rodada {tournament.roundsPlayed} de {tournament.totalRounds} · pontos corridos, turno único
          </p>
        </div>
        {!finished && isHost && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(false)}>
              <Play className="h-4 w-4" aria-hidden="true" /> Simular próxima rodada
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run(true)}>
              <FastForward className="h-4 w-4" aria-hidden="true" /> Simular tudo
            </button>
          </div>
        )}
        {!finished && !isHost && <p className="text-sm text-mist">Aguardando o anfitrião simular as rodadas…</p>}
      </div>

      {finished && champion && (
        <section className="panel pop-in flex flex-col items-center gap-4 border-gold/60 p-6 text-center sm:flex-row sm:text-left" aria-label="Campeão" data-testid="champion">
          <Trophy className="h-14 w-14 shrink-0 text-gold" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-bold uppercase tracking-widest text-mist">Campeão</p>
            <p className="font-display text-4xl font-black text-gold">{nameOf(champion.participantId)}</p>
            <p className="text-sm text-mist">
              {champion.points} pontos · {champion.wins}V {champion.draws}E {champion.losses}D · saldo {champion.goalDiff}
            </p>
          </div>
          {topStar && <CharacterCard character={topStar} size="sm" badge="Craque" />}
        </section>
      )}

      <section className="panel overflow-x-auto p-4" aria-labelledby="table-title">
        <h2 id="table-title" className="mb-2 font-display text-lg font-black">
          Classificação
        </h2>
        <table className="w-full min-w-[30rem] text-sm" data-testid="standings">
          <thead className="text-xs uppercase text-mist">
            <tr>
              <th scope="col" className="w-8 text-left">#</th>
              <th scope="col" className="text-left">Treinador</th>
              <th scope="col">P</th>
              <th scope="col">J</th>
              <th scope="col">V</th>
              <th scope="col">E</th>
              <th scope="col">D</th>
              <th scope="col">GP</th>
              <th scope="col">GC</th>
              <th scope="col">SG</th>
            </tr>
          </thead>
          <tbody>
            {tournament.standings.map((s, i) => (
              <tr key={s.participantId} className={`border-t border-line/50 text-center ${s.participantId === room.youId ? 'bg-neon/10' : ''}`}>
                <td className="py-2 text-left font-black text-gold">{i + 1}</td>
                <th scope="row" className="py-2 text-left font-bold">
                  {nameOf(s.participantId)}
                  {s.participantId === room.youId && <span className="ml-1 text-xs text-neon">(você)</span>}
                </th>
                <td className="font-black tabular-nums text-white">{s.points}</td>
                <td className="tabular-nums">{s.played}</td>
                <td className="tabular-nums">{s.wins}</td>
                <td className="tabular-nums">{s.draws}</td>
                <td className="tabular-nums">{s.losses}</td>
                <td className="tabular-nums">{s.goalsFor}</td>
                <td className="tabular-nums">{s.goalsAgainst}</td>
                <td className="tabular-nums">{s.goalDiff > 0 ? `+${s.goalDiff}` : s.goalDiff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-3" aria-labelledby="rounds-title">
        <h2 id="rounds-title" className="font-display text-lg font-black">
          Rodadas e resultados
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {rounds.map((round) => (
            <div key={round} className="panel p-3">
              <h3 className="mb-2 text-xs font-bold uppercase text-mist">Rodada {round}</h3>
              <ul className="space-y-1.5">
                {tournament.fixtures
                  .filter((f) => f.round === round)
                  .map((f) => {
                    const match = tournament.matches.find((m) => m.id === f.matchId);
                    return (
                      <li key={`${f.homeId}-${f.awayId}`} className="flex items-center justify-between gap-2 rounded-lg bg-black/25 px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">
                          {nameOf(f.homeId)} <b className="mx-1 tabular-nums text-gold">{match ? `${match.homeGoals} x ${match.awayGoals}` : 'x'}</b> {nameOf(f.awayId)}
                        </span>
                        {match ? (
                          <button type="button" className="btn btn-ghost !min-h-9 !px-3 text-xs" onClick={() => setWatching(match)} aria-label={`Ver partida ${nameOf(f.homeId)} contra ${nameOf(f.awayId)}`}>
                            Ver partida
                          </button>
                        ) : (
                          <span className="text-xs text-mist">a jogar</span>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {finished && (
        <div className="text-center">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              void leaveRoom().then((res) => {
                if (res.ok) navigate('/');
              })
            }
          >
            <Home className="h-4 w-4" aria-hidden="true" /> Voltar ao início
          </button>
        </div>
      )}

      {watching && <MatchViewer match={watching} nameOf={nameOf} onClose={() => setWatching(null)} />}
    </div>
  );
}
