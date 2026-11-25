import type { ErrorCode } from '@strikers/shared';

/** Erro de regra de negócio, convertido em resposta padronizada (HTTP ou ack do Socket.IO). */
export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
