
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

/** The contract stores a category as a plain slug, so this list lives here. */
const NEAR_CATEGORIES: Category[] = ['Crypto', 'Politics', 'Sports', 'Tech', 'Culture', 'Economy', 'Other'].map(
  (name, sortOrder) => ({
    id: name.toLowerCase(),
    slug: name.toLowerCase(),
    name,
    sortOrder,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  }),
);

export const getCategories = async (): Promise<Category[]> => NEAR_CATEGORIES;
