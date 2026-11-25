import { ABILITIES, ANIMES, CHARACTERS } from '@strikers/shared';
import type { PrismaClient } from '../generated/prisma/client';

/** Carrega animes, habilidades e personagens do catálogo compartilhado. Idempotente (upsert). */
export async function seedCatalog(prisma: PrismaClient): Promise<{ animes: number; abilities: number; characters: number }> {
  for (const a of ANIMES) {
    await prisma.anime.upsert({ where: { id: a.id }, create: { id: a.id, name: a.name, color: a.color }, update: { name: a.name, color: a.color } });
  }
  for (const ab of Object.values(ABILITIES)) {
    const data = { name: ab.name, description: ab.description, trigger: ab.trigger, magnitude: ab.magnitude, chance: ab.chance, maxUses: ab.maxUses };
    await prisma.characterAbility.upsert({ where: { id: ab.id }, create: { id: ab.id, ...data }, update: data });
  }
  for (const c of CHARACTERS) {
    const data = {
      animeId: c.animeId,
      abilityId: c.abilityId,
      name: c.name,
      position: c.position,
      secondaryPositions: c.secondaryPositions,
      rarity: c.rarity,
      ovr: c.ovr,
      basePrice: c.basePrice,
      description: c.description,
      tags: c.tags,
      ...c.attributes,
    };
    await prisma.character.upsert({ where: { id: c.id }, create: { id: c.id, ...data }, update: data });
  }
  return { animes: ANIMES.length, abilities: Object.keys(ABILITIES).length, characters: CHARACTERS.length };
}
