import { useState } from 'react';
import type { Backend } from '../lib/backend.ts';
import { Button, Field, inputClass, Tabs } from '../components/ui.tsx';
import { useUI } from '../lib/ui.ts';

export function Login({ backend, onDemo }: { backend: Backend; onDemo: () => void }) {
  const [tab, setTab] = useState<'senha' | 'link' | 'criar'>('senha');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const toast = useUI((s) => s.toast);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (tab === 'link') {
        await backend.signInMagic(email.trim());
        setSent(true);
      } else if (tab === 'senha') {
        await backend.signInPassword(email.trim(), password);
      } else {
        const r = await backend.signUp(email.trim(), password);
        if (r.needsConfirmation) {
          setSent(true);
          toast('info', 'Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre com a senha.');
        }
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 text-4xl">📺</div>
          <h1 className="text-3xl font-black">Prime Time Manager</h1>
          <p className="mt-1 text-sm text-muted">"Eu decido o que o Brasil assiste — e respondo por cada ponto."</p>
        </div>
        <div className="card p-5">
          <Tabs value={tab} onChange={(v) => { setTab(v); setSent(false); }} items={[{ id: 'senha', label: 'Entrar' }, { id: 'link', label: 'Link mágico' }, { id: 'criar', label: 'Criar conta' }]} className="mb-4" />
          {sent && tab === 'link' ? (
            <div className="rounded-theme bg-surface-2 p-4 text-sm">
              <p className="font-semibold">Link enviado para {email}.</p>
              <p className="mt-1 text-muted">Abra o e-mail <b>neste mesmo navegador</b> e toque no link para entrar. Não chegou? Confira o spam ou use e-mail e senha.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <Field label="E-mail">
                <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
              </Field>
              {tab !== 'link' && (
                <Field label="Senha" hint={tab === 'criar' ? 'Mínimo de 6 caracteres.' : undefined}>
                  <input className={inputClass} type="password" autoComplete={tab === 'criar' ? 'new-password' : 'current-password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
              )}
              <Button type="submit" variant="primary" full size="lg" busy={busy}>
                {tab === 'senha' ? 'Entrar' : tab === 'link' ? 'Enviar link de acesso' : 'Criar conta'}
              </Button>
            </form>
          )}
        </div>
        <div className="mt-4 text-center">
          <button className="text-sm text-muted underline-offset-4 hover:text-text hover:underline" onClick={onDemo}>
            Jogar em modo demonstração (offline, sem IA)
          </button>
        </div>
      </div>
    </div>
  );
}
