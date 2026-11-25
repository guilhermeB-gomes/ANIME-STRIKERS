import type { Attributes, AttributeKey, Position } from './types';

/** Pesos do OVR por posição. Cada linha soma 1. Documentado em docs/REGRAS_DO_JOGO.md. */
export const OVR_WEIGHTS: Record<Position, Partial<Record<AttributeKey, number>>> = {
  ATA: { finalizacao: 0.3, velocidade: 0.25, drible: 0.25, controle: 0.2 },
  MEI: { passe: 0.3, controle: 0.25, drible: 0.25, visao: 0.2 },
  ZAG: { defesa: 0.45, fisico: 0.35, velocidade: 0.2 },
  GOL: { reflexos: 0.45, posicionamento: 0.35, defesa: 0.2 },
};

export const OUT_OF_POSITION_FACTOR = 0.85;

export function clampAttr(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

/** OVR de um conjunto de atributos em uma posição (1-100). */
export function ovrFor(attributes: Attributes, position: Position): number {
  const weights = OVR_WEIGHTS[position];
  let total = 0;
  for (const [key, weight] of Object.entries(weights) as [AttributeKey, number][]) {
    total += attributes[key] * weight;
  }
  return clampAttr(total);
}
