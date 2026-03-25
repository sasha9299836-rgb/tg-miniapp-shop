import { create } from "zustand";

export type CartItem = { productId: number; qty: number };

type State = {
  items: CartItem[];
  add: (productId: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
  totalQty: () => number;
};

export const useCartStore = create<State>((set, get) => ({
  items: [],
  add: (productId) => {
    const items = get().items;
    const existing = items.find((i) => i.productId === productId);
    if (existing) {
      set({
        items: items.map((i) =>
          i.productId === productId ? { ...i, qty: i.qty + 1 } : i
        ),
      });
      return;
    }
    set({ items: [...items, { productId, qty: 1 }] });
  },
  remove: (productId) => set({ items: get().items.filter((i) => i.productId !== productId) }),
  clear: () => set({ items: [] }),
  totalQty: () => get().items.reduce((sum, i) => sum + i.qty, 0),
}));
