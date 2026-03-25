import { create } from "zustand";

export type Profile = {
  firstName: string;
  lastName: string;
  middleName: string;
  phone: string;
  telegramUsername: string;
  telegramId: string;
  registeredAt: string | null;
  email: string;
};

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
};

export const useAccountStore = create<State>((set) => ({
  profile: {
    firstName: "",
    lastName: "",
    middleName: "",
    phone: "",
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
        registeredAt: payload.registeredAt,
      },
    })),
}));
