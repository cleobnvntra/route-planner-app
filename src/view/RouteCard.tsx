import { IS_APK } from '../controller/platform.js';
import type { Job } from '../model/job.js';
import { routeStops } from '../model/job.js';
import { hoursOn, mapsUrl } from '../model/planner.js';
import { isStale } from '../model/stations.js';
import { MATERIAL_LABELS, type ScoredRoute } from '../model/types.js';
import { formatKm, formatMin, pointLabel } from './format.js';

type Props = {
  route: ScoredRoute;
  rank: number;
  job: Job;
  today: string;
};

export function RouteCard({ route, rank, job, today }: Props) {
  const stations = route.stops.map((stop) => stop.station);

  return (
    <article className="card stack">
      <header className="route-head">
        <h3>
          {rank === 1 ? 'Shortest: ' : `${rank}. `}
          {stations.map((s) => s.name.replace(' Drop-Off Depot', '')).join(' → ')}
        </h3>
        <p className="total">
          {formatKm(route.totalKm)} · {formatMin(route.totalMin)}
        </p>
      </header>

      {route.stops.map(({ station, materials }) => (
        <section key={station.id} className="stop">
          <h4>{station.name}</h4>
          <p className="muted">{station.address}</p>
          <ul className="plain">
            {materials.map((material) => {
              const hours = hoursOn(station, material, job.date);
              return (
                <li key={material}>
                  {MATERIAL_LABELS[material]}: {hours ? `${hours[0]} to ${hours[1]}` : 'closed'}
                </li>
              );
            })}
          </ul>
          {station.notes && <p className="note">{station.notes}</p>}
          <p className="muted small">Verified {station.lastVerified}</p>
          {isStale(station.lastVerified, today) && (
            <p className="alert alert-warn">Hours not verified in over 90 days. Call before you go.</p>
          )}
        </section>
      ))}

      <table className="legs">
        <tbody>
          {route.legs.map((leg) => (
            <tr key={`${leg.from}-${leg.to}`}>
              <td>
                {pointLabel(leg.from, stations)} → {pointLabel(leg.to, stations)}
              </td>
              <td className="num">{formatKm(leg.km)}</td>
              <td className="num">{formatMin(leg.min)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* In the APK a plain link leaves the app, so Android hands it to Google Maps. */}
      <a
        className="button button-primary"
        href={mapsUrl(routeStops(job, route))}
        {...(IS_APK ? {} : { target: '_blank', rel: 'noreferrer' })}
      >
        Navigate
      </a>
    </article>
  );
}
