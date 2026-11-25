import { MAX_ROSTER, STARTERS, rngInt, slotOvr, type BotLevel, type Character, type Position, type Rng } from '@strikers/shared';
import { maxAffordableBid } from '../game-engine/auction-rules';

/**
 * Visão que o bot recebe: SOMENTE informação pública do leilão + seu próprio orçamento/elenco.
 * Ele não enxerga orçamento ou intenções dos adversários e nunca burla a validação do servidor.
 */
export interface BotView {
  level: BotLevel;
  character: Character;
  minNextBid: number;
  budget: number;
  roster: Character[];
}

export interface BotDecision {
  /** Valor a lançar. */
  amount: number;
  /** Atraso humano antes de agir (ms). */
  delayMs: number;
}

const LEVEL = {
  FACIL: { factor: 0.7, noise: 0.25, delay: [2000, 5000] },
  NORMAL: { factor: 0.9, noise: 0.12, delay: [1000, 3000] },
  DIFICIL: { factor: 1.05, noise: 0.05, delay: [500, 2000] },
} as const;

/** Quanto vale (em M) um personagem de determinado OVR, antes de ajustes de necessidade. */
export function baseWorth(ovr: number): number {
  return Math.max(1, 4 + (ovr - 55) * 0.9);
}

function covers(c: Character, pos: Position): boolean {
  return c.position === pos || c.secondaryPositions.includes(pos);
}

/** Fator de necessidade 0.4–1.4: posição que falta vale mais; posição já bem coberta vale menos. */
export function needFactor(character: Character, roster: Character[]): number {
  if (roster.length >= MAX_ROSTER) return 0.4;
  const pos = character.position;
  const sameRole = roster.filter((r) => covers(r, pos)).length;
  const better = roster.filter((r) => covers(r, pos) && r.ovr >= character.ovr).length;
  const needed = pos === 'GOL' || pos === 'ZAG' ? 1 : 2;
  if (sameRole === 0) return 1.4;
  if (sameRole < needed) return 1.1;
  if (better >= needed) return 0.4;
  return 0.75;
}

/** Fração do orçamento que o bot aceita gastar em UM personagem (evita gastar tudo cedo). */
export function spendShare(rosterSize: number): number {
  const slotsLeft = Math.max(1, STARTERS - rosterSize);
  if (slotsLeft === 1) return 0.95;
  return Math.min(0.7, 1 / slotsLeft + 0.1);
}

/** Teto de pagamento do bot por este personagem. */
export function maxWilling(view: BotView, rng: Rng): number {
  const cfg = LEVEL[view.level];
  const noise = 1 + (rng() * 2 - 1) * cfg.noise;
  const worth = baseWorth(Math.max(...[view.character.ovr, ...view.character.secondaryPositions.map((p) => slotOvr(view.character, p))])) * needFactor(view.character, view.roster);
  const wanted = worth * cfg.factor * noise;
  const budgetCap = Math.min(view.budget * spendShare(view.roster.length), maxAffordableBid(view.budget, view.roster.length));
  return Math.floor(Math.min(wanted, budgetCap));
}

/** Decide se dá lance agora e quanto. Retorna null quando desiste. */
export function decideBid(view: BotView, rng: Rng): BotDecision | null {
  if (view.roster.length >= MAX_ROSTER) return null;
  const ceiling = maxWilling(view, rng);
  if (view.minNextBid > ceiling) return null;
  const cfg = LEVEL[view.level];
  // Bots difíceis às vezes dão um salto de +1 para afugentar concorrentes.
  const jump = view.level === 'DIFICIL' && rng() < 0.25 ? 1 : 0;
  const amount = Math.min(view.minNextBid + jump, ceiling, maxAffordableBid(view.budget, view.roster.length));
  if (amount < view.minNextBid) return null;
  return { amount, delayMs: rngInt(rng, cfg.delay[0], cfg.delay[1]) };
}

