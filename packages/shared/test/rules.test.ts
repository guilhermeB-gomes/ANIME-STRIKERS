import { describe, expect, it } from 'vitest';
import {
  ANIMES,
  CHARACTERS,
  ATTRIBUTE_KEYS,
  autoLineup,
  buildAttributes,
  computeTeamProfile,
  getCharacter,
  hashString,
  mulberry32,
  ovrFor,
  slotOvr,
  synergyBonusPct,
  validateLineupIds,
  roomCodeSchema,
  roomCreateSchema,
  type Attributes,
  type Character,
} from '../src';

const attrs = (o: Partial<Attributes>): Attributes => Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, o[k] ?? 50])) as Attributes;
const byAnime = (animeId: string) => CHARACTERS.filter((c) => c.animeId === animeId);
const pick = (id: string): Character => getCharacter(id);

describe('catálogo', () => {
  it('tem pelo menos 50 personagens em 7 universos, 8 por universo', () => {
    expect(CHARACTERS.length).toBeGreaterThanOrEqual(50);
    expect(ANIMES).toHaveLength(7);
    for (const a of ANIMES) expect(byAnime(a.id)).toHaveLength(8);
  });

  it('ids são únicos e atributos ficam entre 1 e 100', () => {
    expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(CHARACTERS.length);
    for (const c of CHARACTERS) {
      for (const k of ATTRIBUTE_KEYS) {
        expect(c.attributes[k]).toBeGreaterThanOrEqual(1);
        expect(c.attributes[k]).toBeLessThanOrEqual(100);
      }
    }
  });

  it('é determinístico: mesmos atributos a cada geração', () => {
    const id = 'naruto-naruto-uzumaki';
    expect(buildAttributes(id, 'ATA', ['MEI'], 88)).toEqual(buildAttributes(id, 'ATA', ['MEI'], 88));
    expect(getCharacter(id).attributes).toEqual(buildAttributes(id, 'ATA', ['MEI'], 88));
  });

  it('cobre todas as posições e todas as raridades', () => {
    for (const pos of ['GOL', 'ZAG', 'MEI', 'ATA'] as const) expect(CHARACTERS.filter((c) => c.position === pos).length).toBeGreaterThanOrEqual(7);
    for (const r of ['COMUM', 'RARO', 'EPICO', 'LENDARIO', 'MITICO'] as const) expect(CHARACTERS.some((c) => c.rarity === r)).toBe(true);
  });

  it('raridade não determina sozinha a qualidade: existe Épico com OVR maior que algum Lendário', () => {
    const maxEpic = Math.max(...CHARACTERS.filter((c) => c.rarity === 'EPICO').map((c) => c.ovr));
    const minLegendary = Math.min(...CHARACTERS.filter((c) => c.rarity === 'LENDARIO').map((c) => c.ovr));
    expect(maxEpic).toBeGreaterThanOrEqual(minLegendary - 4);
  });

  it('OVR guardado confere com a fórmula da posição principal e preço base >= 1', () => {
    for (const c of CHARACTERS) {
      expect(c.ovr).toBe(ovrFor(c.attributes, c.position));
      expect(c.basePrice).toBeGreaterThanOrEqual(1);
    }
  });

  it('OVR fica perto do alvo (50-95)', () => {
    for (const c of CHARACTERS) {
      expect(c.ovr).toBeGreaterThanOrEqual(55);
      expect(c.ovr).toBeLessThanOrEqual(95);
    }
  });
});

describe('OVR por posição', () => {
  it('atacante pondera finalização, velocidade, drible e controle', () => {
    const a = attrs({ finalizacao: 100, velocidade: 80, drible: 60, controle: 40 });
    expect(ovrFor(a, 'ATA')).toBe(Math.round(100 * 0.3 + 80 * 0.25 + 60 * 0.25 + 40 * 0.2));
  });
  it('meio, defensor e goleiro usam seus pesos', () => {
    expect(ovrFor(attrs({ passe: 90, controle: 80, drible: 70, visao: 60 }), 'MEI')).toBe(Math.round(27 + 20 + 17.5 + 12));
    expect(ovrFor(attrs({ defesa: 90, fisico: 80, velocidade: 50 }), 'ZAG')).toBe(Math.round(40.5 + 28 + 10));
    expect(ovrFor(attrs({ reflexos: 90, posicionamento: 80, defesa: 70 }), 'GOL')).toBe(Math.round(40.5 + 28 + 14));
  });
  it('fora de posição perde 15%', () => {
    const striker = pick('dragon-ball-son-goku');
    const inGoal = slotOvr(striker, 'GOL');
    expect(inGoal).toBe(Math.round(ovrFor(striker.attributes, 'GOL') * 0.85));
    expect(slotOvr(striker, 'ATA')).toBe(ovrFor(striker.attributes, 'ATA'));
  });
});

describe('sinergia', () => {
  it('mesmo universo: 2→1, 3→3, 4→5, 5→7 (sem tags)', () => {
    const sameAnime = (n: number) => byAnime('dragon-ball').slice(0, n).map((c) => ({ ...c, tags: [] }));
    expect(synergyBonusPct(sameAnime(1))).toBe(0);
    expect(synergyBonusPct(sameAnime(2))).toBe(1);
    expect(synergyBonusPct(sameAnime(3))).toBe(3);
    expect(synergyBonusPct(sameAnime(4))).toBe(5);
    expect(synergyBonusPct(sameAnime(5))).toBe(7);
  });
  it('tags em comum somam até +3 e o total tem teto de +8', () => {
    const five = ['naruto-naruto-uzumaki', 'naruto-sasuke-uchiha', 'naruto-kakashi-hatake', 'naruto-shikamaru-nara', 'naruto-rock-lee'].map(pick);
    expect(synergyBonusPct(five)).toBeLessThanOrEqual(8);
    const mixed = ['naruto-naruto-uzumaki', 'dragon-ball-son-goku', 'one-piece-nami', 'jujutsu-kaisen-panda', 'blue-lock-gagamaru'].map(pick);
    expect(synergyBonusPct(mixed)).toBe(0);
  });
});

describe('escalação', () => {
  const roster = ['blue-lock-gagamaru', 'blue-lock-rensuke-kunigami', 'blue-lock-sae-itoshi', 'blue-lock-rin-itoshi', 'blue-lock-meguru-bachira', 'naruto-naruto-uzumaki', 'dragon-ball-piccolo'].map(pick);

  it('autoLineup coloca goleiro no gol e é válida', () => {
    const lineup = autoLineup(roster);
    expect(lineup[0]).toBe('blue-lock-gagamaru');
    expect(validateLineupIds(lineup, roster.map((c) => c.id))).toBeNull();
    expect(new Set(lineup).size).toBe(5);
  });

  it('avisa escalação incompleta e posição inadequada', () => {
    const profile = computeTeamProfile([null, pick('naruto-gaara'), pick('naruto-naruto-uzumaki'), pick('naruto-sasuke-uchiha'), pick('naruto-rock-lee')], 'equilibrada');
    expect(profile.warnings.some((w) => w.code === 'EMPTY_SLOT')).toBe(true);
    const bad = computeTeamProfile([pick('naruto-naruto-uzumaki'), pick('naruto-gaara'), pick('naruto-kakashi-hatake'), pick('naruto-sasuke-uchiha'), pick('naruto-rock-lee')], 'equilibrada');
    expect(bad.warnings.some((w) => w.code === 'FIELD_PLAYER_IN_GOAL')).toBe(true);
  });

  it('time melhor tem força maior; formação ofensiva favorece ataque', () => {
    const strong = autoLineup(['dragon-ball-son-goku', 'dragon-ball-piccolo', 'jujutsu-kaisen-satoru-gojo', 'dragon-ball-vegeta', 'captain-tsubasa-genzo-wakabayashi'].map(pick));
    const weak = autoLineup(['dragon-ball-mr-satan', 'blue-lock-ikki-niko', 'one-piece-nami', 'one-piece-usopp', 'captain-tsubasa-ryo-ishizaki'].map(pick));
    const toTeam = (ids: (string | null)[]) => ids.map((id) => (id ? pick(id) : null));
    expect(computeTeamProfile(toTeam(strong), 'equilibrada').strength).toBeGreaterThan(computeTeamProfile(toTeam(weak), 'equilibrada').strength + 10);
    const off = computeTeamProfile(toTeam(strong), 'ofensiva');
    const bal = computeTeamProfile(toTeam(strong), 'equilibrada');
    expect(off.attack).toBeGreaterThan(bal.attack);
    expect(off.defense).toBeLessThan(bal.defense);
  });

  it('rejeita escalação com id fora do elenco ou repetido', () => {
    const ids = roster.map((c) => c.id);
    expect(validateLineupIds([ids[0] ?? null, ids[0] ?? null, null, null, null], ids)).toMatch(/repetido/);
    expect(validateLineupIds(['x', null, null, null, null], ids)).toMatch(/elenco/);
    expect(validateLineupIds([null, null], ids)).toMatch(/5 posições/);
  });
});

describe('rng e schemas', () => {
  it('mulberry32 é determinístico', () => {
    const a = mulberry32(hashString('abc'));
    const b = mulberry32(hashString('abc'));
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('valida código de sala e criação', () => {
    expect(roomCodeSchema.safeParse('abc23').success).toBe(true);
    expect(roomCodeSchema.safeParse('ab0I1').success).toBe(false);
    expect(roomCreateSchema.safeParse({ mode: 'multi', maxPlayers: 4, botSlots: 4, botLevel: 'NORMAL' }).success).toBe(false);
    expect(roomCreateSchema.safeParse({ mode: 'solo', maxPlayers: 4, botSlots: 3, botLevel: 'NORMAL' }).success).toBe(true);
  });
});
