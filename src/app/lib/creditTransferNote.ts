/** `created_at` → YYYY.MM.DD (local calendar) */
export function formatTransferNoteDateFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const part = iso.split('T')[0].replace(/-/g, '.');
    return /^\d{4}\.\d{2}\.\d{2}$/.test(part) ? part : '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/** Гүйлгээний утга: «Зээл төлөв -» + YYYY.MM.DD + (утас) — зөвхөн «Худалдан авалтын түүх» зээл */
export function buildCreditTransferNote(
  createdAtIso: string,
  phone: string | undefined,
): string | undefined {
  const ymd = formatTransferNoteDateFromIso(createdAtIso);
  const ph = phone?.trim() ?? '';
  if (!ymd || !ph) return undefined;
  return `Зээл төлөв -${ymd} -( ${ph} )`;
}

/** Checkout «Төлбөр» — «Онлайн -» + YYYY.MM.DD + (утас | google_id | ecommerce_phone) */
export function buildOnlineTransferNote(
  createdAtIso: string,
  identifier: string | undefined,
): string | undefined {
  const ymd = formatTransferNoteDateFromIso(createdAtIso);
  const id = identifier?.trim() ?? '';
  if (!ymd || !id) return undefined;
  return `Онлайн -${ymd} -( ${id} )`;
}

/** Checkout — өнөөдрийн YYYY.MM.DD */
export function todayTransferNoteDate(): string {
  return formatTransferNoteDateFromIso(new Date().toISOString());
}
