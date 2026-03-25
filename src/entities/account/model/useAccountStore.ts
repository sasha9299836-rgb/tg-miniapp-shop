import { create } from "zustand";

export type Profile = {
  firstName: string;
  lastName: string;
  birthDate: string; // YYYY-MM-DD
  telegramUsername: string;
  email: string;
};

type State = {
  profile: Profile;
  setProfile: (patch: Partial<Profile>) => void;
};

export const useAccountStore = create<State>((set) => ({
  profile: {
    firstName: "Сеня",
    lastName: "",
    birthDate: "",
    telegramUsername: "@username",
    email: "",
  },
  setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
}));
