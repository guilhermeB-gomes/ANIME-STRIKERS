import { z } from 'zod';
import { MAX_PARTICIPANTS, MIN_PARTICIPANTS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, STARTERS } from './constants';

export const botLevelSchema = z.enum(['FACIL', 'NORMAL', 'DIFICIL']);
export const formationSchema = z.enum(['equilibrada', 'defensiva', 'ofensiva']);

export const guestNameSchema = z
  .string()
  .trim()
  .min(2, 'O nome precisa ter pelo menos 2 caracteres.')
  .max(20, 'O nome pode ter no máximo 20 caracteres.')
  .regex(/^[\p{L}\p{N} _.-]+$/u, 'Use apenas letras, números, espaço, ponto, hífen ou sublinhado.');

export const guestCreateSchema = z.object({ name: guestNameSchema });

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(ROOM_CODE_LENGTH, 'Código inválido.')
  .refine((code) => [...code].every((ch) => ROOM_CODE_ALPHABET.includes(ch)), 'Código inválido.');

const roomSettingsFields = {
  maxPlayers: z.number().int().min(MIN_PARTICIPANTS).max(MAX_PARTICIPANTS),
  botSlots: z.number().int().min(0).max(MAX_PARTICIPANTS - 1),
  botLevel: botLevelSchema,
};

const botSlotsFit = (v: { maxPlayers: number; botSlots: number }) => v.botSlots <= v.maxPlayers - 1;

export const roomSettingsSchema = z.object(roomSettingsFields).refine(botSlotsFit, {
  message: 'Os bots precisam deixar pelo menos uma vaga para humanos.',
  path: ['botSlots'],
});

export const roomCreateSchema = z
  .object({ mode: z.enum(['solo', 'multi']), ...roomSettingsFields })
  .refine(botSlotsFit, { message: 'Os bots precisam deixar pelo menos uma vaga para humanos.', path: ['botSlots'] });

export const roomJoinSchema = z.object({ code: roomCodeSchema });

export const emptyPayloadSchema = z.object({}).strict().or(z.undefined()).or(z.null());

export const playRoundSchema = z.object({ all: z.boolean().optional() }).optional();

export const bidSchema = z.object({
  auctionId: z.string().min(1).max(64),
  amount: z.number().int().min(1).max(1000),
});

export const lineupSchema = z.object({
  formation: formationSchema,
  lineup: z.array(z.string().min(1).max(100).nullable()).length(STARTERS),
});

export type RoomCreateInput = z.infer<typeof roomCreateSchema>;
export type RoomSettingsInput = z.infer<typeof roomSettingsSchema>;
export type BidInput = z.infer<typeof bidSchema>;
export type LineupInput = z.infer<typeof lineupSchema>;
