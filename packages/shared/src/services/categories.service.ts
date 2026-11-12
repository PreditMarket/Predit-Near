export interface Category {
  slug: string;
  name: string;
}

/** The contract stores a category as a plain slug, so this list lives here. */
export const CATEGORIES: Category[] = ['Crypto', 'Politics', 'Sports', 'Tech', 'Culture', 'Economy', 'Other'].map(
  (name) => ({ slug: name.toLowerCase(), name }),
);
