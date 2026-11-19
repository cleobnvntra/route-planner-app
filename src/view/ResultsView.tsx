import { dayOf, todayIso } from '../model/dates.js';
import type { Plan } from '../model/job.js';
import { DAY_LABELS } from '../model/types.js';
import { formatMaterials } from './format.js';
import { RouteCard } from './RouteCard.js';

export function ResultsView({ plan }: { plan: Plan }) {
  const { job, holiday, eligibility, routes, unroutable } = plan;
  const today = todayIso();
  const limited = eligibility.eligible.filter((e) => e.reasons.length > 0);

  return (
    <section className="stack" aria-live="polite">
      <h2>
        {DAY_LABELS[dayOf(job.date)]} {job.date}
        {job.startTime ? `, start ${job.startTime}` : ''}
      </h2>

      {holiday && (
        <p className="alert alert-warn" role="alert">
          {holiday}. Hours may differ, call 311 or check toronto.ca/holiday-impacts.
        </p>
      )}

      {routes.length === 0 && (
        <div className="alert alert-error" role="alert">
          <p>
            <strong>No route works for this job.</strong>
          </p>
          {eligibility.uncovered.length > 0 ? (
            <p>No station takes {formatMaterials(eligibility.uncovered)} on this day.</p>
          ) : unroutable.length > 0 ? (
            <p>No driving route found to the stations that fit. Check the addresses.</p>
          ) : (
            <p>This needs more than 2 stations. Split the job or pick fewer materials.</p>
          )}
        </div>
      )}

      {routes.length > 0 && (
        <p className="muted small">Drive time only. Check the hours below against your arrival time.</p>
      )}

      {routes.map((route, i) => (
        <RouteCard key={route.id} route={route} rank={i + 1} job={job} today={today} />
      ))}

      {unroutable.length > 0 && routes.length > 0 && (
        <p className="alert alert-warn">
          {unroutable.length} more {unroutable.length === 1 ? 'route' : 'routes'} left out: no driving path found.
        </p>
      )}

      {(eligibility.excluded.length > 0 || limited.length > 0) && (
        <div className="card stack">
          <h3>Why stations were left out</h3>
          {eligibility.excluded.map(({ station, reasons }) => (
            <div key={station.id}>
              <h4>{station.name}</h4>
              <ul className="plain muted">
                {reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          ))}
          {limited.map(({ station, materials, reasons }) => (
            <div key={station.id}>
              <h4>{station.name}</h4>
              <p className="muted">Can take {formatMaterials(materials)} only</p>
              <ul className="plain muted">
                {reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
