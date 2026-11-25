import { CHARACTERS, CHARACTERS_PER_PLAYER, mulberry32, shuffle } from '@strikers/shared';

/** Fila de leilão determinística pela seed da sala: participantes × 7 personagens (limitado ao catálogo). */
export function buildAuctionQueue(seed: number, participantCount: number): string[] {
  const size = Math.min(CHARACTERS.length, participantCount * CHARACTERS_PER_PLAYER);
  return shuffle(
    CHARACTERS.map((c) => c.id),
    mulberry32(seed),
  ).slice(0, size);
}
