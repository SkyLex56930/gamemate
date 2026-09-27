import { supabase } from "./supabase";

export type Cosmetic = {
  id: string;
  name: string;
  cosmetic_type: "frame" | "banner";
  rarity: "common" | "rare" | "epic" | "legendary";
  unlock_method: "objective" | "purchase" | "granted";
  unlock_label: string | null;
  price_eur_cents: number | null;
  style: { accent?: string; gradient?: string } | null;
};

export type ShopObjective = {
  id: string;
  title: string;
  description: string;
  target_value: number;
  reward_cosmetic_id: string | null;
  progress: number;
  completed: boolean;
  claimed: boolean;
};

export type ShopData = {
  cosmetics: Cosmetic[];
  ownedIds: Set<string>;
  equippedFrameId: string | null;
  equippedBannerId: string | null;
  objectives: ShopObjective[];
};

export async function loadShop(userId: string): Promise<ShopData> {
  // The PC client uses this RPC to update objective progress before loading rewards.
  const sync = await supabase.rpc("sync_profile_objectives");
  if (sync.error) throw sync.error;

  const [catalog, owned, objectives, progress, profile] = await Promise.all([
    supabase.from("profile_cosmetics")
      .select("id,name,cosmetic_type,rarity,unlock_method,unlock_label,price_eur_cents,style")
      .eq("is_active", true).order("created_at", { ascending: true }),
    supabase.from("user_cosmetics").select("cosmetic_id").eq("user_id", userId),
    supabase.from("profile_objectives")
      .select("id,title,description,target_value,reward_cosmetic_id")
      .eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("user_objective_progress")
      .select("objective_id,progress,completed_at,claimed_at").eq("user_id", userId),
    supabase.from("profiles").select("equipped_frame_id,equipped_banner_cosmetic_id")
      .eq("id", userId).single(),
  ]);
  const error = [catalog, owned, objectives, progress, profile].find((result) => result.error)?.error;
  if (error) throw error;

  const ownedIds = new Set((owned.data ?? []).map((row) => row.cosmetic_id));
  const progressById = new Map((progress.data ?? []).map((row) => [row.objective_id, row]));
  return {
    cosmetics: (catalog.data ?? []) as Cosmetic[],
    ownedIds,
    equippedFrameId: profile.data?.equipped_frame_id ?? null,
    equippedBannerId: profile.data?.equipped_banner_cosmetic_id ?? null,
    objectives: (objectives.data ?? []).map((objective) => {
      const current = progressById.get(objective.id);
      return {
        ...objective,
        progress: current?.progress ?? 0,
        completed: !!current?.completed_at || (current?.progress ?? 0) >= objective.target_value,
        claimed: !!current?.claimed_at || !!(objective.reward_cosmetic_id && ownedIds.has(objective.reward_cosmetic_id)),
      };
    }),
  };
}

export async function equipCosmetic(cosmetic: Cosmetic | null, slot: Cosmetic["cosmetic_type"]) {
  const { error } = await supabase.rpc("equip_profile_cosmetic", {
    p_cosmetic_id: cosmetic?.id ?? null, p_slot: slot,
  });
  if (error) throw error;
}

export async function claimObjective(objectiveId: string) {
  const { error } = await supabase.rpc("claim_objective_reward", { p_objective_id: objectiveId });
  if (error) throw error;
}

export function cosmeticColors(cosmetic: Cosmetic | null): [string, string, ...string[]] {
  const colors = cosmetic?.style?.gradient?.match(/#[0-9a-f]{6}\b/gi);
  return colors && colors.length >= 2
    ? [colors[0], colors[1], ...colors.slice(2)]
    : ["#172744", "#35256A", "#194459"];
}
