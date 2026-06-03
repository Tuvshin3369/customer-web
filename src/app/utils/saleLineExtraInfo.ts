/** products-ийн төрөл — extraInfo тооцоололд */
export interface SaleLineProductMeta {
  is_coded_paint?: boolean;
  is_foam_range?: boolean;
  is_calculate_length?: boolean;
  /** is_foam_range: талбай = h × w × waste */
  waste?: number | null;
}

/** sales / online_orders мөр дээрх нэмэлт талбарууд */
export interface SaleLineExtraFields {
  coded_paint_id?: string | null;
  foam_size?: string | null;
  length_meter?: number | null;
}

/** "h,w" эсвэл "h" → {h, w?} */
export function parseFoamSize(value: string): { h: number; w?: number } | null {
  const parts = value.split(',');
  const h = Number(parts[0]);
  if (!Number.isFinite(h)) return null;
  if (parts.length === 1) return { h };
  const w = Number(parts[1]);
  if (!Number.isFinite(w)) return { h };
  return { h, w };
}

export function formatSaleLineNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/**
 * Барааны нэрний доорх нэмэлт мөр (сагс / захиалга / худалдан авалтын түүх).
 * `requireProductFlags: false` — sales мөр дээр талбар бөглөгдсөн бол харуулна.
 */
export function buildSaleLineExtraInfo(
  meta: SaleLineProductMeta | undefined,
  fields: SaleLineExtraFields,
  codedCodeById: Record<string, string>,
  options?: { requireProductFlags?: boolean },
): string | null {
  const requireFlags = options?.requireProductFlags ?? true;

  const codedId =
    fields.coded_paint_id != null && String(fields.coded_paint_id).trim()
      ? String(fields.coded_paint_id).trim()
      : '';
  if (codedId && (!requireFlags || meta?.is_coded_paint)) {
    const code = codedCodeById[codedId];
    if (code) return `Өнгийн код: ${code}`;
  }

  const foamRaw =
    typeof fields.foam_size === 'string' && fields.foam_size.trim()
      ? fields.foam_size.trim()
      : '';
  if (foamRaw && (!requireFlags || meta?.is_foam_range)) {
    const dims = parseFoamSize(foamRaw);
    if (dims) {
      const parts: string[] = [`Өндөр: ${formatSaleLineNumber(dims.h)}см`];
      if (dims.w != null) parts.push(`Өргөн: ${formatSaleLineNumber(dims.w)}см`);
      const waste =
        meta?.waste != null && meta.waste > 0 ? meta.waste : 1;
      const area =
        dims.w != null ? dims.h * dims.w * waste : dims.h * waste;
      if (Number.isFinite(area) && area > 0) {
        parts.push(`Талбай: ${formatSaleLineNumber(area)}`);
      }
      return parts.join(' · ');
    }
  }

  if (
    fields.length_meter != null &&
    Number.isFinite(fields.length_meter) &&
    (!requireFlags || meta?.is_calculate_length)
  ) {
    return `Урт: ${formatSaleLineNumber(fields.length_meter)}см`;
  }

  return null;
}
