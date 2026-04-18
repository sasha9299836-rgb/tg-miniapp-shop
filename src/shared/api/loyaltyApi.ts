import { supabase } from "./supabaseClient";
import { ensureTelegramUserSessionToken } from "../auth/tgUserSession";

export type LoyaltyStateBonuses = {
  level_1_one_time_discount_percent: number;
  level_1_one_time_discount_cap_order_rub: number;
  level_1_one_time_discount_fixed_rub: number;
  level_2_preview_early_access_hours: number;
  level_2_single_use_promocodes_7_percent: number;
  level_3_delivery_discount_cap_rub: number;
  level_3_preview_early_access_hours: number;
  permanent_discount_percent: number;
};

export type LoyaltyState = {
  total_spent: number;
  level: number;
  next_level: number | null;
  next_level_threshold: number | null;
  amount_to_next_level: number;
  bonuses: LoyaltyStateBonuses;
};

export async function getLoyaltyState(): Promise<LoyaltyState> {
  const session = await ensureTelegramUserSessionToken();
  if (!session) {
    throw new Error("TG_IDENTITY_REQUIRED");
  }

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    loyalty?: LoyaltyState;
  }>("tg_loyalty_state_secure", {
    body: {},
    headers: {
      "x-tg-user-session": session,
    },
  });

  if (error) throw error;
  if (!data?.ok || !data.loyalty) {
    throw new Error(String(data?.error ?? "LOYALTY_STATE_LOAD_FAILED"));
  }
  return data.loyalty;
}

