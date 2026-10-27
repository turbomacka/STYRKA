import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseTransport } from '../../src/server/supabaseTransport';

const future = { code: 'PGRST303', message: 'JWT issued at future' };
function setup(errors: Array<{ code: string; message: string } | null>, status = 401) {
  const calls: Array<{ method: string | undefined; body: BodyInit | null | undefined }> = [];
  const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ method: init?.method, body: init?.body });
    const error = errors[Math.min(calls.length - 1, errors.length - 1)];
    return new Response(JSON.stringify(error ?? []), { status: error ? status : 200, headers: { 'Content-Type': 'application/json' } });
  });
  const client = createClient('https://clock-test.example', 'synthetic-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher },
  });
  return { transport: new SupabaseTransport(client), calls };
}

describe('bounded retry for a newly issued token rejected before execution', () => {
  it('replays exactly the same write once and requires server acceptance', async () => {
    const { transport, calls } = setup([future, null]);
    await transport.upsert('profiles', { user_id: 'synthetic-user' });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
  });
  it('does not loop or treat a repeated rejection as successful', async () => {
    const { transport, calls } = setup([future]);
    await expect(transport.upsert('profiles', {})).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(calls).toHaveLength(2);
  });
  it.each([
    { code: 'PGRST303', message: 'JWT expired' },
    { code: 'PGRST301', message: 'JWT invalid' },
    { code: 'PGRST303', message: 'Invalid claims' },
  ])('does not retry $message', async error => {
    const { transport, calls } = setup([error]);
    await expect(transport.upsert('profiles', {})).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(calls).toHaveLength(1);
  });
  it('does not retry forbidden writes', async () => {
    const { transport, calls } = setup([{ code: '42501', message: 'Forbidden' }], 403);
    await expect(transport.upsert('profiles', {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(calls).toHaveLength(1);
  });
});
