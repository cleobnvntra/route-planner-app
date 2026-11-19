import { MATERIAL_LABELS, POINT_CLIENT, POINT_DROPOFF, POINT_PICKUP, type Material, type Station } from '../model/types.js';

export const formatKm = (km: number) => `${km.toFixed(1)} km`;
export const formatMin = (min: number) => `${Math.round(min)} min`;
export const formatMaterials = (materials: readonly Material[]) =>
  materials.map((m) => MATERIAL_LABELS[m]).join(', ');

const POINT_LABELS: Record<string, string> = {
  [POINT_PICKUP]: 'Rental truck pickup',
  [POINT_CLIENT]: 'Client',
  [POINT_DROPOFF]: 'Rental truck drop-off',
};

export function pointLabel(id: string, stations: readonly Station[]): string {
  return POINT_LABELS[id] ?? stations.find((s) => s.id === id)?.name ?? id;
}
