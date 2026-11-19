export const MATERIALS = [
  'garbage',
  'hhw',
  'ewaste',
  'metal',
  'drywall',
  'renovation',
  'tires',
  'yard',
] as const;

export type Material = (typeof MATERIALS)[number];

export const MATERIAL_LABELS: Record<Material, string> = {
  garbage: 'Garbage',
  hhw: 'HHW',
  ewaste: 'E-waste',
  metal: 'Scrap metal',
  drywall: 'Drywall',
  renovation: 'Renovation waste',
  tires: 'Tires',
  yard: 'Yard waste',
};

export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export type Day = (typeof DAYS)[number];

export const DAY_LABELS: Record<Day, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
};

/** [open, close], both "HH:MM". Close is exclusive. */
export type TimeRange = [string, string];

/** null or a missing day means closed. */
export type DayHours = Partial<Record<Day, TimeRange | null>>;

export type MaterialHours = { hours: DayHours | `sameAs:${Material}` };

export type Station = {
  id: string;
  name: string;
  operator: 'city' | 'private';
  address: string;
  lat: number;
  lng: number;
  /** A material not listed here is not accepted. */
  materials: Partial<Record<Material, MaterialHours>>;
  notes?: string;
  sourceUrl: string;
  lastVerified: string;
};

export type LatLng = { lat: number; lng: number };

export type Place = LatLng & {
  label: string;
  /** True for a street or postal code match, not the exact address. */
  approximate: boolean;
};

export type EligibleStation = {
  station: Station;
  /** Required materials this station can take on the job date. */
  materials: Material[];
  /** Why it can't take the other required materials. Empty if it takes them all. */
  reasons: string[];
};

export type ExcludedStation = {
  station: Station;
  reasons: string[];
};

export type Eligibility = {
  eligible: EligibleStation[];
  excluded: ExcludedStation[];
  /** Required materials no station can take on the job date. */
  uncovered: Material[];
};

export type RouteStop = {
  station: Station;
  /** Materials to drop at this stop. */
  materials: Material[];
};

export type CandidateRoute = {
  id: string;
  stops: RouteStop[];
};

/** Named points plus the driving distance and time between each pair. */
export type RouteMatrix = {
  ids: string[];
  distancesKm: (number | null)[][];
  durationsMin: (number | null)[][];
};

/** Raw response of /api/matrix. Rows and columns follow the requested points. */
export type DistanceMatrix = Omit<RouteMatrix, 'ids'>;

export type Leg = {
  from: string;
  to: string;
  km: number;
  min: number;
};

export type ScoredRoute = CandidateRoute & {
  legs: Leg[];
  totalKm: number;
  totalMin: number;
};

export type ScoredRoutes = {
  routes: ScoredRoute[];
  /** Candidates dropped because the provider found no road path for a leg. */
  unroutable: CandidateRoute[];
};

export const POINT_PICKUP = 'pickup';
export const POINT_CLIENT = 'client';
export const POINT_DROPOFF = 'dropoff';
export const RESERVED_POINT_IDS: readonly string[] = [POINT_PICKUP, POINT_CLIENT, POINT_DROPOFF];
