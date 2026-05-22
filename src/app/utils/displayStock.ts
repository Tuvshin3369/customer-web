/** Дэлгэцийн үлдэгдэл — зөвхөн бүхэл тоо (бутархайг хасах) */
export function displayStock(stock: number | null | undefined): number {
  const n = Number(stock);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}
