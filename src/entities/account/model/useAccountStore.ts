import { create } from "zustand";

export type Profile = {
  firstName: string;
  lastName: string;
  birthDate: string; // YYYY-MM-DD
  telegramUsername: string;
  telegramId: string;
  registeredAt: string | null;
  email: string;
};

export type TelegramBootstrapStatus =
  | "idle"
  | "started"
  | "no_user"
  | "upsert_started"
  | "upsert_success"
  | "upsert_error";

type State = {
  profile: Profile;
  setProfile: (patch: Partial<Profile>) => void;
  applyTelegramProfile: (payload: {
    telegramId: number;
    telegramUsername: string | null;
    telegramFirstName: string | null;
    telegramLastName: string | null;
    registeredAt: string | null;
  }) => void;
  telegramDebug: {
    status: TelegramBootstrapStatus;
    upsertError: string | null;
  };
  setTelegramDebug: (patch: Partial<State["telegramDebug"]>) => void;
};

export const useAccountStore = create<State>((set) => ({
  profile: {
    firstName: "",
    lastName: "",
    birthDate: "",
    telegramUsername: "",
    telegramId: "",
    registeredAt: null,
    email: "",
  },
  setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
  applyTelegramProfile: (payload) =>
    set((s) => ({
      profile: {
        ...s.profile,
        telegramId: String(payload.telegramId),
        telegramUsername: payload.telegramUsername ? `@${payload.telegramUsername}` : "",
        firstName: s.profile.firstName.trim() || payload.telegramFirstName || "",
        lastName: s.profile.lastName.trim() || payload.telegramLastName || "",
        registeredAt: payload.registeredAt,
      },
    })),
  telegramDebug: {
    status: "idle",
    upsertError: null,
  },
  setTelegramDebug: (patch) =>
    set((s) => ({
      telegramDebug: { ...s.telegramDebug, ...patch },
    })),
}));
