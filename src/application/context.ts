import type { StyrkaDB, OutboxEntry, OutboxOp } from '../storage/db';
import type { SyncTransport } from '../server/transport';

export interface Clock {
  now(): string;
}
export const systemClock: Clock = { now: () => new Date().toISOString() };

export interface IdGen {
  uuid(): string;
}
export const cryptoIds: IdGen = { uuid: () => crypto.randomUUID() };

/** Beroenden för alla use cases. UI anropar endast via dessa tjänster (03 §1). */
export type AppContext = {
  db: StyrkaDB;
  userId: string;
  transport: SyncTransport;
  clock: Clock;
  ids: IdGen;
  isOnline: () => boolean;
  /** Anropas efter lokal commit som köat något (t.ex. för att trigga synk). */
  onQueued?: () => void;
};

export type Result<T = void> = ({ ok: true } & (T extends void ? unknown : { value: T })) | { ok: false; code: AppErrorCode; field?: string };

export type AppErrorCode = 'VALIDATION_ERROR' | 'LOCAL_SAVE_FAILED' | 'NOT_FOUND' | 'INVALID_STATE' | 'PRIVACY_CONSENT_REQUIRED' | 'RULE_UNSATISFIABLE' | 'OFFLINE' | 'AUTH_REQUIRED' | 'FORBIDDEN' | 'DB_UNAVAILABLE' | 'PENDING_SYNC';

export function outbox(ctx: AppContext, recordId: string, op: OutboxOp): OutboxEntry {
  return { eventId: ctx.ids.uuid(), recordId, op, createdAt: ctx.clock.now(), attempts: 0, status: 'pending', lastError: null };
}

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    readonly field?: string,
  ) {
    super(field ? `${code}:${field}` : code);
  }
}
