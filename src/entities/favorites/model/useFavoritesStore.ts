import { create } from "zustand";

type State = {
  ids: number[];
  toggle: (id: number) => void;
  remove: (id: number) => void;
  clear: () => void;
  has: (id: number) => boolean;
};

export const useFavoritesStore = create<State>((set, get) => ({
  ids: [],
  toggle: (id) => {
    const ids = get().ids;
    set({ ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  },
  remove: (id) => set({ ids: get().ids.filter((x) => x !== id) }),
  clear: () => set({ ids: [] }),
  has: (id) => get().ids.includes(id),
}));
