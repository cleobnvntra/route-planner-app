import { useEffect, useState } from 'react';
import type { Place } from '../model/types.js';
import { ApiError, geocode } from './api.js';

const DEBOUNCE_MS = 350;
const MIN_CHARS = 3;

/** Debounced address search. Pass enabled=false once an address is picked. */
export function useAddressSearch(text: string, enabled: boolean, password: string, onAuthFailed: () => void) {
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noMatch, setNoMatch] = useState(false);

  useEffect(() => {
    setResults([]);
    setError(null);
    setNoMatch(false);
    const query = text.trim();
    if (!enabled || query.length < MIN_CHARS) {
      setSearching(false);
      return undefined;
    }

    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const places = await geocode(query, password, controller.signal);
        // The APK's direct call can't be cancelled, so a late answer must be ignored here.
        if (controller.signal.aborted) return;
        setResults(places);
        setNoMatch(places.length === 0);
        setSearching(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) onAuthFailed();
        setError(err instanceof ApiError ? err.message : 'Address search failed.');
        setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, enabled, password, onAuthFailed]);

  return { results, searching, error, noMatch };
}
