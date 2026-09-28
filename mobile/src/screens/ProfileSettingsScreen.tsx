import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "../components/Avatar";
import { supabase } from "../lib/supabase";
import { theme } from "../theme/theme";
import { useAccentPalette } from "../lib/mobilePreferences";

export function ProfileSettingsScreen({ session, onBack }: { session: Session; onBack: () => void }) {
  const palette = useAccentPalette();
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [region, setRegion] = useState("");
  const [language, setLanguage] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("display_name,username,bio,region,language,avatar_url")
      .eq("id", session.user.id)
      .single();
    if (!data) return;
    setDisplayName(data.display_name ?? "");
    setUsername(data.username ?? "");
    setBio(data.bio ?? "");
    setRegion(data.region ?? "");
    setLanguage(data.language ?? "");
    setAvatarUrl(data.avatar_url);
  }, [session.user.id]);

  useFocusEffect(useCallback(() => { void loadProfile(); }, [loadProfile]));

  async function save() {
    if (saving) return;
    if (!username.trim() || !displayName.trim()) {
      setNotice("Le pseudo et le nom affiché sont obligatoires.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          username: username.trim(),
          display_name: displayName.trim(),
          bio: bio.trim() || null,
          region: region.trim() || null,
          language: language.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.user.id);
      if (error) setNotice("Enregistrement impossible. Vérifie ton pseudo et réessaie.");
      else onBack();
    } catch (cause) {
      console.error("Paramètres du profil :", cause);
      setNotice("Enregistrement impossible. Réessaie.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 110 }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Retour au profil">
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <View>
          <Text style={[styles.kicker, { color: palette.secondary }]}>PARAMÈTRES</Text>
          <Text style={styles.headerTitle}>Modifier mon profil</Text>
        </View>
      </View>
      <View style={styles.identity}>
        <Avatar name={displayName || username || "Joueur"} url={avatarUrl} size={68} />
        <View style={styles.identityCopy}>
          <Text style={styles.name}>{displayName || username || "Joueur"}</Text>
          <Text style={styles.handle}>@{username || "joueur"}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Pseudo</Text>
        <TextInput value={username} onChangeText={setUsername} style={styles.input}
          autoCapitalize="none" autoCorrect={false} maxLength={30} />

        <Text style={styles.label}>Nom affiché</Text>

        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          style={styles.input}
        />

        <Text style={styles.label}>Bio</Text>

        <TextInput
          value={bio}
          onChangeText={setBio}
          multiline
          style={[styles.input, styles.textarea]}
        />

        <Text style={styles.label}>Région</Text>

        <TextInput
          value={region}
          onChangeText={setRegion}
          style={styles.input}
        />

        <Text style={styles.label}>Langue</Text>

        <TextInput
          value={language}
          onChangeText={setLanguage}
          style={styles.input}
        />

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <Pressable style={[styles.button, { backgroundColor: palette.primary }, saving && styles.disabled]} disabled={saving} onPress={() => void save()}>
          <Ionicons name="save-outline" size={18} color="#FFF" />
          <Text style={styles.buttonText}>{saving ? "Enregistrement…" : "Enregistrer"}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: theme.colors.background,
    paddingTop: 14,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 20 },
  back: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center" },
  kicker: { color: theme.colors.cyan, fontWeight: "800", fontSize: 10, letterSpacing: 1 },
  headerTitle: { color: theme.colors.text, fontWeight: "800", fontSize: 22 },
  identity: { flexDirection: "row", gap: 13, alignItems: "center", marginHorizontal: 20, marginTop: 24 },
  identityCopy: { flex: 1 },
  name: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  handle: {
    color: theme.colors.textSoft,
    marginTop: 3,
  },
  card: {
    gap: 9,
    margin: 20,
    padding: 16,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  label: {
    color: "#B5C0CE",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 13,
    borderRadius: 13,
    backgroundColor: theme.colors.surfaceSoft,
    color: theme.colors.text,
  },
  textarea: {
    minHeight: 100,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  notice: {
    color: theme.colors.success,
    fontSize: 12,
  },
  button: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 13,
    backgroundColor: theme.colors.primary,
    marginTop: 8,
  },
  buttonText: {
    color: "#FFF",
    fontWeight: "900",
  },
  disabled: { opacity: 0.6 },
});
