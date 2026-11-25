import { STARTERS } from './constants';
import { OUT_OF_POSITION_FACTOR, ovrFor } from './ovr';
import type { Character, Formation, Position } from './types';

/** Slots da escalação de 5 titulares. LIVRE aceita meio-campista ou atacante. */
export const SLOTS = ['GOL', 'ZAG', 'MEI', 'LIVRE', 'ATA'] as const;
export type Slot = (typeof SLOTS)[number];

export interface FormationInfo {
  id: Formation;
  label: string;
  name: string;
  attack: number;
  mid: number;
  defense: number;
}

export const FORMATIONS: Record<Formation, FormationInfo> = {
  equilibrada: { id: 'equilibrada', label: '1-1-2-1', name: 'Equilibrada', attack: 1, mid: 1, defense: 1 },
  defensiva: { id: 'defensiva', label: '1-2-1-1', name: 'Defensiva', attack: 0.97, mid: 1, defense: 1.04 },
  ofensiva: { id: 'ofensiva', label: '1-1-1-2', name: 'Ofensiva', attack: 1.04, mid: 1, defense: 0.97 },
};

export type LineupWarningCode = 'EMPTY_SLOT' | 'OUT_OF_POSITION' | 'GOALKEEPER_IN_FIELD' | 'FIELD_PLAYER_IN_GOAL';

export interface LineupWarning {
  code: LineupWarningCode;
  slot: Slot;
  message: string;
}

export interface TeamProfile {
  gk: number;
  defense: number;
  mid: number;
  attack: number;
  /** Média ponderada das linhas, já com a formação, antes da sinergia. */
  base: number;
  synergyPct: number;
  strength: number;
  formation: Formation;
  warnings: LineupWarning[];
}

const EMPTY_SLOT_OVR = 30;

function listsPosition(c: Character, pos: Position): boolean {
  return c.position === pos || c.secondaryPositions.includes(pos);
}

/** OVR efetivo do personagem em um slot (penaliza 15% quando fora de posição). */
export function slotOvr(c: Character, slot: Slot): number {
  if (slot === 'LIVRE') return Math.max(slotOvr(c, 'MEI'), slotOvr(c, 'ATA'));
  const raw = ovrFor(c.attributes, slot);
  return listsPosition(c, slot) ? raw : Math.round(raw * OUT_OF_POSITION_FACTOR);
}

export function isOutOfPosition(c: Character, slot: Slot): boolean {
  if (slot === 'LIVRE') return !listsPosition(c, 'MEI') && !listsPosition(c, 'ATA');
  return !listsPosition(c, slot);
}

/** Papel do personagem no slot LIVRE: meio ou ataque. */
export function freeSlotRole(c: Character): 'MEI' | 'ATA' {
  const mei = slotOvr(c, 'MEI');
  const ata = slotOvr(c, 'ATA');
  if (mei === ata) return c.position === 'ATA' ? 'ATA' : 'MEI';
  return mei > ata ? 'MEI' : 'ATA';
}

/** Pontos de sinergia (%): universo em comum + tags em comum, com teto de +8 e piso de -4. */
export function synergyBonusPct(chars: Character[]): number {
  const byAnime = new Map<string, number>();
  const byTag = new Map<string, number>();
  for (const c of chars) {
    byAnime.set(c.animeId, (byAnime.get(c.animeId) ?? 0) + 1);
    for (const tag of new Set(c.tags)) byTag.set(tag, (byTag.get(tag) ?? 0) + 1);
  }
  const animeTable: Record<number, number> = { 2: 1, 3: 3, 4: 5, 5: 7 };
  const animeBonus = Math.max(0, ...[...byAnime.values()].map((n) => animeTable[Math.min(n, 5)] ?? 0));
  let pairs = 0;
  for (const n of byTag.values()) if (n >= 2) pairs += (n * (n - 1)) / 2;
  const tagBonus = Math.min(3, pairs);
  return Math.min(8, animeBonus + tagBonus);
}

const POSITION_NAME: Record<Slot, string> = { GOL: 'Goleiro', ZAG: 'Defesa', MEI: 'Meio-campo', LIVRE: 'Meio-campo/Ataque', ATA: 'Ataque' };

export function computeTeamProfile(lineup: (Character | null)[], formation: Formation): TeamProfile {
  const warnings: LineupWarning[] = [];
  const ovrs = {} as Record<Slot, number>;
  SLOTS.forEach((slot, i) => {
    const c = lineup[i] ?? null;
    if (!c) {
      ovrs[slot] = EMPTY_SLOT_OVR;
      warnings.push({ code: 'EMPTY_SLOT', slot, message: `Posição vazia: ${POSITION_NAME[slot]}.` });
      return;
    }
    ovrs[slot] = slotOvr(c, slot);
    if (isOutOfPosition(c, slot)) {
      const code: LineupWarningCode = c.position === 'GOL' ? 'GOALKEEPER_IN_FIELD' : slot === 'GOL' ? 'FIELD_PLAYER_IN_GOAL' : 'OUT_OF_POSITION';
      warnings.push({ code, slot, message: `${c.name} está fora de posição em ${POSITION_NAME[slot]} (-15% de OVR).` });
    }
  });

  const freeChar = lineup[SLOTS.indexOf('LIVRE')] ?? null;
  const freeRole = freeChar ? freeSlotRole(freeChar) : 'MEI';
  const midValues = [ovrs.MEI, ...(freeRole === 'MEI' ? [ovrs.LIVRE] : [])];
  const attackValues = [ovrs.ATA, ...(freeRole === 'ATA' ? [ovrs.LIVRE] : [])];
  const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

  const f = FORMATIONS[formation];
  const gk = ovrs.GOL;
  const defense = ovrs.ZAG * f.defense;
  const mid = avg(midValues) * f.mid;
  const attack = avg(attackValues) * f.attack;
  const base = 0.3 * attack + 0.3 * mid + 0.25 * defense + 0.15 * gk;

  const present = lineup.filter((c): c is Character => c !== null);
  const penalty = Math.min(4, warnings.length * 2);
  const synergyPct = Math.max(-4, Math.min(8, synergyBonusPct(present) - penalty));
  const round1 = (n: number) => Math.round(n * 10) / 10;

  return {
    gk: round1(gk),
    defense: round1(defense),
    mid: round1(mid),
    attack: round1(attack),
    base: round1(base),
    synergyPct,
    strength: round1(base * (1 + synergyPct / 100)),
    formation,
    warnings,
  };
}

/** Verifica se uma escalação (ids) é válida para um elenco. Retorna mensagem de erro ou null. */
export function validateLineupIds(ids: (string | null)[], rosterIds: readonly string[]): string | null {
  if (ids.length !== STARTERS) return 'A escalação precisa ter 5 posições.';
  const seen = new Set<string>();
  for (const id of ids) {
    if (id === null) continue;
    if (!rosterIds.includes(id)) return 'Personagem não pertence ao seu elenco.';
    if (seen.has(id)) return 'Personagem repetido na escalação.';
    seen.add(id);
  }
  return null;
}

/** Melhor escalação possível (força bruta sobre até 7 jogadores, ~2.5 mil combinações). */
export function autoLineup(roster: Character[]): (string | null)[] {
  const pool: (Character | null)[] = [...roster];
  while (pool.length < STARTERS) pool.push(null);
  let best: (string | null)[] = Array.from({ length: STARTERS }, () => null);
  let bestScore = -1;
  const current: (Character | null)[] = [];
  const used = new Set<number>();

  const walk = (slotIndex: number, score: number) => {
    if (slotIndex === STARTERS) {
      if (score > bestScore) {
        bestScore = score;
        best = current.map((c) => c?.id ?? null);
      }
      return;
    }
    const slot = SLOTS[slotIndex] as Slot;
    for (let i = 0; i < pool.length; i++) {
      if (used.has(i)) continue;
      const c = pool[i] ?? null;
      used.add(i);
      current[slotIndex] = c;
      walk(slotIndex + 1, score + (c ? slotOvr(c, slot) : EMPTY_SLOT_OVR));
      used.delete(i);
    }
  };
  walk(0, 0);
  return best;
}
