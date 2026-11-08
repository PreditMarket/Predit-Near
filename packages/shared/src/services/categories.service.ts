import apiClient from '@/lib/axios';
import { queryClient } from '@/lib/query-client';

export const CATEGORIES_LIST_KEY = ['categories', 'list'] as const;

export interface Category {
  id: string;
  slug: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const getCategories = (): Promise<Category[]> =>
  queryClient.fetchQuery({
    queryKey: CATEGORIES_LIST_KEY,
    queryFn: async () => {
      const res = await apiClient.get<Category[]>('/categories');
      return res.data;
    },
    staleTime: 5 * 60_000,
  });

// ---- Admin CRUD (used by the admin app) ----

export interface CreateCategoryInput {
  slug: string;
  name: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateCategoryInput {
  slug?: string;
  name?: string;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export const createCategory = async (
  input: CreateCategoryInput,
): Promise<Category> => {
  const res = await apiClient.post<Category>('/admin/categories', input);
  queryClient.invalidateQueries({ queryKey: CATEGORIES_LIST_KEY });
  return res.data;
};

export const updateCategory = async (
  id: string,
  input: UpdateCategoryInput,
): Promise<Category> => {
  const res = await apiClient.patch<Category>(`/admin/categories/${id}`, input);
  queryClient.invalidateQueries({ queryKey: CATEGORIES_LIST_KEY });
  return res.data;
};

export const deleteCategory = async (id: string): Promise<void> => {
  await apiClient.delete(`/admin/categories/${id}`);
  queryClient.invalidateQueries({ queryKey: CATEGORIES_LIST_KEY });
};
