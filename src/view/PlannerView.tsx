import { useCallback } from 'react';
import { IS_APK } from '../controller/platform.js';
import { usePlanner } from '../controller/usePlanner.js';
import { JobFormView } from './JobFormView.js';
import { ResultsView } from './ResultsView.js';

type Props = {
  password: string;
  onLogout: (message?: string) => void;
};

export function PlannerView({ password, onLogout }: Props) {
  const onAuthFailed = useCallback(() => onLogout('Password changed. Sign in again.'), [onLogout]);
  const { form, plan, errors, busy, update, toggleMaterial, submit } = usePlanner(password, onAuthFailed);

  return (
    <main className="page stack">
      <header className="app-head">
        <h1>Route Planner</h1>
        <button type="button" className="button-link" onClick={() => onLogout()}>
          {IS_APK ? 'Change key' : 'Sign out'}
        </button>
      </header>
      <JobFormView
        form={form}
        errors={errors}
        busy={busy}
        password={password}
        onAuthFailed={onAuthFailed}
        onChange={update}
        onToggleMaterial={toggleMaterial}
        onSubmit={submit}
      />
      {plan && <ResultsView plan={plan} />}
      <footer className="muted small">© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors</footer>
    </main>
  );
}
