import { create } from "zustand";
import type { Product } from "../../../shared/types/product";
import { useCartStore } from "./useCartStore";

type CartTarget = { id: number; postId?: string | null };

type PendingDefectConfirm = {
  productId: number;
  postId: string | null;
  itemRef: string;
};

type State = {
  reviewedByItemKey: Record<string, true>;
  pendingConfirm: PendingDefectConfirm | null;
  hasReviewed: (target: CartTarget) => boolean;
  markReviewed: (target: CartTarget) => void;
  requestAddWithDefectGuard: (product: Product) => Promise<void>;
  confirmPendingAndAdd: () => Promise<void>;
  declinePendingForReview: () => PendingDefectConfirm | null;
};

function toItemKey(target: CartTarget): string {
  const postId = String(target.postId ?? "").trim();
  if (postId) return `post:${postId}`;
  return `id:${target.id}`;
}

function toCartTarget(product: Product): CartTarget {
  return {
    id: product.id,
    postId: product.postId ?? null,
  };
}

function toItemRef(product: Product): string {
  const postId = String(product.postId ?? "").trim();
  if (postId) return postId;
  return String(product.id);
}

function hasDefects(product: Product): boolean {
  if (product.hasDefects) return true;
  if (String(product.defectsText ?? "").trim()) return true;
  if (Array.isArray(product.defectMedia) && product.defectMedia.length > 0) return true;
  if (Array.isArray(product.defectImages) && product.defectImages.length > 0) return true;
  return false;
}

export const useDefectReviewStore = create<State>((set, get) => ({
  reviewedByItemKey: {},
  pendingConfirm: null,
  hasReviewed: (target) => {
    const key = toItemKey(target);
    return Boolean(get().reviewedByItemKey[key]);
  },
  markReviewed: (target) => {
    const key = toItemKey(target);
    set((state) => {
      if (state.reviewedByItemKey[key]) return state;
      return {
        reviewedByItemKey: {
          ...state.reviewedByItemKey,
          [key]: true,
        },
      };
    });
  },
  requestAddWithDefectGuard: async (product) => {
    const target = toCartTarget(product);
    if (!hasDefects(product)) {
      await useCartStore.getState().add(target);
      return;
    }
    if (get().hasReviewed(target)) {
      await useCartStore.getState().add(target);
      return;
    }

    set({
      pendingConfirm: {
        productId: product.id,
        postId: String(product.postId ?? "").trim() || null,
        itemRef: toItemRef(product),
      },
    });
  },
  confirmPendingAndAdd: async () => {
    const pending = get().pendingConfirm;
    if (!pending) return;
    const target: CartTarget = {
      id: pending.productId,
      postId: pending.postId,
    };
    get().markReviewed(target);
    set({ pendingConfirm: null });
    await useCartStore.getState().add(target);
  },
  declinePendingForReview: () => {
    const pending = get().pendingConfirm;
    set({ pendingConfirm: null });
    return pending;
  },
}));

