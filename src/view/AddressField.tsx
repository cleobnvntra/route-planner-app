import { useState } from 'react';
import { useAddressSearch } from '../controller/useAddressSearch.js';
import type { Place } from '../model/types.js';

type Props = {
  label: string;
  value: Place | null;
  password: string;
  onAuthFailed: () => void;
  onChange: (place: Place | null) => void;
};

export function AddressField({ label, value, password, onAuthFailed, onChange }: Props) {
  const [text, setText] = useState(value?.label ?? '');
  const { results, searching, error, noMatch } = useAddressSearch(text, value === null, password, onAuthFailed);

  const edit = (next: string) => {
    setText(next);
    if (value) onChange(null);
  };

  const pick = (place: Place) => {
    setText(place.label);
    onChange(place);
  };

  return (
    <div className="field">
      <label>
        <span>{label}</span>
        <input
          type="text"
          inputMode="search"
          autoComplete="off"
          placeholder="Start typing an address"
          value={text}
          onChange={(e) => edit(e.target.value)}
        />
      </label>
      {value && !value.approximate && <p className="hint hint-ok">✓ Address set</p>}
      {value?.approximate && (
        <p className="alert alert-warn">Not the exact address. Distances are rough and Navigate won't go to the door.</p>
      )}
      {searching && <p className="hint">Searching…</p>}
      {noMatch && <p className="hint">No match. Check the number and street.</p>}
      {error && <p className="alert alert-error">{error}</p>}
      {results.length > 0 && (
        <ul className="suggestions">
          {results.map((place) => (
            <li key={`${place.label}-${place.lat}-${place.lng}`}>
              <button type="button" className="suggestion" onClick={() => pick(place)}>
                {place.label}
                {place.approximate && <span className="hint"> (not exact)</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
