import type { EquipmentSlug } from '../domain/catalog';
import type { ServerTable } from '../storage/db';

/** Svarskuvert för skrivoperationer (03 §6, 09 §1). */
export type MutationEnvelope = {
  status: 'applied' | 'duplicate' | 'conflict' | 'rejected';
  recordId?: string;
  revision?: number | null;
  serverTime?: string;
  code?: string;
  field?: string;
  server?: Record<string, unknown>;
};

export type TransportErrorCode = 'OFFLINE' | 'DB_UNAVAILABLE' | 'AUTH_REQUIRED' | 'FORBIDDEN' | 'VALIDATION_ERROR' | 'PRIVACY_CONSENT_REQUIRED';

export class TransportError extends Error {
  constructor(
    readonly code: TransportErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
  /** Ska köposten ligga kvar och försökas igen senare? */
  get retryable(): boolean {
    return this.code === 'OFFLINE' || this.code === 'DB_UNAVAILABLE' || this.code === 'AUTH_REQUIRED';
  }
}

export type ProfilePatchResult = { status: 'applied'; revision: number } | { status: 'conflict'; revision: number; server: Record<string, unknown> };

/** Rådata från servern (snake_case-rader) för hydrering av ny enhet. */
export type ServerSnapshot = {
  profile: Record<string, unknown> | null;
  equipment: string[];
  exerciseProfiles: Record<string, unknown>[];
  consents: Record<string, unknown>[];
  restrictions: Record<string, unknown>[];
  symptoms: Record<string, unknown>[];
  programs: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  sessionExercises: Record<string, unknown>[];
  sets: Record<string, unknown>[];
  audits: Record<string, unknown>[];
  /** Tillägg CR 2026-10-10-01 (tomma listor mot äldre server). */
  calibrations: Record<string, unknown>[];
  substitutionEvents: Record<string, unknown>[];
};

export interface SyncTransport {
  applySetMutation(eventId: string, setId: string, baseRevision: number | null, payload: Record<string, unknown>): Promise<MutationEnvelope>;
  upsert(table: ServerTable, row: Record<string, unknown>, opts?: { immutable?: boolean }): Promise<void>;
  remove(table: ServerTable, id: string, idColumn?: string): Promise<void>;
  patchProfile(userId: string, baseRevision: number, patch: Record<string, unknown>): Promise<ProfilePatchResult>;
  replaceEquipment(userId: string, equipment: EquipmentSlug[]): Promise<void>;
  eraseHealthData(): Promise<void>;
  deleteAccount(): Promise<void>;
  pullAll(userId: string): Promise<ServerSnapshot>;
}
