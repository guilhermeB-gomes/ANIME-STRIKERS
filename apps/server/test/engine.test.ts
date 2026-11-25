import { describe, expect, it } from 'vitest';
import {
  CHARACTERS,
  autoLineup,
  computeTeamProfile,
  getCharacter,
  mulberry32,
  type Character,
  type Formation,
  type MatchResultView,
} from '@strikers/shared';
import { budgetReserve, maxAffordableBid, minNextBid, nextEndsAt, validateBid, type BidContext } from '../src/game-engine/auction-rules';
import { computeStandings, generateRoundRobin, totalRoundsFor } from '../src/game-engine/fixtures';
import { simulateMatch, type TeamInput } from '../src/game-engine/match';
import { buildAuctionQueue } from '../src/game-engine/queue';
import { baseWorth, decideBid, needFactor, spendShare } from '../src/bots/bot-brain';

const ctx = (over: Partial<BidContext> = {}): BidContext => ({
  auctionStatus: 'ACTIVE',
  now: 1000,
  endsAt: 16000,
  startingBid: 3,
  currentBid: null,
  leaderId: null,
  bidderId: 'p1',
  bidderBudget: 100,
  bidderRosterSize: 0,
  characterAlreadyOwned: false,
  amount: 3,
  ...over,
});

describe('regras de lance', () => {
  it('aceita o valor inicial e exige +1 sobre o lance atual', () => {
    expect(validateBid(ctx()).ok).toBe(true);
    expect(minNextBid(3, null)).toBe(3);
    expect(minNextBid(3, 7)).toBe(8);
    expect(validateBid(ctx({ currentBid: 7, leaderId: 'p2', amount: 8 })).ok).toBe(true);
    const low = validateBid(ctx({ currentBid: 7, leaderId: 'p2', amount: 7 }));
    expect(low).toMatchObject({ ok: false, code: 'BID_TOO_LOW' });
  });

  it('rejeita lance acima do orçamento', () => {
    expect(validateBid(ctx({ bidderBudget: 10, amount: 11 }))).toMatchObject({ ok: false, code: 'INSUFFICIENT_BUDGET' });
    expect(validateBid(ctx({ bidderBudget: 10, amount: 7, bidderRosterSize: 0 }))).toMatchObject({ ok: false, code: 'INSUFFICIENT_BUDGET' });
  });

  it('mantém reserva para completar os titulares', () => {
    expect(budgetReserve(0)).toBe(4);
    expect(budgetReserve(3)).toBe(1);
    expect(budgetReserve(4)).toBe(0);
    expect(maxAffordableBid(100, 0)).toBe(96);
    expect(validateBid(ctx({ amount: 97 }))).toMatchObject({ ok: false, code: 'INSUFFICIENT_BUDGET' });
    expect(validateBid(ctx({ amount: 96 })).ok).toBe(true);
  });

  it('rejeita líder repetido, leilão encerrado, tempo esgotado, duplicado e elenco cheio', () => {
    expect(validateBid(ctx({ leaderId: 'p1', currentBid: 3, amount: 4 }))).toMatchObject({ code: 'ALREADY_LEADING' });
    expect(validateBid(ctx({ auctionStatus: 'CLOSED' }))).toMatchObject({ code: 'AUCTION_CLOSED' });
    expect(validateBid(ctx({ now: 16000 }))).toMatchObject({ code: 'AUCTION_CLOSED' });
    expect(validateBid(ctx({ characterAlreadyOwned: true }))).toMatchObject({ code: 'ALREADY_OWNED' });
    expect(validateBid(ctx({ bidderRosterSize: 7 }))).toMatchObject({ code: 'ROSTER_FULL' });
  });

  it('anti-sniping: lance nos últimos 3 s soma 5 s; antes disso não altera', () => {
    expect(nextEndsAt(13000, 16000)).toBe(21000);
    expect(nextEndsAt(12999, 16000)).toBe(16000);
    expect(nextEndsAt(15999, 16000)).toBe(21000);
  });
});

describe('fila de leilão', () => {
  it('é determinística, sem repetição e proporcional ao número de participantes', () => {
    const a = buildAuctionQueue(42, 4);
    expect(a).toEqual(buildAuctionQueue(42, 4));
    expect(a).toHaveLength(28);
    expect(new Set(a).size).toBe(28);
    expect(buildAuctionQueue(42, 8)).toHaveLength(CHARACTERS.length);
    expect(buildAuctionQueue(1, 4)).not.toEqual(a);
  });
});

describe('calendário e classificação', () => {
  it('turno único: todos contra todos exatamente uma vez', () => {
    for (const n of [2, 3, 4, 5, 8]) {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const fx = generateRoundRobin(ids);
      expect(fx).toHaveLength((n * (n - 1)) / 2);
      const pairs = new Set(fx.map((f) => [f.homeId, f.awayId].sort().join('-')));
      expect(pairs.size).toBe(fx.length);
      expect(Math.max(...fx.map((f) => f.round))).toBe(totalRoundsFor(n));
      for (let r = 1; r <= totalRoundsFor(n); r++) {
        const inRound = fx.filter((f) => f.round === r).flatMap((f) => [f.homeId, f.awayId]);
        expect(new Set(inRound).size).toBe(inRound.length);
      }
    }
  });

  const match = (homeId: string, awayId: string, h: number, a: number): MatchResultView => ({
    id: `${homeId}-${awayId}`,
    round: 1,
    homeId,
    awayId,
    homeGoals: h,
    awayGoals: a,
    events: [],
    stats: { home: { possession: 50, shots: 0, onTarget: 0, saves: 0 }, away: { possession: 50, shots: 0, onTarget: 0, saves: 0 } },
    mvpCharacterId: null,
  });

  it('pontua 3/1/0 e calcula saldo e gols', () => {
    const table = computeStandings(['a', 'b', 'c'], [match('a', 'b', 2, 0), match('b', 'c', 1, 1), match('c', 'a', 0, 3)]);
    expect(table.map((r) => r.participantId)).toEqual(['a', 'b', 'c']);
    expect(table[0]).toMatchObject({ points: 6, wins: 2, goalsFor: 5, goalsAgainst: 0, goalDiff: 5, played: 2 });
    expect(table[1]).toMatchObject({ points: 1, draws: 1, losses: 1 });
    expect(table[2]).toMatchObject({ points: 1, draws: 1, losses: 1 });
  });

  it('desempata por vitórias, saldo, gols feitos, confronto direto e ordem de entrada', () => {
    // a e b empatam em tudo (pontos, vitórias, saldo, gols); a venceu b, então o confronto direto decide
    // mesmo com b entrando primeiro na sala.
    const t1 = computeStandings(['b', 'a', 'c'], [match('a', 'b', 2, 1), match('c', 'a', 1, 0), match('b', 'c', 1, 0)]);
    expect(t1.map((r) => r.participantId)).toEqual(['a', 'b', 'c']);
    // tudo igual (sem jogos): ordem de entrada
    expect(computeStandings(['x', 'y', 'z'], []).map((r) => r.participantId)).toEqual(['x', 'y', 'z']);
    // saldo de gols desempata
    const t2 = computeStandings(['a', 'b', 'c'], [match('a', 'c', 1, 0), match('b', 'c', 3, 0)]);
    expect(t2.map((r) => r.participantId)).toEqual(['b', 'a', 'c']);
  });
});

function team(participantId: string, ids: string[], formation: Formation = 'equilibrada'): TeamInput {
  const chars = ids.map(getCharacter);
  const lineup = autoLineup(chars).map((id) => (id ? getCharacter(id) : null));
  return { participantId, lineup, profile: computeTeamProfile(lineup, formation) };
}

const STRONG = ['dragon-ball-son-goku', 'dragon-ball-piccolo', 'jujutsu-kaisen-satoru-gojo', 'blue-lock-rin-itoshi', 'captain-tsubasa-genzo-wakabayashi'];
const MID = ['naruto-kakashi-hatake', 'naruto-gaara', 'inazuma-eleven-kidou-yuuto', 'one-piece-sanji', 'inazuma-eleven-endou-mamoru'];
const WEAK = ['dragon-ball-mr-satan', 'blue-lock-ikki-niko', 'one-piece-nami', 'one-piece-usopp', 'captain-tsubasa-ryo-ishizaki'];

describe('simulação de partida', () => {
  const run = (a: TeamInput, b: TeamInput, seed: number) => simulateMatch({ matchId: `m${seed}`, round: 1, home: a, away: b, seed });

  it('é determinística para a mesma seed', () => {
    const a = team('A', STRONG);
    const b = team('B', MID);
    expect(run(a, b, 99)).toEqual(run(a, b, 99));
  });

  it('produz placar coerente com gols, assistências, estatísticas, MVP e eventos narrados', () => {
    const r = run(team('A', STRONG), team('B', MID), 7);
    const goals = r.events.filter((e) => e.type === 'GOL');
    expect(goals.length).toBe(r.homeGoals + r.awayGoals);
    expect(r.events[0]?.type).toBe('INICIO');
    expect(r.events.at(-1)?.type).toBe('FIM');
    expect(r.stats.home.possession + r.stats.away.possession).toBeGreaterThanOrEqual(99);
    expect(r.stats.home.shots).toBeGreaterThanOrEqual(r.stats.home.onTarget);
    expect(r.mvpCharacterId).not.toBeNull();
    for (const e of r.events) expect(e.text.length).toBeGreaterThan(0);
    const minutes = r.events.map((e) => e.minute);
    expect([...minutes].sort((x, y) => x - y)).toEqual(minutes);
  });

  it('time muito mais forte vence com frequência claramente maior (500 simulações)', () => {
    const strong = team('S', STRONG);
    const weak = team('W', WEAK);
    let strongWins = 0;
    let weakWins = 0;
    let goals = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const home = seed % 2 === 0;
      const r = home ? run(strong, weak, seed) : run(weak, strong, seed);
      const sg = home ? r.homeGoals : r.awayGoals;
      const wg = home ? r.awayGoals : r.homeGoals;
      goals += sg + wg;
      if (sg > wg) strongWins++;
      else if (wg > sg) weakWins++;
    }
    expect(strongWins / 500).toBeGreaterThan(0.6);
    expect(strongWins).toBeGreaterThan(weakWins * 2);
    expect(goals / 500).toBeGreaterThan(1.2);
    expect(goals / 500).toBeLessThan(6);
  });

  it('times equilibrados não são resultado puramente determinado: o azarão ganha às vezes', () => {
    const a = team('A', STRONG);
    const b = team('B', MID);
    let bWins = 0;
    for (let seed = 1; seed <= 300; seed++) if (run(a, b, seed).awayGoals > run(a, b, seed).homeGoals) bWins++;
    expect(bWins).toBeGreaterThan(0);
  });

  it('habilidades respeitam o limite de usos por partida', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = run(team('A', STRONG), team('B', MID), seed);
      const uses = new Map<string, number>();
      for (const e of r.events.filter((x) => x.type === 'HABILIDADE' && x.characterId)) uses.set(e.characterId as string, (uses.get(e.characterId as string) ?? 0) + 1);
      for (const [, n] of uses) expect(n).toBeLessThanOrEqual(3);
    }
  });

  it('habilidades influenciam o resultado: remover habilidades muda a frequência de gols', () => {
    const withAbilities = team('A', STRONG);
    const stripped: TeamInput = {
      ...withAbilities,
      lineup: withAbilities.lineup.map((c) => (c ? ({ ...c, abilityId: 'visao_de_jogo' } as Character) : null)),
    };
    let total1 = 0;
    let total2 = 0;
    const opp = team('B', MID);
    for (let seed = 1; seed <= 400; seed++) {
      total1 += run(withAbilities, opp, seed).homeGoals;
      total2 += run(stripped, opp, seed).homeGoals;
    }
    expect(total1).not.toBe(total2);
  });

  it('escalação incompleta não quebra a simulação', () => {
    const lineup: (Character | null)[] = [null, null, getCharacter('naruto-shikamaru-nara'), null, getCharacter('naruto-sasuke-uchiha')];
    const t: TeamInput = { participantId: 'X', lineup, profile: computeTeamProfile(lineup, 'equilibrada') };
    expect(() => run(t, team('B', MID), 3)).not.toThrow();
  });
});

describe('bots', () => {
  const rng = () => mulberry32(5);
  const goku = getCharacter('dragon-ball-son-goku');
  const satan = getCharacter('dragon-ball-mr-satan');

  it('valor base cresce com o OVR e necessidade muda o fator', () => {
    expect(baseWorth(90)).toBeGreaterThan(baseWorth(70));
    expect(needFactor(satan, [])).toBe(1.4);
    expect(needFactor(satan, [getCharacter('blue-lock-gagamaru')])).toBeLessThan(1);
    expect(spendShare(0)).toBeLessThan(spendShare(4));
  });

  it('dá lance quando o preço é razoável e desiste quando está caro', () => {
    const ok = decideBid({ level: 'NORMAL', character: goku, minNextBid: 5, budget: 100, roster: [] }, rng());
    expect(ok).not.toBeNull();
    expect(ok?.amount).toBeGreaterThanOrEqual(5);
    const tooHigh = decideBid({ level: 'NORMAL', character: goku, minNextBid: 60, budget: 100, roster: [] }, rng());
    expect(tooHigh).toBeNull();
  });

  it('nunca ultrapassa o orçamento nem a reserva, em nenhum nível', () => {
    for (const level of ['FACIL', 'NORMAL', 'DIFICIL'] as const) {
      for (let seed = 1; seed <= 200; seed++) {
        const budget = 6 + (seed % 20);
        const d = decideBid({ level, character: goku, minNextBid: 3, budget, roster: [] }, mulberry32(seed));
        if (d) expect(d.amount).toBeLessThanOrEqual(budget - 4);
      }
    }
  });

  it('não gasta quase todo o orçamento em um único personagem logo no início', () => {
    for (const level of ['FACIL', 'NORMAL', 'DIFICIL'] as const) {
      let max = 0;
      for (let seed = 1; seed <= 200; seed++) {
        for (let price = 1; price <= 90; price++) {
          const d = decideBid({ level, character: goku, minNextBid: price, budget: 100, roster: [] }, mulberry32(seed));
          if (d) max = Math.max(max, d.amount);
        }
      }
      expect(max).toBeLessThanOrEqual(50);
    }
  });

  it('prioriza posição que falta no elenco', () => {
    const roster = [getCharacter('naruto-sasuke-uchiha'), getCharacter('dragon-ball-vegeta')];
    const lacking = getCharacter('naruto-gaara');
    const surplus = getCharacter('dragon-ball-trunks');
    expect(needFactor(lacking, roster)).toBeGreaterThan(needFactor(surplus, roster));
  });

  it('difícil paga mais que fácil pelo mesmo personagem; atraso respeita o nível', () => {
    let easy = 0;
    let hard = 0;
    for (let seed = 1; seed <= 100; seed++) {
      for (const [level, set] of [['FACIL', 'e'], ['DIFICIL', 'h']] as const) {
        let top = 0;
        for (let price = 1; price <= 80; price++) {
          const d = decideBid({ level, character: goku, minNextBid: price, budget: 100, roster: [] }, mulberry32(seed));
          if (d) top = price;
        }
        if (set === 'e') easy += top;
        else hard += top;
      }
    }
    expect(hard).toBeGreaterThan(easy);
    const d = decideBid({ level: 'DIFICIL', character: goku, minNextBid: 3, budget: 100, roster: [] }, mulberry32(1));
    expect(d?.delayMs).toBeGreaterThanOrEqual(500);
    expect(d?.delayMs).toBeLessThanOrEqual(2000);
  });
});
