import { create } from "zustand";
import { TG_IDENTITY_REQUIRED_ERROR } from "../../../shared/auth/tgUser";
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

function isIdentityError(error: unknown) {
  return error instanceof Error && error.message === TG_IDENTITY_REQUIRED_ERROR;
}

const IDENTITY_NOTICE = "Действие доступно только внутри Telegram Mini App с авторизованным пользователем.";

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
    try {
      const rows = await listUserFavorites();
      const postIds = rows.map((row) => String(row.post_id ?? "").trim()).filter(Boolean);
      const ids = Array.from(productToPost.entries())
        .filter(([, postId]) => postIds.includes(postId))
        .map(([id]) => id);
      set({ postIds, ids, isLoaded: true });
    } catch (error) {
      if (isIdentityError(error)) {
        set({ postIds: [], ids: [], isLoaded: true, notice: IDENTITY_NOTICE });
        return;
      }
      throw error;
    }
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
    const state = get();
    const isActive = state.postIds.includes(postId);

    if (isActive) {
      await removeUserFavorite(postId);
      const postIds = state.postIds.filter((value) => value !== postId);
      const ids = state.ids.filter((value) => value !== target.id);
      set({ postIds, ids });
      return;
    }

    let result: "ADDED" | "ALREADY_EXISTS" | "LIMIT_REACHED" | "BAD_PAYLOAD";
    try {
      result = await addUserFavorite(postId);
    } catch (error) {
      if (isIdentityError(error)) {
        set({ notice: IDENTITY_NOTICE });
        setNotice(IDENTITY_NOTICE);
        return;
      }
      throw error;
    }
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
    try {
      await removeUserFavorite(postId);
    } catch (error) {
      if (isIdentityError(error)) {
        set({ notice: IDENTITY_NOTICE });
        setNotice(IDENTITY_NOTICE);
        return;
      }
      throw error;
    }
    set({
      postIds: get().postIds.filter((value) => value !== postId),
      ids: get().ids.filter((value) => value !== target.id),
    });
  },
  clear: async () => {
    try {
      await clearUserFavorites();
    } catch (error) {
      if (isIdentityError(error)) {
        set({ notice: IDENTITY_NOTICE });
        setNotice(IDENTITY_NOTICE);
        return;
      }
      throw error;
    }
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
