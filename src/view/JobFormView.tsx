import type { FormEvent } from 'react';
import type { JobForm } from '../model/job.js';
import { MATERIALS, MATERIAL_LABELS, type Material } from '../model/types.js';
import { AddressField } from './AddressField.js';

type Props = {
  form: JobForm;
  errors: string[];
  busy: boolean;
  password: string;
  onAuthFailed: () => void;
  onChange: (patch: Partial<JobForm>) => void;
  onToggleMaterial: (material: Material) => void;
  onSubmit: () => void;
};

export function JobFormView({ form, errors, busy, password, onAuthFailed, onChange, onToggleMaterial, onSubmit }: Props) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  const addressProps = { password, onAuthFailed };

  return (
    <form className="card stack" onSubmit={submit} noValidate>
      <div className="row">
        <label className="field">
          <span>Job date</span>
          <input type="date" value={form.date} onChange={(e) => onChange({ date: e.target.value })} />
        </label>
        <label className="field">
          <span>Start (optional)</span>
          <input type="time" value={form.startTime} onChange={(e) => onChange({ startTime: e.target.value })} />
        </label>
      </div>

      <fieldset className="field">
        <legend>Materials</legend>
        <div className="chips">
          {MATERIALS.map((material) => (
            <label key={material} className={`chip ${form.materials.includes(material) ? 'chip-on' : ''}`}>
              <input
                type="checkbox"
                checked={form.materials.includes(material)}
                onChange={() => onToggleMaterial(material)}
              />
              {MATERIAL_LABELS[material]}
            </label>
          ))}
        </div>
      </fieldset>

      <AddressField
        {...addressProps}
        label="Client address"
        value={form.client}
        onChange={(client) => onChange({ client })}
      />
      <AddressField
        {...addressProps}
        label="Rental truck pickup"
        value={form.pickup}
        onChange={(pickup) => onChange({ pickup })}
      />

      <label className="check">
        <input
          type="checkbox"
          checked={form.dropoffSameAsPickup}
          onChange={(e) => onChange({ dropoffSameAsPickup: e.target.checked })}
        />
        Drop-off same as pickup
      </label>
      {!form.dropoffSameAsPickup && (
        <AddressField
          {...addressProps}
          label="Rental truck drop-off"
          value={form.dropoff}
          onChange={(dropoff) => onChange({ dropoff })}
        />
      )}

      {errors.length > 0 && (
        <ul className="alert alert-error" role="alert">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      <button className="button button-primary" type="submit" disabled={busy}>
        {busy ? 'Finding routes…' : 'Find routes'}
      </button>
    </form>
  );
}
