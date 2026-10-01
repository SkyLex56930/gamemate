import { supabase } from "./supabase";

export type Conversation = {
  id: string;
  user_a: string;
  user_b: string;
  updated_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export type VoiceMessagePayload = {
  version: 1;
  path: string;
  duration: number;
  mime: string;
};

export const VOICE_MESSAGE_BUCKET = "voice-messages";
export const VOICE_MESSAGE_MARKER = "\n[gm-voice:v1]";
export const MAX_VOICE_DURATION_SECONDS = 90;

export type ChatProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type ConversationItem = {
  conversation: Conversation;
  profile: ChatProfile;
  lastMessage: Message | null;
  unread: number;
};

export async function getConversations(userId: string): Promise<ConversationItem[]> {
  const { data: rows, error } = await supabase
    .from("conversations")
    .select("id,user_a,user_b,updated_at")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const conversations = (rows ?? []) as Conversation[];
  if (!conversations.length) return [];

  const otherIds = [...new Set(conversations.map((row) => row.user_a === userId ? row.user_b : row.user_a))];
  const [profiles, messages] = await Promise.all([
    supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", otherIds),
    supabase.from("messages")
      .select("id,conversation_id,sender_id,body,created_at,read_at")
      .in("conversation_id", conversations.map((row) => row.id))
      .order("created_at", { ascending: false }),
  ]);
  if (profiles.error) throw profiles.error;
  if (messages.error) throw messages.error;

  const profileById = new Map((profiles.data ?? []).map((row) => [row.id, row as ChatProfile]));
  const latest = new Map<string, Message>();
  const unread = new Map<string, number>();
  for (const message of (messages.data ?? []) as Message[]) {
    if (!latest.has(message.conversation_id)) latest.set(message.conversation_id, message);
    if (message.sender_id !== userId && !message.read_at) {
      unread.set(message.conversation_id, (unread.get(message.conversation_id) ?? 0) + 1);
    }
  }

  return conversations.map((conversation) => {
    const otherId = conversation.user_a === userId ? conversation.user_b : conversation.user_a;
    return {
      conversation,
      profile: profileById.get(otherId) ?? { id: otherId, username: null, display_name: "Joueur", avatar_url: null },
      lastMessage: latest.get(conversation.id) ?? null,
      unread: unread.get(conversation.id) ?? 0,
    };
  }).sort((a, b) => Date.parse(b.lastMessage?.created_at ?? b.conversation.updated_at)
    - Date.parse(a.lastMessage?.created_at ?? a.conversation.updated_at));
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase.from("messages")
    .select("id,conversation_id,sender_id,body,created_at,read_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function markRead(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
  if (error) throw error;
}

export async function sendMessage(conversationId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc("send_message", {
    p_conversation_id: conversationId,
    p_body: body,
  });
  if (error) throw error;
}

export function chatName(profile: ChatProfile): string {
  return profile.display_name || profile.username || "Joueur";
}

export function parseVoiceMessage(body: string): VoiceMessagePayload | null {
  const markerIndex = body.indexOf(VOICE_MESSAGE_MARKER);
  if (markerIndex < 0) return null;
  try {
    const value = JSON.parse(body.slice(markerIndex + VOICE_MESSAGE_MARKER.length)) as Partial<VoiceMessagePayload>;
    if (value.version !== 1 || typeof value.path !== "string"
      || typeof value.duration !== "number" || typeof value.mime !== "string") return null;
    return value as VoiceMessagePayload;
  } catch {
    return null;
  }
}

export function messagePreview(body: string): string {
  return parseVoiceMessage(body) ? "🎙️ Message vocal" : body;
}

export function formatVoiceDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}
