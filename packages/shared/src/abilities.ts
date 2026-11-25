import type { Ability, AbilityId } from './types';

/**
 * Habilidades especiais. Todas influenciam a simulação (ver apps/server/src/game-engine/match.ts).
 * Teto global: nenhuma habilidade passa de +25% e cada uma tem limite de usos por partida.
 */
export const ABILITIES: Record<AbilityId, Ability> = {
  finalizacao_precisao: {
    id: 'finalizacao_precisao',
    name: 'Finalização de Precisão',
    description: 'Ao finalizar, 15% mais qualidade no chute. Até 3 vezes por partida.',
    trigger: 'FINALIZAR',
    magnitude: 0.15,
    chance: 0.6,
    maxUses: 3,
  },
  velocidade_explosiva: {
    id: 'velocidade_explosiva',
    name: 'Velocidade Explosiva',
    description: 'Em contra-ataques, 20% mais força na criação da jogada. Até 2 vezes por partida.',
    trigger: 'CONTRA_ATAQUE',
    magnitude: 0.2,
    chance: 0.7,
    maxUses: 2,
  },
  visao_de_jogo: {
    id: 'visao_de_jogo',
    name: 'Visão de Jogo',
    description: 'Ao criar a jogada, 15% mais chance de achar o passe decisivo. Até 3 vezes por partida.',
    trigger: 'CRIAR_JOGADA',
    magnitude: 0.15,
    chance: 0.6,
    maxUses: 3,
  },
  drible_imprevisivel: {
    id: 'drible_imprevisivel',
    name: 'Drible Imprevisível',
    description: 'Ao driblar, 20% mais vantagem sobre a defesa. Até 2 vezes por partida.',
    trigger: 'DRIBLAR',
    magnitude: 0.2,
    chance: 0.55,
    maxUses: 2,
  },
  defesa_absoluta: {
    id: 'defesa_absoluta',
    name: 'Defesa Absoluta',
    description: 'Ao ser atacado, reduz em 20% a qualidade do ataque rival. Até 2 vezes por partida.',
    trigger: 'SER_ATACADO',
    magnitude: 0.2,
    chance: 0.5,
    maxUses: 2,
  },
  reflexo_extraordinario: {
    id: 'reflexo_extraordinario',
    name: 'Reflexo Extraordinário',
    description: 'Em chutes ao gol, 20% mais chance de defesa. Até 2 vezes por partida.',
    trigger: 'CHUTE_NO_GOL',
    magnitude: 0.2,
    chance: 0.6,
    maxUses: 2,
  },
  chute_longa_distancia: {
    id: 'chute_longa_distancia',
    name: 'Chute de Longa Distância',
    description: 'Permite finalizar pelo meio sem passar pela defesa, com 10% menos qualidade. Até 2 vezes por partida.',
    trigger: 'ATAQUE_PELO_MEIO',
    magnitude: 0.1,
    chance: 0.35,
    maxUses: 2,
  },
};

export function getAbility(id: AbilityId): Ability {
  return ABILITIES[id];
}
