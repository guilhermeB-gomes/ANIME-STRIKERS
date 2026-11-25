import { POINTS_DRAW, POINTS_LOSS, POINTS_WIN, type MatchResultView, type StandingView } from '@strikers/shared';

export interface PlannedFixture {
  round: number;
  homeId: string;
  awayId: string;
}

/** Pontos corridos em turno único, algoritmo do círculo. Com número ímpar, uma folga por rodada. */
export function generateRoundRobin(ids: readonly string[]): PlannedFixture[] {
  const players: (string | null)[] = [...ids];
  if (players.length % 2 === 1) players.push(null);
  const n = players.length;
  const rounds = n - 1;
  const fixtures: PlannedFixture[] = [];
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = players[i] ?? null;
      const b = players[n - 1 - i] ?? null;
      if (a === null || b === null) continue;
      const swap = (r + i) % 2 === 1;
      fixtures.push({ round: r + 1, homeId: swap ? b : a, awayId: swap ? a : b });
    }
    const last = players.pop() ?? null;
    players.splice(1, 0, last);
  }
  return fixtures;
}

export function totalRoundsFor(participantCount: number): number {
  return participantCount % 2 === 0 ? participantCount - 1 : participantCount;
}

function emptyRow(participantId: string): StandingView {
  return { participantId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 };
}

function tally(ids: readonly string[], matches: readonly MatchResultView[]): Map<string, StandingView> {
  const rows = new Map(ids.map((id) => [id, emptyRow(id)]));
  for (const m of matches) {
    const home = rows.get(m.homeId);
    const away = rows.get(m.awayId);
    if (!home || !away) continue;
    home.played++;
    away.played++;
    home.goalsFor += m.homeGoals;
    home.goalsAgainst += m.awayGoals;
    away.goalsFor += m.awayGoals;
    away.goalsAgainst += m.homeGoals;
    if (m.homeGoals > m.awayGoals) {
      home.wins++;
      away.losses++;
      home.points += POINTS_WIN;
      away.points += POINTS_LOSS;
    } else if (m.homeGoals < m.awayGoals) {
      away.wins++;
      home.losses++;
      away.points += POINTS_WIN;
      home.points += POINTS_LOSS;
    } else {
      home.draws++;
      away.draws++;
      home.points += POINTS_DRAW;
      away.points += POINTS_DRAW;
    }
  }
  for (const row of rows.values()) row.goalDiff = row.goalsFor - row.goalsAgainst;
  return rows;
}

/**
 * Classificação. Desempate: pontos → vitórias → saldo → gols feitos → confronto direto
 * (mini-tabela entre os empatados) → ordem de entrada na sala (ordem de `ids`).
 */
export function computeStandings(ids: readonly string[], matches: readonly MatchResultView[]): StandingView[] {
  const rows = tally(ids, matches);
  const order = new Map(ids.map((id, i) => [id, i]));
  const key = (r: StandingView) => `${r.points}|${r.wins}|${r.goalDiff}|${r.goalsFor}`;
  const base = [...rows.values()].sort(
    (a, b) => b.points - a.points || b.wins - a.wins || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor,
  );

  const result: StandingView[] = [];
  let i = 0;
  while (i < base.length) {
    let j = i + 1;
    const first = base[i] as StandingView;
    while (j < base.length && key(base[j] as StandingView) === key(first)) j++;
    const group = base.slice(i, j);
    if (group.length > 1) {
      const groupIds = new Set(group.map((r) => r.participantId));
      const direct = tally(
        [...groupIds],
        matches.filter((m) => groupIds.has(m.homeId) && groupIds.has(m.awayId)),
      );
      group.sort((a, b) => {
        const da = direct.get(a.participantId) as StandingView;
        const db = direct.get(b.participantId) as StandingView;
        return db.points - da.points || db.goalDiff - da.goalDiff || (order.get(a.participantId) ?? 0) - (order.get(b.participantId) ?? 0);
      });
    }
    result.push(...group);
    i = j;
  }
  return result;
}
