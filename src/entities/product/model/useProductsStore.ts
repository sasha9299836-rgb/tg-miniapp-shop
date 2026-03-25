import { create } from "zustand";
import type { Product } from "../../../shared/types/product";
import { getPublishedCatalogProducts } from "../../../shared/api/adminPostsApi";

type State = {
  products: Product[];
  isLoading: boolean;
  load: () => Promise<void>;
  getById: (id: number) => Product | undefined;
};

export const useProductsStore = create<State>((set, get) => ({
  products: [],
  isLoading: false,
  load: async () => {
    set({ isLoading: true });
    try {
      const items = await getPublishedCatalogProducts();
      set({ products: items, isLoading: false });
    } catch {
      set({ products: [], isLoading: false });
    }
  },
  getById: (id) => get().products.find((p) => p.id === id),
}));
