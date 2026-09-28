import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { accentPalettes, useMobilePreferences, type Accent } from "../lib/mobilePreferences";
import { supabase } from "../lib/supabase";
import { theme } from "../theme/theme";

type Privacy = {
  show_bio: boolean;
  show_region: boolean;
  show_language: boolean;
  show_games: boolean;
  show_gaming_dna: boolean;
  show_looking_for: boolean;
  show_availability: boolean;
  show_last_seen: boolean;
  allow_friend_requests: boolean;
  allow_squad_invites: boolean;
  allow_direct_calls: boolean;
};

const privacyDefaults: Privacy = {
  show_bio: true, show_region: true, show_language: true, show_games: true,
  show_gaming_dna: true, show_looking_for: true, show_availability: true,
  show_last_seen: true, allow_friend_requests: true, allow_squad_invites: true,
  allow_direct_calls: true,
};

export function AppSettingsScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { preferences, updatePreferences } = useMobilePreferences();
  const accent = accentPalettes[preferences.accent].primary;
  const [privacy, setPrivacy] = useState<Privacy>(privacyDefaults);
  const [privacyLoaded, setPrivacyLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const loadPrivacy = useCallback(async () => {
    setPrivacyLoaded(false);
    try {
      const { data, error } = await supabase.rpc("get_my_profile_privacy");
      if (error) throw error;
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Confidentialité manquante");
      const row = data as Partial<Privacy> | null;
      setPrivacy(Object.fromEntries(Object.keys(privacyDefaults).map((key) => [
        key, typeof row?.[key as keyof Privacy] === "boolean"
          ? row[key as keyof Privacy] : true,
      ])) as Privacy);
      setNotice("");
      setPrivacyLoaded(true);
    } catch (error) {
      console.error("Confidentialité mobile :", error);
      setNotice("Impossible de charger la confidentialité. Réessaie.");
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadPrivacy(); }, [loadPrivacy]));

  async function savePrivacy() {
    if (!privacyLoaded || saving) return;
    setSaving(true);
    setNotice("");
    try {
      const { error } = await supabase.rpc("update_my_profile_privacy_v16", {
        p_show_bio: privacy.show_bio,
        p_show_region: privacy.show_region,
        p_show_language: privacy.show_language,
        p_show_games: privacy.show_games,
        p_show_gaming_dna: privacy.show_gaming_dna,
        p_show_looking_for: privacy.show_looking_for,
        p_show_availability: privacy.show_availability,
        p_show_last_seen: privacy.show_last_seen,
        p_allow_friend_requests: privacy.allow_friend_requests,
        p_allow_squad_invites: privacy.allow_squad_invites,
        p_allow_direct_calls: privacy.allow_direct_calls,
      });
      if (error) throw error;
      setNotice("Confidentialité enregistrée pour ton compte.");
    } catch (error) {
      console.error("Enregistrement confidentialité mobile :", error);
      setNotice("Enregistrement impossible. Réessaie.");
    } finally {
      setSaving(false);
    }
  }

  const privacyToggle = (key: keyof Privacy, title: string, hint: string) =>
    <SettingSwitch key={key} title={title} hint={hint} value={privacy[key]}
      disabled={!privacyLoaded || saving} accent={accent}
      onChange={(value) => setPrivacy((current) => ({ ...current, [key]: value }))} />;

  return <ScrollView style={styles.root} contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 110 }]}>
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Retour au profil">
        <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={[styles.kicker, { color: accent }]}>GAMEMATE MOBILE</Text>
        <Text style={styles.title}>Paramètres de l’application</Text>
      </View>
    </View>

    <View style={styles.card}>
      <Text style={styles.section}>01 · Apparence</Text>
      <Text style={styles.hint}>Les quatre palettes du Companion PC.</Text>
      <View style={styles.palettes}>
        {(Object.keys(accentPalettes) as Accent[]).map((key) => <Pressable key={key}
          accessibilityRole="radio" accessibilityState={{ checked: preferences.accent === key }}
          onPress={() => updatePreferences({ accent: key })}
          style={[styles.palette, preferences.accent === key && { borderColor: accentPalettes[key].primary }]}>
          <View style={[styles.swatch, { backgroundColor: accentPalettes[key].primary }]} />
          <Text style={styles.paletteName}>{accentPalettes[key].label}</Text>
          {preferences.accent === key && <Ionicons name="checkmark-circle" size={18} color={accent} />}
        </Pressable>)}
      </View>
    </View>

    <View style={styles.card}>
      <Text style={styles.section}>02 · Affichage</Text>
      <Text style={styles.hint}>Ajuste la lecture des conversations.</Text>
      <Text style={styles.optionTitle}>Taille des messages</Text>
      <View style={styles.choices}>
        <Choice label="Normale" selected={preferences.messageSize === "normal"} accent={accent}
          onPress={() => updatePreferences({ messageSize: "normal" })} />
        <Choice label="Grande" selected={preferences.messageSize === "large"} accent={accent}
          onPress={() => updatePreferences({ messageSize: "large" })} />
      </View>
      <Text style={styles.optionTitle}>Espacement des messages</Text>
      <View style={styles.choices}>
        <Choice label="Confort" selected={preferences.density === "comfortable"} accent={accent}
          onPress={() => updatePreferences({ density: "comfortable" })} />
        <Choice label="Compact" selected={preferences.density === "compact"} accent={accent}
          onPress={() => updatePreferences({ density: "compact" })} />
      </View>
    </View>

    <View style={styles.card}>
      <Text style={styles.section}>03 · Notifications</Text>
      <SettingSwitch title="Compteur de messages" hint="Affiche les messages non lus dans la navigation."
        value={preferences.messageBadges} accent={accent}
        onChange={(messageBadges) => updatePreferences({ messageBadges })} />
      <Text style={styles.hint}>Les alertes système sur le téléphone seront ajoutées avec les notifications mobiles.</Text>
    </View>

    <View style={styles.card}>
      <Text style={styles.section}>04 · Confidentialité</Text>
      <Text style={styles.hint}>Ces choix s’appliquent à ton compte GameMate.</Text>
      {!privacyLoaded && !notice ? <ActivityIndicator color={accent} /> : null}
      {privacyToggle("show_last_seen", "Dernière connexion", "Permet aux autres de voir ta dernière activité.")}
      {privacyToggle("allow_friend_requests", "Ajout depuis mon profil", "Affiche le bouton de demande d’ami sur ton profil public.")}
      {privacyToggle("allow_squad_invites", "Invitations d’équipe", "Autorise les invitations aux groupes.")}
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {!privacyLoaded && !!notice ? <Pressable onPress={() => void loadPrivacy()} style={styles.retry}>
        <Text style={[styles.retryText, { color: accent }]}>Réessayer</Text>
      </Pressable> : null}
      <Pressable onPress={() => void savePrivacy()} disabled={!privacyLoaded || saving}
        style={[styles.save, { backgroundColor: accent }, (!privacyLoaded || saving) && styles.disabled]}>
        <Text style={styles.saveText}>{saving ? "Enregistrement…" : "Enregistrer la confidentialité"}</Text>
      </Pressable>
    </View>
  </ScrollView>;
}

function Choice({ label, selected, accent, onPress }: {
  label: string; selected: boolean; accent: string; onPress: () => void;
}) {
  return <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: selected }}
    style={[styles.choice, selected && { borderColor: accent }]}>
    <Text style={styles.choiceText}>{label}</Text>
    {selected && <Ionicons name="checkmark" size={16} color={accent} />}
  </Pressable>;
}

function SettingSwitch({ title, hint, value, accent, onChange, disabled = false }: {
  title: string; hint: string; value: boolean; accent: string;
  onChange: (value: boolean) => void; disabled?: boolean;
}) {
  return <View style={styles.switchRow}>
    <View style={styles.switchCopy}><Text style={styles.optionTitle}>{title}</Text><Text style={styles.hint}>{hint}</Text></View>
    <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: accent, false: theme.colors.border }}
      thumbColor="#FFFFFF" accessibilityLabel={title} />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  page: { paddingHorizontal: 18, paddingTop: 18, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 5 },
  headerCopy: { flex: 1 },
  back: { width: 42, height: 42, borderRadius: 13, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center" },
  kicker: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  title: { fontSize: 20, fontWeight: "900", color: theme.colors.text },
  card: { padding: 17, borderRadius: 18, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, gap: 11 },
  section: { color: theme.colors.text, fontSize: 17, fontWeight: "800" },
  hint: { color: theme.colors.textSoft, fontSize: 12, lineHeight: 17 },
  palettes: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  palette: { width: "48%", minHeight: 62, flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, paddingHorizontal: 9, backgroundColor: theme.colors.surfaceSoft },
  swatch: { width: 18, height: 32, borderRadius: 6 },
  paletteName: { flex: 1, color: theme.colors.text, fontSize: 11, fontWeight: "700" },
  optionTitle: { color: theme.colors.text, fontSize: 13, fontWeight: "700" },
  choices: { flexDirection: "row", gap: 9 },
  choice: { flex: 1, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: theme.colors.surfaceSoft, borderRadius: 11, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 11 },
  choiceText: { color: theme.colors.text, fontSize: 12, fontWeight: "700" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 3 },
  switchCopy: { flex: 1, gap: 3 },
  notice: { color: theme.colors.textSoft, fontSize: 12 },
  retry: { alignSelf: "flex-start", paddingVertical: 5 },
  retryText: { fontWeight: "800" },
  save: { alignItems: "center", borderRadius: 12, padding: 13 },
  saveText: { color: "#FFFFFF", fontWeight: "800" },
  disabled: { opacity: 0.5 },
});
