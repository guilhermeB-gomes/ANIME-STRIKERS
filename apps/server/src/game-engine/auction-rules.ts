import {
  ANTI_SNIPE_EXTENSION_MS,
  ANTI_SNIPE_WINDOW_MS,
  BID_INCREMENT,
  MAX_ROSTER,
  MIN_PRICE,
  STARTERS,
  type ErrorCode,
} from '@strikers/shared';

export interface BidContext {
  auctionStatus: 'ACTIVE' | 'CLOSED';
  now: number;
  endsAt: number;
  startingBid: number;
  currentBid: number | null;
  leaderId: string | null;
  bidderId: string;
  bidderBudget: number;
  bidderRosterSize: number;
  characterAlreadyOwned: boolean;
  amount: number;
}

export type BidCheck = { ok: true } | { ok: false; code: ErrorCode; message: string };

/** Menor lance aceito agora: valor inicial ou lance atual + incremento. */
export function minNextBid(startingBid: number, currentBid: number | null): number {
  return currentBid === null ? startingBid : currentBid + BID_INCREMENT;
}

/**
 * Reserva obrigatória: depois de contratar este personagem o treinador ainda precisa
 * completar os titulares com, no mínimo, MIN_PRICE por vaga restante.
 */
export function budgetReserve(rosterSizeBefore: number): number {
  return Math.max(0, STARTERS - (rosterSizeBefore + 1)) * MIN_PRICE;
}

/** Maior lance que o treinador pode dar respeitando orçamento e reserva. */
export function maxAffordableBid(budget: number, rosterSizeBefore: number): number {
  return budget - budgetReserve(rosterSizeBefore);
}

/** Validação de lance executada SEMPRE no servidor, na ordem documentada em REGRAS_DO_JOGO.md. */
export function validateBid(ctx: BidContext): BidCheck {
  if (ctx.auctionStatus !== 'ACTIVE' || ctx.now >= ctx.endsAt) {
    return { ok: false, code: 'AUCTION_CLOSED', message: 'Este leilão já foi encerrado.' };
  }
  if (ctx.leaderId === ctx.bidderId) {
    return { ok: false, code: 'ALREADY_LEADING', message: 'Você já está liderando este leilão.' };
  }
  if (ctx.characterAlreadyOwned) {
    return { ok: false, code: 'ALREADY_OWNED', message: 'Este personagem já foi contratado nesta sala.' };
  }
  if (ctx.bidderRosterSize >= MAX_ROSTER) {
    return { ok: false, code: 'ROSTER_FULL', message: `Seu elenco já tem ${MAX_ROSTER} personagens.` };
  }
  const min = minNextBid(ctx.startingBid, ctx.currentBid);
  if (!Number.isInteger(ctx.amount) || ctx.amount < min) {
    return { ok: false, code: 'BID_TOO_LOW', message: `O lance mínimo agora é ${min} M.` };
  }
  const max = maxAffordableBid(ctx.bidderBudget, ctx.bidderRosterSize);
  if (ctx.amount > max) {
    return {
      ok: false,
      code: 'INSUFFICIENT_BUDGET',
      message:
        ctx.amount <= ctx.bidderBudget
          ? `Você precisa reservar moedas para completar seu time. Máximo agora: ${Math.max(0, max)} M.`
          : `Orçamento insuficiente. Você tem ${ctx.bidderBudget} M.`,
    };
  }
  return { ok: true };
}

/** Anti-sniping: lance nos últimos 3 s adiciona 5 s ao fim atual. */
export function nextEndsAt(now: number, endsAt: number, windowMs = ANTI_SNIPE_WINDOW_MS, extensionMs = ANTI_SNIPE_EXTENSION_MS): number {
  return endsAt - now <= windowMs ? endsAt + extensionMs : endsAt;
}
