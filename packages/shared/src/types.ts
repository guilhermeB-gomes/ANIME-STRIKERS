export const POSITIONS = ['GOL', 'ZAG', 'MEI', 'ATA'] as const;
export type Position = (typeof POSITIONS)[number];

export const RARITIES = ['COMUM', 'RARO', 'EPICO', 'LENDARIO', 'MITICO'] as const;
export type Rarity = (typeof RARITIES)[number];

export const ATTRIBUTE_KEYS = [
  'velocidade',
  'finalizacao',
  'passe',
  'drible',
  'defesa',
  'fisico',
  'controle',
  'visao',
  'reflexos',
  'posicionamento',
] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];
export type Attributes = Record<AttributeKey, number>;

export const ABILITY_IDS = [
  'finalizacao_precisao',
  'velocidade_explosiva',
  'visao_de_jogo',
  'drible_imprevisivel',
  'defesa_absoluta',
  'reflexo_extraordinario',
  'chute_longa_distancia',
] as const;
export type AbilityId = (typeof ABILITY_IDS)[number];

export type AbilityTrigger = 'FINALIZAR' | 'CONTRA_ATAQUE' | 'CRIAR_JOGADA' | 'DRIBLAR' | 'SER_ATACADO' | 'CHUTE_NO_GOL' | 'ATAQUE_PELO_MEIO';

export interface Ability {
  id: AbilityId;
  name: string;
  description: string;
  trigger: AbilityTrigger;
  /** Bônus aplicado (ex.: 0.15 = +15%). */
  magnitude: number;
  /** Probabilidade de ativar quando a condição ocorre. */
  chance: number;
  /** Máximo de ativações por partida. */
  maxUses: number;
}

export interface Anime {
  id: string;
  name: string;
  /** Cor de identidade (hex) usada nas cartas e avatares. */
  color: string;
}

export interface Character {
  id: string;
  name: string;
  animeId: string;
  position: Position;
  secondaryPositions: Position[];
  rarity: Rarity;
  attributes: Attributes;
  abilityId: AbilityId;
  description: string;
  /** Valor inicial de leilão (M). */
  basePrice: number;
  /** OVR na posição principal. */
  ovr: number;
  /** Tags de sinergia (pares/grupos canônicos). */
  tags: string[];
}

export type Formation = 'equilibrada' | 'defensiva' | 'ofensiva';
export type BotLevel = 'FACIL' | 'NORMAL' | 'DIFICIL';
