import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { theme } from "../theme/theme";
import { useAccentPalette } from "../lib/mobilePreferences";

export function LoginScreen() {
  const palette = useAccentPalette();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(), password,
      });
      if (signInError) setError("Connexion impossible. Vérifie ton e-mail et ton mot de passe.");
    } catch (cause) {
      console.error("Connexion mobile:", cause);
      setError("Connexion impossible. Vérifie ta connexion Internet.");
    } finally {
      setBusy(false);
    }
  }

  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={[styles.logo, { backgroundColor: palette.primary }]}><Ionicons name="game-controller" size={32} color="#FFFFFF" /></View>
      <Text style={[styles.brand, { color: palette.secondary }]}>GameMate</Text>
      <Text style={styles.title}>Retrouve tes mates.</Text>
      <Text style={styles.description}>Connecte-toi avec le même compte que sur le Companion.</Text>
      <TextInput style={styles.input} placeholder="E-mail" placeholderTextColor={theme.colors.textMuted}
        value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
        keyboardType="email-address" autoComplete="email" />
      <TextInput style={styles.input} placeholder="Mot de passe" placeholderTextColor={theme.colors.textMuted}
        value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false}
        autoComplete="current-password" />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.button, { backgroundColor: palette.primary }, busy && styles.disabled]} disabled={busy} onPress={() => void signIn()}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Se connecter</Text>}
      </Pressable>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { flexGrow: 1, justifyContent: "center", padding: 28, gap: 14 },
  logo: { width: 62, height: 62, borderRadius: 18, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  brand: { fontSize: 15, color: theme.colors.cyan, fontWeight: "800" },
  title: { fontSize: 30, color: theme.colors.text, fontWeight: "800" },
  description: { color: theme.colors.textSoft, marginBottom: 18, lineHeight: 21 },
  input: { minHeight: 52, paddingHorizontal: 15, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, color: theme.colors.text },
  error: { color: theme.colors.danger, lineHeight: 20 },
  button: { minHeight: 52, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primary, borderRadius: 14, marginTop: 6 },
  buttonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  disabled: { opacity: 0.6 },
});
