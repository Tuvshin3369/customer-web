interface SaleItem {
  sold_price?: number;
  system_price?: number;
  product_number: number;
}

export const calculateTotalAmount = (items: SaleItem[]): number => {
  return items.reduce((sum, item) => {
    const price = item.sold_price || item.system_price || 0;
    return sum + Number(price) * Number(item.product_number ?? 0);
  }, 0);
};
