import {
  SLOTS,
  getAbility,
  mulberry32,
  slotOvr,
  type Ability,
  type AbilityTrigger,
  type Character,
  type MatchEventView,
  type MatchResultView,
  type MatchSideStats,
  type Rng,
  type TeamProfile,
} from '@strikers/shared';

export interface TeamInput {
  participantId: string;
  /** Na ordem dos slots: GOL, ZAG, MEI, LIVRE, ATA. */
  lineup: (Character | null)[];
  profile: TeamProfile;
}

export interface SimulationInput {
  matchId: string;
  round: number;
  home: TeamInput;
  away: TeamInput;
  seed: number;
}

/** Número de lances (turnos de ataque) por partida. Ver docs/REGRAS_DO_JOGO.md §6. */
export const PLAYS_PER_MATCH = 20;
/** Teto de qualquer bônus individual de habilidade em uma jogada. */
export const MAX_ABILITY_BOOST = 0.25;

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

interface Side {
  team: TeamInput;
  uses: Map<string, number>;
  shots: number;
  onTarget: number;
  saves: number;
  plays: number;
  goals: number;
}

interface Context {
  rng: Rng;
  events: MatchEventView[];
  score: Map<string, number>;
}

function newSide(team: TeamInput): Side {
  return { team, uses: new Map(), shots: 0, onTarget: 0, saves: 0, plays: 0, goals: 0 };
}

function fieldPlayers(side: Side): { character: Character; slotIndex: number }[] {
  const out: { character: Character; slotIndex: number }[] = [];
  side.team.lineup.forEach((character, slotIndex) => {
    if (character && slotIndex > 0) out.push({ character, slotIndex });
  });
  return out;
}

function pickWeighted<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T | null {
  const weights = items.map(weight);
  const total = weights.reduce((a, b) => a + b, 0);
  if (items.length === 0 || total <= 0) return null;
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll <= 0) return items[i] ?? null;
  }
  return items[items.length - 1] ?? null;
}

function text(rng: Rng, templates: readonly string[]): string {
  return templates[Math.floor(rng() * templates.length)] ?? templates[0] ?? '';
}

/** Sorteia a habilidade sem consumir o uso. O uso só é consumido em `commit`. */
function rollAbility(ctx: Context, side: Side, character: Character | null, triggers: AbilityTrigger[]): Ability | null {
  if (!character) return null;
  const ability = getAbility(character.abilityId);
  if (!triggers.includes(ability.trigger)) return null;
  if ((side.uses.get(character.id) ?? 0) >= ability.maxUses) return null;
  return ctx.rng() < ability.chance ? ability : null;
}

function commit(ctx: Context, side: Side, character: Character, ability: Ability, minute: number): void {
  side.uses.set(character.id, (side.uses.get(character.id) ?? 0) + 1);
  ctx.events.push({
    minute,
    type: 'HABILIDADE',
    participantId: side.team.participantId,
    characterId: character.id,
    assistCharacterId: null,
    text: `${character.name} ativa ${ability.name}!`,
  });
  ctx.score.set(character.id, (ctx.score.get(character.id) ?? 0) + 0.3);
}

function emit(ctx: Context, event: MatchEventView): void {
  ctx.events.push(event);
}

function playTurn(ctx: Context, att: Side, def: Side, minute: number): void {
  const { rng } = ctx;
  const attackers = fieldPlayers(att);
  if (attackers.length === 0) return;
  att.plays++;

  const counter = rng() < 0.22;
  const creator = pickWeighted(rng, attackers, (p) => [0, 0.1, 0.4, 0.25, 0.25][p.slotIndex] ?? 0.1) ?? attackers[0];
  if (!creator) return;
  const base = { minute, participantId: att.team.participantId, characterId: creator.character.id, assistCharacterId: null };

  emit(ctx, {
    ...base,
    type: counter ? 'CONTRA_ATAQUE' : 'ATAQUE',
    text: counter
      ? text(rng, [`Contra-ataque veloz! ${creator.character.name} sai em disparada.`, `${creator.character.name} puxa o contra-ataque!`])
      : text(rng, [`${creator.character.name} comanda o ataque.`, `${creator.character.name} organiza a jogada pelo meio.`, `Ataque iniciado por ${creator.character.name}.`]),
  });

  // Chute de longa distância: finaliza sem passar pela defesa, com 10% menos qualidade.
  let longShooter: { character: Character; slotIndex: number } | null = null;
  for (const p of attackers.filter((a) => a.slotIndex === 2 || a.slotIndex === 3)) {
    const ability = rollAbility(ctx, att, p.character, ['ATAQUE_PELO_MEIO']);
    if (ability) {
      commit(ctx, att, p.character, ability, minute);
      longShooter = p;
      break;
    }
  }

  let shooter: { character: Character; slotIndex: number };
  let qualityMultiplier = 1;
  let assist: Character | null = null;

  if (longShooter) {
    shooter = longShooter;
    qualityMultiplier = 1 - getAbility('chute_longa_distancia').magnitude;
  } else {
    // 1) criação da jogada: força do ataque x defesa, com bônus de habilidade (não acumulam, vale o maior).
    const candidates: { character: Character; ability: Ability }[] = [];
    const creatorAbility = rollAbility(ctx, att, creator.character, ['CRIAR_JOGADA', 'DRIBLAR']);
    if (creatorAbility) candidates.push({ character: creator.character, ability: creatorAbility });
    if (counter) {
      for (const p of attackers) {
        const ability = rollAbility(ctx, att, p.character, ['CONTRA_ATAQUE']);
        if (ability) {
          candidates.push({ character: p.character, ability });
          break;
        }
      }
    }
    const best = candidates.sort((a, b) => b.ability.magnitude - a.ability.magnitude)[0];
    let attackPower = 0.5 * att.team.profile.attack + 0.5 * att.team.profile.mid;
    if (best) {
      commit(ctx, att, best.character, best.ability, minute);
      attackPower *= 1 + Math.min(MAX_ABILITY_BOOST, best.ability.magnitude);
    }
    for (const d of fieldPlayers(def)) {
      const ability = rollAbility(ctx, def, d.character, ['SER_ATACADO']);
      if (ability) {
        commit(ctx, def, d.character, ability, minute);
        attackPower *= 1 - Math.min(MAX_ABILITY_BOOST, ability.magnitude);
        break;
      }
    }
    const defensePower = 0.6 * def.team.profile.defense + 0.4 * def.team.profile.mid;
    const pCreate = 0.15 + 0.55 * sigmoid((attackPower - defensePower) / 10);
    if (rng() >= pCreate) {
      const defender = pickWeighted(rng, fieldPlayers(def), (p) => (p.slotIndex === 1 ? 3 : 1));
      emit(ctx, {
        minute,
        type: 'DEFESA',
        participantId: def.team.participantId,
        characterId: defender?.character.id ?? null,
        assistCharacterId: null,
        text: defender
          ? text(rng, [`${defender.character.name} desarma ${creator.character.name} e a defesa respira.`, `${defender.character.name} corta a jogada com firmeza.`])
          : `A jogada de ${creator.character.name} não prospera.`,
      });
      return;
    }
    shooter =
      pickWeighted(rng, attackers, (p) => {
        const role = p.slotIndex === 4 ? 0.5 : p.slotIndex === 3 ? 0.3 : p.slotIndex === 2 ? 0.2 : 0.04;
        return role * (0.5 + p.character.attributes.finalizacao / 100);
      }) ?? creator;
    if (shooter.character.id !== creator.character.id) {
      assist = creator.character;
      emit(ctx, {
        minute,
        type: 'PASSE',
        participantId: att.team.participantId,
        characterId: creator.character.id,
        assistCharacterId: null,
        text: text(rng, [`Passe decisivo de ${creator.character.name} para ${shooter.character.name}!`, `${creator.character.name} enxerga o espaço e serve ${shooter.character.name}.`]),
      });
    }
  }

  // 2) finalização
  const slot = SLOTS[shooter.slotIndex] ?? 'ATA';
  let quality = 0.6 * shooter.character.attributes.finalizacao + 0.4 * slotOvr(shooter.character, slot);
  const shotAbility = rollAbility(ctx, att, shooter.character, ['FINALIZAR']);
  if (shotAbility) {
    commit(ctx, att, shooter.character, shotAbility, minute);
    quality *= 1 + Math.min(MAX_ABILITY_BOOST, shotAbility.magnitude);
  }
  quality *= qualityMultiplier;
  att.shots++;

  const shotEvent = { minute, participantId: att.team.participantId, characterId: shooter.character.id, assistCharacterId: assist?.id ?? null };
  const pOnTarget = clamp(0.55 + 0.004 * (quality - 70), 0.4, 0.75);
  if (rng() >= pOnTarget) {
    emit(ctx, { ...shotEvent, type: 'FINALIZACAO', text: text(rng, [`${shooter.character.name} chuta para fora.`, `${shooter.character.name} finaliza e a bola passa raspando a trave.`]) });
    return;
  }
  att.onTarget++;

  // 3) goleiro
  const keeper = def.team.lineup[0] ?? null;
  let keeperPower = keeper ? 0.5 * def.team.profile.gk + 0.5 * keeper.attributes.reflexos : 30;
  const saveAbility = rollAbility(ctx, def, keeper, ['CHUTE_NO_GOL']);
  if (saveAbility && keeper) {
    commit(ctx, def, keeper, saveAbility, minute);
    keeperPower *= 1 + Math.min(MAX_ABILITY_BOOST, saveAbility.magnitude);
  }
  const pGoal = 0.12 + 0.6 * sigmoid((quality - keeperPower) / 10);
  if (rng() < pGoal) {
    att.goals++;
    ctx.score.set(shooter.character.id, (ctx.score.get(shooter.character.id) ?? 0) + 3);
    if (assist) ctx.score.set(assist.id, (ctx.score.get(assist.id) ?? 0) + 2);
    emit(ctx, {
      ...shotEvent,
      type: 'GOL',
      text: text(rng, [`GOOOL! ${shooter.character.name} balança as redes!`, `É GOL de ${shooter.character.name}!`, `${shooter.character.name} não perdoa e marca!`]),
    });
  } else {
    def.saves++;
    if (keeper) ctx.score.set(keeper.id, (ctx.score.get(keeper.id) ?? 0) + 1.2);
    emit(ctx, {
      minute,
      type: 'DEFESA',
      participantId: def.team.participantId,
      characterId: keeper?.id ?? null,
      assistCharacterId: null,
      text: keeper ? text(rng, [`Que defesa de ${keeper.name}!`, `${keeper.name} espalma o chute de ${shooter.character.name}!`]) : 'A bola é afastada.',
    });
  }
}

function sideStats(side: Side, totalPlays: number): MatchSideStats {
  return {
    possession: totalPlays === 0 ? 50 : Math.round((side.plays / totalPlays) * 100),
    shots: side.shots,
    onTarget: side.onTarget,
    saves: side.saves,
  };
}

/**
 * Simula uma partida. Determinística: mesma seed + mesmos times => mesmo resultado.
 * A qualidade dos times (linhas de ataque/meio/defesa/goleiro, sinergia e habilidades) define as probabilidades;
 * a seed só decide as moedas que o acaso joga dentro dessas probabilidades.
 */
export function simulateMatch(input: SimulationInput): MatchResultView {
  const rng = mulberry32(input.seed);
  const ctx: Context = { rng, events: [], score: new Map() };
  const home = newSide(input.home);
  const away = newSide(input.away);

  ctx.events.push({ minute: 0, type: 'INICIO', participantId: null, characterId: null, assistCharacterId: null, text: 'Começa a partida!' });

  for (let i = 1; i <= PLAYS_PER_MATCH; i++) {
    const minute = Math.min(89, Math.round((i * 90) / PLAYS_PER_MATCH) - 1);
    const homeShare = home.team.profile.mid / (home.team.profile.mid + away.team.profile.mid);
    const homeAttacks = rng() < homeShare;
    playTurn(ctx, homeAttacks ? home : away, homeAttacks ? away : home, minute);
  }

  ctx.events.push({
    minute: 90,
    type: 'FIM',
    participantId: null,
    characterId: null,
    assistCharacterId: null,
    text: `Fim de jogo: ${home.goals} x ${away.goals}.`,
  });

  const winnerSide = home.goals > away.goals ? home : away.goals > home.goals ? away : null;
  const mvpPool = [...home.team.lineup, ...away.team.lineup].filter((c): c is Character => c !== null);
  const mvp =
    [...mvpPool].sort((a, b) => {
      const sa = (ctx.score.get(a.id) ?? 0) + (winnerSide?.team.lineup.some((c) => c?.id === a.id) ? 0.5 : 0) + a.ovr / 1000;
      const sb = (ctx.score.get(b.id) ?? 0) + (winnerSide?.team.lineup.some((c) => c?.id === b.id) ? 0.5 : 0) + b.ovr / 1000;
      return sb - sa;
    })[0] ?? null;

  const total = home.plays + away.plays;
  return {
    id: input.matchId,
    round: input.round,
    homeId: input.home.participantId,
    awayId: input.away.participantId,
    homeGoals: home.goals,
    awayGoals: away.goals,
    events: ctx.events,
    stats: { home: sideStats(home, total), away: sideStats(away, total) },
    mvpCharacterId: mvp?.id ?? null,
  };
}
