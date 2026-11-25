import { ABILITIES } from './abilities';
import { hashString, mulberry32 } from './rng';
import { OVR_WEIGHTS, clampAttr, ovrFor } from './ovr';
import type { AbilityId, Anime, AttributeKey, Attributes, Character, Position, Rarity } from './types';
import { ATTRIBUTE_KEYS } from './types';

/**
 * Catálogo de demonstração (56 personagens, 8 por universo).
 * Fan game não oficial: nomes pertencem às respectivas franquias; sem imagens oficiais.
 * Para adicionar um universo: inclua em ANIMES e acrescente linhas em ROSTER. Nada mais precisa mudar.
 */
export const ANIMES: Anime[] = [
  { id: 'blue-lock', name: 'Blue Lock', color: '#2f7bff' },
  { id: 'naruto', name: 'Naruto', color: '#ff8a1f' },
  { id: 'dragon-ball', name: 'Dragon Ball', color: '#ffc21a' },
  { id: 'one-piece', name: 'One Piece', color: '#e5483c' },
  { id: 'jujutsu-kaisen', name: 'Jujutsu Kaisen', color: '#8b5cf6' },
  { id: 'inazuma-eleven', name: 'Inazuma Eleven', color: '#22c1c3' },
  { id: 'captain-tsubasa', name: 'Captain Tsubasa', color: '#3ecf72' },
];

type Row = [name: string, position: Position, secondary: Position[], rarity: Rarity, targetOvr: number, ability: AbilityId, tags: string[]];

const ROSTER: Record<string, Row[]> = {
  'blue-lock': [
    ['Yoichi Isagi', 'MEI', ['ATA'], 'EPICO', 80, 'visao_de_jogo', ['time-z']],
    ['Meguru Bachira', 'ATA', ['MEI'], 'LENDARIO', 83, 'drible_imprevisivel', ['time-z']],
    ['Seishiro Nagi', 'ATA', [], 'LENDARIO', 85, 'finalizacao_precisao', ['rivais-bl']],
    ['Rin Itoshi', 'ATA', ['MEI'], 'MITICO', 89, 'chute_longa_distancia', ['irmaos-itoshi']],
    ['Sae Itoshi', 'MEI', [], 'MITICO', 90, 'visao_de_jogo', ['irmaos-itoshi']],
    ['Rensuke Kunigami', 'ZAG', ['ATA'], 'RARO', 72, 'velocidade_explosiva', ['time-z']],
    ['Ikki Niko', 'ZAG', [], 'COMUM', 66, 'defesa_absoluta', ['rivais-bl']],
    ['Gagamaru', 'GOL', [], 'COMUM', 62, 'reflexo_extraordinario', ['time-z']],
  ],
  naruto: [
    ['Naruto Uzumaki', 'ATA', ['MEI'], 'MITICO', 88, 'velocidade_explosiva', ['time-7']],
    ['Sasuke Uchiha', 'ATA', [], 'LENDARIO', 87, 'finalizacao_precisao', ['time-7']],
    ['Kakashi Hatake', 'MEI', ['ZAG'], 'LENDARIO', 83, 'visao_de_jogo', ['time-7']],
    ['Shikamaru Nara', 'MEI', [], 'EPICO', 79, 'visao_de_jogo', ['konoha-11']],
    ['Rock Lee', 'ATA', ['ZAG'], 'RARO', 74, 'velocidade_explosiva', ['konoha-11']],
    ['Gaara', 'ZAG', ['GOL'], 'EPICO', 80, 'defesa_absoluta', ['kage']],
    ['Might Guy', 'ZAG', [], 'EPICO', 78, 'defesa_absoluta', ['konoha-11']],
    ['Choji Akimichi', 'GOL', ['ZAG'], 'COMUM', 64, 'reflexo_extraordinario', ['konoha-11']],
  ],
  'dragon-ball': [
    ['Son Goku', 'ATA', ['MEI'], 'MITICO', 91, 'velocidade_explosiva', ['z-fighters']],
    ['Vegeta', 'ATA', [], 'LENDARIO', 88, 'finalizacao_precisao', ['saiyajins']],
    ['Trunks', 'ATA', ['MEI'], 'EPICO', 80, 'drible_imprevisivel', ['saiyajins']],
    ['Son Gohan', 'MEI', ['ATA'], 'LENDARIO', 84, 'chute_longa_distancia', ['z-fighters']],
    ['Kuririn', 'MEI', [], 'RARO', 67, 'visao_de_jogo', ['z-fighters']],
    ['Piccolo', 'ZAG', [], 'EPICO', 81, 'defesa_absoluta', ['z-fighters']],
    ['Tenshinhan', 'ZAG', [], 'RARO', 73, 'defesa_absoluta', ['z-fighters']],
    ['Mr. Satan', 'GOL', [], 'COMUM', 60, 'reflexo_extraordinario', []],
  ],
  'one-piece': [
    ['Monkey D. Luffy', 'ATA', ['MEI'], 'MITICO', 88, 'velocidade_explosiva', ['trio-monstro']],
    ['Roronoa Zoro', 'ZAG', ['ATA'], 'LENDARIO', 86, 'defesa_absoluta', ['trio-monstro']],
    ['Sanji', 'ATA', ['MEI'], 'LENDARIO', 84, 'drible_imprevisivel', ['trio-monstro']],
    ['Nami', 'MEI', [], 'RARO', 70, 'visao_de_jogo', ['mugiwara']],
    ['Nico Robin', 'MEI', [], 'EPICO', 76, 'visao_de_jogo', ['mugiwara']],
    ['Jinbe', 'ZAG', [], 'EPICO', 79, 'defesa_absoluta', ['mugiwara']],
    ['Usopp', 'ATA', [], 'COMUM', 62, 'chute_longa_distancia', ['mugiwara']],
    ['Franky', 'GOL', ['ZAG'], 'RARO', 71, 'reflexo_extraordinario', ['mugiwara']],
  ],
  'jujutsu-kaisen': [
    ['Satoru Gojo', 'MEI', ['ZAG'], 'MITICO', 90, 'visao_de_jogo', ['jujutsu-tokyo']],
    ['Ryomen Sukuna', 'ATA', [], 'MITICO', 89, 'finalizacao_precisao', ['maldicoes']],
    ['Yuji Itadori', 'ATA', ['MEI'], 'EPICO', 80, 'velocidade_explosiva', ['jujutsu-tokyo']],
    ['Megumi Fushiguro', 'MEI', ['ZAG'], 'EPICO', 78, 'drible_imprevisivel', ['jujutsu-tokyo']],
    ['Nobara Kugisaki', 'ATA', [], 'RARO', 73, 'chute_longa_distancia', ['jujutsu-tokyo']],
    ['Toge Inumaki', 'ZAG', [], 'RARO', 71, 'defesa_absoluta', ['jujutsu-tokyo']],
    ['Maki Zenin', 'ZAG', ['ATA'], 'EPICO', 77, 'defesa_absoluta', ['zenin']],
    ['Panda', 'GOL', ['ZAG'], 'RARO', 70, 'reflexo_extraordinario', ['jujutsu-tokyo']],
  ],
  'inazuma-eleven': [
    ['Endou Mamoru', 'GOL', [], 'EPICO', 79, 'reflexo_extraordinario', ['raimon']],
    ['Gouenji Shuuya', 'ATA', [], 'LENDARIO', 85, 'finalizacao_precisao', ['raimon']],
    ['Fubuki Shirou', 'ATA', ['ZAG'], 'EPICO', 78, 'chute_longa_distancia', ['raimon']],
    ['Someoka Ryuugo', 'ATA', [], 'COMUM', 67, 'chute_longa_distancia', ['raimon']],
    ['Kidou Yuuto', 'MEI', [], 'EPICO', 80, 'visao_de_jogo', ['teikoku']],
    ['Fudou Akio', 'MEI', ['ATA'], 'RARO', 74, 'drible_imprevisivel', ['teikoku']],
    ['Kazemaru Ichirouta', 'ZAG', ['ATA'], 'RARO', 71, 'velocidade_explosiva', ['raimon']],
    ['Kabeyama Heigorou', 'ZAG', [], 'COMUM', 66, 'defesa_absoluta', ['raimon']],
  ],
  'captain-tsubasa': [
    ['Tsubasa Ozora', 'MEI', ['ATA'], 'LENDARIO', 86, 'drible_imprevisivel', ['nankatsu']],
    ['Taro Misaki', 'MEI', [], 'EPICO', 79, 'visao_de_jogo', ['nankatsu']],
    ['Jun Misugi', 'MEI', [], 'EPICO', 77, 'visao_de_jogo', ['nankatsu']],
    ['Kojiro Hyuga', 'ATA', [], 'LENDARIO', 85, 'finalizacao_precisao', ['toho']],
    ['Takeshi Kishida', 'ATA', [], 'RARO', 72, 'velocidade_explosiva', ['toho']],
    ['Ryo Ishizaki', 'ZAG', [], 'COMUM', 62, 'defesa_absoluta', ['nankatsu']],
    ['Mamoru Izawa', 'ZAG', [], 'RARO', 70, 'defesa_absoluta', ['toho']],
    ['Genzo Wakabayashi', 'GOL', [], 'LENDARIO', 84, 'reflexo_extraordinario', ['toho']],
  ],
};

const RARITY_BASE: Record<Rarity, number> = { COMUM: 1, RARO: 2, EPICO: 4, LENDARIO: 6, MITICO: 8 };
const POSITION_LABEL: Record<Position, string> = { GOL: 'goleiro', ZAG: 'defensor', MEI: 'meio-campista', ATA: 'atacante' };

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Perfil de atributos DETERMINÍSTICO: depende só do id do personagem (hash FNV-1a + mulberry32).
 * Os atributos-chave da posição ficam em torno do OVR-alvo; os demais ficam bem abaixo.
 * Posições secundárias recebem atributos-chave a ~6 pontos do alvo. Nunca muda entre execuções.
 */
export function buildAttributes(id: string, position: Position, secondary: Position[], target: number): Attributes {
  const rng = mulberry32(hashString(id));
  const jitter = (range: number) => Math.round((rng() * 2 - 1) * range);
  const attrs = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    const isGoalkeeperKey = key === 'reflexos' || key === 'posicionamento';
    const base = position === 'GOL' ? (isGoalkeeperKey || key === 'defesa' ? target : target - 30) : isGoalkeeperKey ? 22 : target - 24;
    attrs[key] = clampAttr(base + jitter(position === 'GOL' || !isGoalkeeperKey ? 7 : 8));
  }
  const keyAttrs = (pos: Position, level: number) => {
    for (const key of Object.keys(OVR_WEIGHTS[pos]) as AttributeKey[]) {
      attrs[key] = clampAttr(Math.max(pos === position ? 0 : attrs[key], level + jitter(3)));
    }
  };
  for (const pos of secondary) keyAttrs(pos, target - 6);
  keyAttrs(position, target);
  return attrs;
}

function buildCharacter(animeId: string, row: Row): Character {
  const [name, position, secondary, rarity, target, abilityId, tags] = row;
  const id = `${animeId}-${slugify(name)}`;
  const attributes = buildAttributes(id, position, secondary, target);
  const ovr = ovrFor(attributes, position);
  const anime = ANIMES.find((a) => a.id === animeId);
  const basePrice = Math.max(1, RARITY_BASE[rarity] + Math.floor(Math.max(0, ovr - 75) / 5));
  return {
    id,
    name,
    animeId,
    position,
    secondaryPositions: secondary,
    rarity,
    attributes,
    abilityId,
    description: `${name} (${anime?.name ?? animeId}) atua como ${POSITION_LABEL[position]}. ${ABILITIES[abilityId].description}`,
    basePrice,
    ovr,
    tags,
  };
}

export const CHARACTERS: Character[] = Object.entries(ROSTER).flatMap(([animeId, rows]) => rows.map((row) => buildCharacter(animeId, row)));

const BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]));

export function getCharacter(id: string): Character {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Personagem inexistente: ${id}`);
  return found;
}

export function findCharacter(id: string): Character | undefined {
  return BY_ID.get(id);
}

export function getAnime(id: string): Anime {
  const found = ANIMES.find((a) => a.id === id);
  if (!found) throw new Error(`Anime inexistente: ${id}`);
  return found;
}
