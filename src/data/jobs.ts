// Mock job categories data
// This will be replaced with Supabase queries later
export interface JobCategory {
  id: number;
  name: string;
  count: number; // Number of registered workers
}

export const mockJobCategories: JobCategory[] = [
  { id: 1, name: 'Цахилгаан', count: 3 },
  { id: 2, name: 'Засал', count: 2 },
  { id: 3, name: 'Өрлөг', count: 4 },
  { id: 4, name: 'Сантехник', count: 2 },
  { id: 5, name: 'Будаг', count: 3 },
  { id: 6, name: 'Мебель', count: 2 },
];
