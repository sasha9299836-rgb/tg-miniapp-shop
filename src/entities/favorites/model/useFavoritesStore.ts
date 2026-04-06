import { create } from "zustand";
import { getCurrentTgUserId } from "../../../shared/auth/tgUser";
import {
  addUserFavorite,
  clearUserFavorites,
  listUserFavorites,
  removeUserFavorite,
} from "../../../shared/api/userCollectionsApi";

type FavoriteTarget = { id: number; postId?: string | null };

type State = {
  ids: number[];
  postIds: string[];
  isLoaded: boolean;
  notice: string | null;
  load: () => Promise<void>;
  registerCatalogItems: (items: FavoriteTarget[]) => void;
  toggle: (target: FavoriteTarget) => Promise<void>;
  remove: (target: FavoriteTarget) => Promise<void>;
  clear: () => Promise<void>;
  has: (target: FavoriteTarget) => boolean;
  consumeNotice: () => string | null;
};

const productToPost = new Map<number, string>();

function resolvePostId(target: FavoriteTarget): string | null {
  const inline = String(target.postId ?? "").trim();
  if (inline) return inline;
  return productToPost.get(target.id) ?? null;
}

function setNotice(text: string) {
  try {
    window.alert(text);
  } catch {
    // no-op
  }
}

function areNumberArraysEqual(left: number[], right: number[]) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

export const useFavoritesStore = create<State>((set, get) => ({
  ids: [],
  postIds: [],
  isLoaded: false,
  notice: null,
  load: async () => {
    const tgUserId = getCurrentTgUserId();
    const rows = await listUserFavorites(tgUserId);
    const postIds = rows.map((row) => String(row.post_id ?? "").trim()).filter(Boolean);
    const ids = Array.from(productToPost.entries())
      .filter(([, postId]) => postIds.includes(postId))
      .map(([id]) => id);
    set({ postIds, ids, isLoaded: true });
  },
  registerCatalogItems: (items) => {
    for (const item of items) {
      const postId = String(item.postId ?? "").trim();
      if (!postId) continue;
      productToPost.set(item.id, postId);
    }
    const currentPostIds = get().postIds;
    const ids = Array.from(productToPost.entries())
      .filter(([, postId]) => currentPostIds.includes(postId))
      .map(([id]) => id);
    const currentIds = get().ids;
    if (!areNumberArraysEqual(currentIds, ids)) {
      set({ ids });
    }
  },
  toggle: async (target) => {
    const postId = resolvePostId(target);
    if (!postId) return;
    const tgUserId = getCurrentTgUserId();
    const state = get();
    const isActive = state.postIds.includes(postId);

    if (isActive) {
      await removeUserFavorite(tgUserId, postId);
      const postIds = state.postIds.filter((value) => value !== postId);
      const ids = state.ids.filter((value) => value !== target.id);
      set({ postIds, ids });
      return;
    }

    const result = await addUserFavorite(tgUserId, postId);
    if (result === "LIMIT_REACHED") {
      const text = "В избранном может быть не больше 50 товаров";
      set({ notice: text });
      setNotice(text);
      return;
    }
    if (result === "BAD_PAYLOAD") return;

    const postIds = state.postIds.includes(postId) ? state.postIds : [postId, ...state.postIds];
    const ids = state.ids.includes(target.id) ? state.ids : [target.id, ...state.ids];
    set({ postIds, ids });
  },
  remove: async (target) => {
    const postId = resolvePostId(target);
    if (!postId) return;
    await removeUserFavorite(getCurrentTgUserId(), postId);
    set({
      postIds: get().postIds.filter((value) => value !== postId),
      ids: get().ids.filter((value) => value !== target.id),
    });
  },
  clear: async () => {
    await clearUserFavorites(getCurrentTgUserId());
    set({ ids: [], postIds: [] });
  },
  has: (target) => {
    const postId = resolvePostId(target);
    if (postId) return get().postIds.includes(postId);
    return get().ids.includes(target.id);
  },
  consumeNotice: () => {
    const message = get().notice;
    if (message) set({ notice: null });
    return message;
  },
}));
