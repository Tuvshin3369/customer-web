import type { SaleLineExtraFields, SaleLineProductMeta } from './saleLineExtraInfo';

/**
 * «Зарлагын баримт» (printTransactionDocument.getProductDisplayNameSale)-тай
 * ижил барааны нэр — хэвлэлд нэр + хаалтанд нэмэлт мэдээлэл.
 */
export function buildSaleProductPrintName(
  productName: string,
  meta: (SaleLineProductMeta & { is_pigment?: boolean }) | undefined,
  fields: SaleLineExtraFields,
  codedCodeById: Record<string, string>,
): string {
  const base = productName.trim() || '—';
  const codedId =
    fields.coded_paint_id != null && String(fields.coded_paint_id).trim()
      ? String(fields.coded_paint_id).trim()
      : '';
  const colorCode = codedId ? codedCodeById[codedId] : undefined;

  if (colorCode) {
    if (meta?.is_pigment) {
      return `${colorCode} ( ${base} )`;
    }
    return `${base} ( ${colorCode} )`;
  }

  const foamRaw =
    typeof fields.foam_size === 'string' && fields.foam_size.trim()
      ? fields.foam_size.trim()
      : '';
  if (foamRaw && meta?.is_foam_range !== false) {
    const sizes = foamRaw.split(',');
    if (sizes.length === 2) {
      return `${base} (өндөр "${sizes[0].trim()}"см x өргөн "${sizes[1].trim()}"см)`;
    }
  }

  if (
    fields.length_meter != null &&
    Number.isFinite(fields.length_meter) &&
    meta?.is_calculate_length !== false
  ) {
    return `${base} (урт ${fields.length_meter}м)`;
  }

  return base;
}
