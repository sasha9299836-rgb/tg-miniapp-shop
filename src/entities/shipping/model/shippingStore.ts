import { create } from "zustand";
import type { City, PickupPoint } from "../../../shared/api/shipping.repository";
import { shippingApiClient } from "../../../shared/api/shippingApiClient";

export type SavedPvz = PickupPoint & {
  id: string;
  createdAt: number;
};

export type Parcel = {
  weight_g: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  description: string;
};

export type CalcResult = {
  price: number;
  period_min?: number;
  period_max?: number;
  selectedTariffCode?: number;
  raw: unknown;
};

type DoorAddress = {
  city: string;
  street: string;
  house: string;
  entrance: string;
  apartment: string;
  floor: string;
};

type ShippingState = {
  selectedCity: City | null;
  savedPvz: SavedPvz[];
  primaryPvzId: string | null;

  receiverCity: City | null;
  pvz: PickupPoint | null;
  parcel: Parcel;
  orderType: "internet_store" | "regular";
  recipient: { name: string; phone: string };
  deliveryType: "pickup" | "door";
  doorAddress: DoorAddress;
  orderValueRub: number;

  calcResult: CalcResult | null;
  isCalculating: boolean;
  errorMessage: string | null;

  setSelectedCity: (city: City | null) => void;
  addPvz: (pvz: PickupPoint) => void;
  removePvz: (id: string) => void;
  setPrimaryPvz: (id: string) => void;
  getPrimaryPvz: () => SavedPvz | null;
  getMainPvz: () => SavedPvz | null;

  setReceiverCity: (city: City | null) => void;
  setPvz: (pvz: PickupPoint | null) => void;
  setParcelField: (field: keyof Parcel, value: number | string) => void;
  setRecipientField: (field: "name" | "phone", value: string) => void;
  setDeliveryType: (value: "pickup" | "door") => void;
  setDoorAddressField: (field: keyof DoorAddress, value: string) => void;
  setOrderType: (value: "internet_store" | "regular") => void;
  setOrderValueRub: (value: number) => void;

  calculateTariff: () => Promise<void>;
};

function makeId(p: PickupPoint) {
  return `${p.code}`;
}

export const useShippingStore = create<ShippingState>((set, get) => ({
  selectedCity: null,
  savedPvz: [],
  primaryPvzId: null,

  receiverCity: null,
  pvz: null,
  parcel: {
    weight_g: 400,
    length_cm: 15,
    width_cm: 10,
    height_cm: 4,
    description: "Р С›Р Т‘Р ВµР В¶Р Т‘Р В°",
  },
  orderType: "internet_store",
  recipient: { name: "", phone: "" },
  deliveryType: "pickup",
  doorAddress: {
    city: "",
    street: "",
    house: "",
    entrance: "",
    apartment: "",
    floor: "",
  },
  orderValueRub: 0,

  calcResult: null,
  isCalculating: false,
  errorMessage: null,

  setSelectedCity: (city) => set(() => ({ selectedCity: city })),

  addPvz: (pvz) =>
    set((state) => {
      const id = makeId(pvz);
      const exists = state.savedPvz.some((x) => x.id === id);
      const nextSaved = exists
        ? state.savedPvz
        : [{ ...pvz, id, createdAt: Date.now() }, ...state.savedPvz];
      const nextPrimary = state.primaryPvzId ?? id;
      return { savedPvz: nextSaved, primaryPvzId: nextPrimary };
    }),

  removePvz: (id) =>
    set((state) => {
      const next = state.savedPvz.filter((x) => x.id !== id);
      const nextPrimary = state.primaryPvzId === id ? (next[0]?.id ?? null) : state.primaryPvzId;
      return { savedPvz: next, primaryPvzId: nextPrimary };
    }),

  setPrimaryPvz: (id) =>
    set((state) => {
      const found = state.savedPvz.find((x) => x.id === id) ?? null;
      return { primaryPvzId: id, pvz: found ?? state.pvz };
    }),

  getPrimaryPvz: () => {
    const { savedPvz, primaryPvzId } = get();
    if (!primaryPvzId) return null;
    return savedPvz.find((x) => x.id === primaryPvzId) ?? null;
  },

  getMainPvz: () => {
    const { savedPvz, primaryPvzId } = get();
    if (!primaryPvzId) return null;
    return savedPvz.find((x) => x.id === primaryPvzId) ?? null;
  },

  setReceiverCity: (city) =>
    set(() => ({
      receiverCity: city,
      selectedCity: city,
      pvz: null,
    })),

  setPvz: (pvz) => set(() => ({ pvz })),

  setParcelField: (field, value) =>
    set((state) => ({
      parcel: { ...state.parcel, [field]: value },
    })),

  setRecipientField: (field, value) =>
    set((state) => ({
      recipient: { ...state.recipient, [field]: value },
    })),

  setDeliveryType: (value) => set({ deliveryType: value }),

  setDoorAddressField: (field, value) =>
    set((state) => ({
      doorAddress: { ...state.doorAddress, [field]: value },
    })),

  setOrderType: (value) => set({ orderType: value }),
  setOrderValueRub: (value) => set({ orderValueRub: value }),

  calculateTariff: async () => {
    const { receiverCity, parcel, orderValueRub } = get();
    if (!receiverCity) {
      set({ errorMessage: "Р вЂ™РЎвЂ№Р В±Р ВµРЎР‚Р С‘РЎвЂљР Вµ Р С–Р С•РЎР‚Р С•Р Т‘ Р С—Р С•Р В»РЎС“РЎвЂЎР В°РЎвЂљР ВµР В»РЎРЏ." });
      return;
    }

    set({ isCalculating: true, errorMessage: null, calcResult: null });
    try {
      const raw = await shippingApiClient.quote({
        receiverCityCode: receiverCity.code,
        package: {
          weight: Math.max(1, Math.round(parcel.weight_g)),
          length: Math.max(1, Math.round(parcel.length_cm)),
          width: Math.max(1, Math.round(parcel.width_cm)),
          height: Math.max(1, Math.round(parcel.height_cm)),
        },
      });

      const selectedTariff = (raw?.selectedTariff ?? null) as Record<string, unknown> | null;
      const result = {
        price:
          Number(
            selectedTariff?.delivery_sum ??
              selectedTariff?.total_sum ??
              selectedTariff?.price ??
              selectedTariff?.cost ??
              orderValueRub,
          ) || 0,
        period_min: Number(selectedTariff?.period_min ?? selectedTariff?.delivery_period_min) || undefined,
        period_max: Number(selectedTariff?.period_max ?? selectedTariff?.delivery_period_max) || undefined,
        selectedTariffCode: raw?.selectedTariffCode,
        raw,
      };

      set({ calcResult: result });
    } catch (err) {
      set({ errorMessage: (err as Error).message });
    } finally {
      set({ isCalculating: false });
    }
  },
}));

export default useShippingStore;
