import { useState, type FormEvent } from 'react';
import { IS_APK } from '../controller/platform.js';

type Props = {
  error: string | null;
  busy: boolean;
  onLogin: (secret: string) => void;
};

export function LoginView({ error, busy, onLogin }: Props) {
  const [secret, setSecret] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onLogin(secret);
  };

  return (
    <main className="page">
      <h1>Route Planner</h1>
      <form className="card stack" onSubmit={submit}>
        <label className="field">
          <span>{IS_APK ? 'Routing key' : 'Password'}</span>
          <input
            type="password"
            autoComplete={IS_APK ? 'off' : 'current-password'}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </label>
        {IS_APK && <p className="hint">Paste your OpenRouteService key. You only do this once on this phone.</p>}
        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? 'Checking…' : IS_APK ? 'Save key' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
