import { useAuth } from './controller/useAuth.js';
import { LoginView } from './view/LoginView.js';
import { PlannerView } from './view/PlannerView.js';

export function App() {
  const { password, error, busy, login, logout } = useAuth();
  if (password === null) return <LoginView error={error} busy={busy} onLogin={login} />;
  return <PlannerView password={password} onLogout={logout} />;
}
