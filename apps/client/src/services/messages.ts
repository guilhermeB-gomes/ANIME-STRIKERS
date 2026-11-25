import type { ErrorCode } from '@strikers/shared';

/** Mensagens amigáveis por código de erro (usadas quando o servidor não manda uma mais específica). */
export const FRIENDLY: Record<ErrorCode, string> = {
  VALIDATION: 'Confira os dados informados.',
  UNAUTHENTICATED: 'Sua sessão expirou. Entre novamente.',
  ROOM_NOT_FOUND: 'Sala não encontrada. Confira o código.',
  INVALID_CODE: 'Código inválido. Ele tem 5 letras/números.',
  ROOM_FULL: 'Esta sala está cheia.',
  ROOM_STARTED: 'Esta partida já começou.',
  NOT_HOST: 'Apenas o anfitrião pode fazer isso.',
  NOT_PARTICIPANT: 'Você não participa desta sala.',
  NOT_ENOUGH_PLAYERS: 'Faltam participantes para começar.',
  WRONG_PHASE: 'Essa ação não está disponível agora.',
  AUCTION_CLOSED: 'Leilão encerrado.',
  AUCTION_MISMATCH: 'Esse leilão já mudou.',
  BID_TOO_LOW: 'Lance rejeitado: alguém cobriu primeiro.',
  ALREADY_LEADING: 'Você já está liderando.',
  INSUFFICIENT_BUDGET: 'Orçamento insuficiente.',
  ROSTER_FULL: 'Elenco completo.',
  ALREADY_OWNED: 'Esse personagem já foi contratado.',
  INVALID_LINEUP: 'Escalação inválida.',
  RATE_LIMITED: 'Calma! Muitas ações em pouco tempo.',
  INTERNAL: 'Erro no servidor. Tente de novo em instantes.',
};
