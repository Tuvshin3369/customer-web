import type { FoamRangeRow } from '../types';

/**
 * Нийт талбай нь [min_amount, max_amount] интервалд орж буй эхний мөрийг олно (min_amount өсөх эрэмбээр).
 */
export function findFoamTierForArea(rows: FoamRangeRow[], totalArea: number): FoamRangeRow | null {
  if (!Number.isFinite(totalArea) || totalArea <= 0 || rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.min_amount - b.min_amount);
  for (const row of sorted) {
    const min = row.min_amount;
    const max = row.max_amount;
    if (totalArea >= min && totalArea <= max) return row;
  }
  return null;
}
