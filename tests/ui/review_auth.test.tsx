import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Welcome } from '../../src/ui/screens/Welcome';

afterEach(cleanup);
describe('Independent review: expected auth resilience', () => {
  it('reports failed resend instead of claiming a confirmation email was sent', async () => {
    const sb = { auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: { code: 'email_not_confirmed' } }),
      resend: vi.fn().mockResolvedValue({ error: { code: 'over_email_send_rate_limit', status: 429 } }),
    } } as unknown as SupabaseClient;
    render(<MemoryRouter><Welcome supabase={sb} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('E-post'), { target: { value: 'review@example.test' } });
    fireEvent.change(screen.getByLabelText('Lösenord'), { target: { value: 'synthetic-test-only' } });
    fireEvent.click(screen.getByRole('button', { name: 'Logga in' }));
    await waitFor(() => expect(sb.auth.resend).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/Vi har skickat ett nytt bekräftelsemejl/)).toBeNull());
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('does not redirect to email confirmation after the user has left signup', async () => {
    let resolve!: (value: unknown) => void;
    const sb = { auth: { signUp: vi.fn(() => new Promise(r => { resolve = r; })) } } as unknown as SupabaseClient;
    render(<MemoryRouter><Welcome supabase={sb} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Skapa konto' }));
    fireEvent.change(screen.getByLabelText('E-post'), { target: { value: 'review@example.test' } });
    fireEvent.change(screen.getByLabelText('Lösenord'), { target: { value: 'synthetic-test-only' } });
    fireEvent.change(screen.getByLabelText('Upprepa lösenord'), { target: { value: 'synthetic-test-only' } });
    fireEvent.click(screen.getByRole('button', { name: 'Skapa konto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Har du redan ett konto? Logga in' }));
    await act(async () => { resolve({ data: { user: { identities: [{ id: 'synthetic' }] }, session: null }, error: null }); });
    expect(screen.queryByRole('heading', { name: 'Logga in' })).not.toBeNull();
  });
});
