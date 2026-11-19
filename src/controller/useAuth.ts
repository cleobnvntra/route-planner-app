import { useCallback, useState } from 'react';
import { ApiError, login as apiLogin } from './api.js';
import { IS_APK } from './platform.js';

const STORAGE_KEY = 'route-planner-password';

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(password: string | null): void {
  try {
    if (password === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, password);
  } catch {
    // Private mode: they'll just sign in again next time.
  }
}

export function useAuth() {
  const [password, setPassword] = useState<string | null>(readStored);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const login = useCallback(async (input: string) => {
    // Pasting a key often brings a stray space or line break along.
    const attempt = IS_APK ? input.trim() : input;
    if (!attempt) {
      setError(IS_APK ? 'Paste the key.' : 'Enter the password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiLogin(attempt);
      writeStored(attempt);
      setPassword(attempt);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : IS_APK ? 'Could not check the key.' : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback((message?: string) => {
    writeStored(null);
    setPassword(null);
    setError(message ?? null);
  }, []);

  return { password, error, busy, login, logout };
}
