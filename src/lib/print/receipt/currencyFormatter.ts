export const formatCurrency = (value: number | string): string => {
  if (value === '' || value === null || value === undefined) return '';

  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numValue)) return '';

  return numValue.toLocaleString('en-US') + '₮';
};

export const parseCurrency = (value: string): string => {
  return value.replace(/[₮,]/g, '');
};
