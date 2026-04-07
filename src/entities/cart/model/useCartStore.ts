import { create } from "zustand";
import { TG_IDENTITY_REQUIRED_ERROR } from "../../../shared/auth/tgUser";
import {
  addUserCartItem,
  clearUserCart,
  listUserCart,
  removeUserCartItem,
} from "../../../shared/api/userCollectionsApi";

export type CartItem = { productId: number; postId?: string; qty: number };

type CartTarget = { id: number; postId?: string | null };

type State = {
  items: CartItem[];
  isLoaded: boolean;
  notice: string | null;
  load: () => Promise<void>;
  registerCatalogItems: (items: CartTarget[]) => void;
  add: (target: CartTarget) => Promise<void>;
  remove: (target: CartTarget) => Promise<void>;
  removeByPostId: (postId: string) => Promise<void>;
  clear: () => Promise<void>;
  totalQty: () => number;
  has: (target: CartTarget) => boolean;
  pruneUnavailable: (availablePostIds: string[]) => Promise<number>;
  consumeNotice: () => string | null;
};

const productToPost = new Map<number, string>();
const postToProduct = new Map<string, number>();

function resolvePostId(target: CartTarget): string | null {
  const inline = String(target.postId ?? "").trim();
  if (inline) return inline;
  return productToPost.get(target.id) ?? null;
}

function resolveProductId(postId: string) {
  return postToProduct.get(postId) ?? Number.NaN;
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

export const useCartStore = create<State>((set, get) => ({
  items: [],
  isLoaded: false,
  notice: null,
  load: async () => {
    try {
      const rows = await listUserCart();
      const items: CartItem[] = rows.map((row) => {
        const postId = String(row.post_id ?? "").trim();
        const mappedProductId = resolveProductId(postId);
        return {
          productId: Number.isFinite(mappedProductId) ? mappedProductId : -1,
          postId,
          qty: 1,
        };
      });
      set({ items, isLoaded: true });
    } catch (error) {
      if (isIdentityError(error)) {
        set({ items: [], isLoaded: true, notice: IDENTITY_NOTICE });
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
      postToProduct.set(postId, item.id);
    }
    const current = get().items;
    const next = current.map((item) => {
      if (item.productId !== -1 || !item.postId) return item;
      const mapped = resolveProductId(item.postId);
      return Number.isFinite(mapped) ? { ...item, productId: mapped } : item;
    });
    const changed = next.some((item, index) => item.productId !== current[index]?.productId);
    if (changed) {
      set({ items: next });
    }
  },
  add: async (target) => {
    const postId = resolvePostId(target);
    if (!postId) return;

    const state = get();
    if (state.items.some((item) => item.postId === postId || item.productId === target.id)) {
      return;
    }

    let result: "ADDED" | "ALREADY_EXISTS" | "LIMIT_REACHED" | "BAD_PAYLOAD";
    try {
      result = await addUserCartItem(postId);
    } catch (error) {
      if (isIdentityError(error)) {
        set({ notice: IDENTITY_NOTICE });
        setNotice(IDENTITY_NOTICE);
        return;
      }
      throw error;
    }
    if (result === "LIMIT_REACHED") {
      const text = "В корзине может быть не больше 10 товаров";
      set({ notice: text });
      setNotice(text);
      return;
    }
    if (result === "BAD_PAYLOAD") return;

    set({ items: [...state.items, { productId: target.id, postId, qty: 1 }] });
  },
  remove: async (target) => {
    const postId = resolvePostId(target);
    if (!postId) return;
    try {
      await removeUserCartItem(postId);
    } catch (error) {
      if (isIdentityError(error)) {
        set({ notice: IDENTITY_NOTICE });
        setNotice(IDENTITY_NOTICE);
        return;
      }
      throw error;
    }
    set({
      items: get().items.filter((item) => item.postId !== postId),
    });
  },
  removeByPostId: async (postId) => {
    const normalized = String(postId ?? "").trim();
    if (!normalized) return;
    try {
      await removeUserCartItem(normalized);
    } catch (error) {
      if (isIdentityError(error)) {
        set({ notice: IDENTITY_NOTICE });
        setNotice(IDENTITY_NOTICE);
        return;
      }
      throw error;
    }
    set({
      items: get().items.filter((item) => item.postId !== normalized),
    });
  },
  clear: async () => {
    try {
      await clearUserCart();
    } catch (error) {
      if (isIdentityError(error)) {
        set({ notice: IDENTITY_NOTICE });
        setNotice(IDENTITY_NOTICE);
        return;
      }
      throw error;
    }
    set({ items: [] });
  },
  totalQty: () => get().items.reduce((sum, item) => sum + item.qty, 0),
  has: (target) => {
    const postId = resolvePostId(target);
    if (postId) return get().items.some((item) => item.postId === postId);
    return get().items.some((item) => item.productId === target.id);
  },
  pruneUnavailable: async (availablePostIds) => {
    const allowed = new Set(availablePostIds.map((value) => String(value ?? "").trim()).filter(Boolean));
    const toRemove = get().items.filter((item) => !item.postId || !allowed.has(item.postId));
    if (!toRemove.length) return 0;

    for (const item of toRemove) {
      if (!item.postId) continue;
      try {
        await removeUserCartItem(item.postId);
      } catch (error) {
        if (isIdentityError(error)) {
          set({ notice: IDENTITY_NOTICE });
          return 0;
        }
        throw error;
      }
    }

    set({
      items: get().items.filter((item) => item.postId && allowed.has(item.postId)),
      notice: "Один или несколько товаров были удалены из корзины, потому что уже недоступны",
    });
    return toRemove.length;
  },
  consumeNotice: () => {
    const message = get().notice;
    if (message) set({ notice: null });
    return message;
  },
}));
