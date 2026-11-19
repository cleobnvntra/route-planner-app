import { useCallback, useRef, useState } from 'react';
import raw from '../data/stations.json';
import { todayIso } from '../model/dates.js';
import { buildPlan, matrixPoints, prepareRoutes, validateJob, type JobForm, type Plan } from '../model/job.js';
import { parseStations } from '../model/stations.js';
import type { Material, Station } from '../model/types.js';
import { ApiError, distanceMatrix } from './api.js';

function loadStations(): { stations: Station[]; dataError: string | null } {
  try {
    return { stations: parseStations(raw), dataError: null };
  } catch (err) {
    return { stations: [], dataError: `Station data is broken: ${(err as Error).message}` };
  }
}

const initialForm = (): JobForm => ({
  date: todayIso(),
  startTime: '',
  materials: [],
  client: null,
  pickup: null,
  dropoff: null,
  dropoffSameAsPickup: true,
});

export function usePlanner(password: string, onAuthFailed: () => void) {
  const [{ stations, dataError }] = useState(loadStations);
  const [form, setForm] = useState<JobForm>(initialForm);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [errors, setErrors] = useState<string[]>(dataError ? [dataError] : []);
  const [busy, setBusy] = useState(false);
  const runId = useRef(0);

  /** Any edit clears old results, so nobody drives a route for a different job. */
  const update = useCallback((patch: Partial<JobForm>) => {
    runId.current += 1;
    setForm((current) => ({ ...current, ...patch }));
    setPlan(null);
    setErrors([]);
    setBusy(false);
  }, []);

  const toggleMaterial = useCallback(
    (material: Material) => {
      setForm((current) => {
        const has = current.materials.includes(material);
        return {
          ...current,
          materials: has ? current.materials.filter((m) => m !== material) : [...current.materials, material],
        };
      });
      update({});
    },
    [update],
  );

  const submit = useCallback(async () => {
    if (dataError) {
      setErrors([dataError]);
      return;
    }
    const { job, errors: invalid } = validateJob(form);
    if (!job) {
      setErrors(invalid);
      return;
    }

    const run = (runId.current += 1);
    setErrors([]);
    setPlan(null);
    setBusy(true);
    try {
      const { eligibility, candidates } = prepareRoutes(job, stations);
      if (candidates.length === 0) {
        // Nothing to route, so don't spend an API call.
        setPlan(buildPlan(job, eligibility, candidates, null, null));
        return;
      }
      const { ids, points } = matrixPoints(job, candidates);
      const matrix = await distanceMatrix(points, password);
      if (run === runId.current) setPlan(buildPlan(job, eligibility, candidates, ids, matrix));
    } catch (err) {
      if (run !== runId.current) return;
      if (err instanceof ApiError && err.status === 401) onAuthFailed();
      setErrors([err instanceof Error ? err.message : 'Could not plan the route.']);
    } finally {
      if (run === runId.current) setBusy(false);
    }
  }, [dataError, form, onAuthFailed, password, stations]);

  return { form, plan, errors, busy, update, toggleMaterial, submit };
}
