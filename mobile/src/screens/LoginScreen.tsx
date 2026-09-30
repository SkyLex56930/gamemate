import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BrandLogo } from "../components/BrandLogo";
import { supabase } from "../lib/supabase";
import { theme } from "../theme/theme";
import { useAccentPalette } from "../lib/mobilePreferences";
import { useAndroidKeyboardOverlap } from "../lib/useAndroidKeyboardOverlap";

export function LoginScreen() {
  const palette = useAccentPalette();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scroll = useRef<ScrollView>(null);
  const passwordInput = useRef<TextInput>(null);
  const focusedField = useRef<"email" | "password">("email");
  const { root, keyboardVisible, keyboardInset, measureKeyboardOverlap } = useAndroidKeyboardOverlap();

  const scrollToFocusedField = useCallback(() => {
    if (focusedField.current === "email") scroll.current?.scrollTo({ y: 0, animated: true });
    else scroll.current?.scrollToEnd({ animated: true });
  }, []);

  useEffect(() => {
    if (keyboardVisible) requestAnimationFrame(scrollToFocusedField);
  }, [keyboardVisible, keyboardInset, scrollToFocusedField]);

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

  return <View ref={root} style={styles.root} onLayout={measureKeyboardOverlap}>
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView ref={scroll} contentContainerStyle={[styles.content,
      keyboardVisible && styles.contentTyping,
      Platform.OS === "android" && { paddingBottom: keyboardInset + 28 },
    ]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {!keyboardVisible && <BrandLogo style={styles.logo} />}
      <Text style={[styles.brand, { color: palette.secondary }]}>PLAY • CONNECT • IMPROVE</Text>
      <Text style={styles.title}>{keyboardVisible ? "Connexion" : "Retrouve tes mates."}</Text>
      {!keyboardVisible && <Text style={styles.description}>Connecte-toi avec le même compte que sur le Companion.</Text>}
      <TextInput style={styles.input} placeholder="E-mail" placeholderTextColor={theme.colors.textMuted}
        value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
        keyboardType="email-address" autoComplete="email" returnKeyType="next"
        onFocus={() => { focusedField.current = "email"; requestAnimationFrame(scrollToFocusedField); }}
        onSubmitEditing={() => passwordInput.current?.focus()} />
      <TextInput ref={passwordInput} style={styles.input} placeholder="Mot de passe" placeholderTextColor={theme.colors.textMuted}
        value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false}
        autoComplete="current-password" returnKeyType="go" onSubmitEditing={() => void signIn()}
        onFocus={() => { focusedField.current = "password"; requestAnimationFrame(scrollToFocusedField); }} />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={() => void signIn()}>
        <LinearGradient colors={[palette.secondary, palette.primary, theme.colors.magenta]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.buttonGradient}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Se connecter</Text>}
        </LinearGradient>
      </Pressable>
    </ScrollView>
    </KeyboardAvoidingView>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { flexGrow: 1, justifyContent: "center", padding: 28, gap: 14 },
  contentTyping: { justifyContent: "flex-start", paddingTop: 20 },
  logo: { width: 230, height: 88, marginBottom: 4, alignSelf: "flex-start" },
  brand: { fontSize: 11, color: theme.colors.cyan, fontWeight: "900", letterSpacing: 2.2 },
  title: { fontSize: 30, color: theme.colors.text, fontWeight: "800" },
  description: { color: theme.colors.textSoft, marginBottom: 18, lineHeight: 21 },
  input: { minHeight: 52, paddingHorizontal: 15, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, color: theme.colors.text },
  error: { color: theme.colors.danger, lineHeight: 20 },
  button: { minHeight: 52, borderRadius: 14, marginTop: 6, overflow: "hidden" },
  buttonGradient: { minHeight: 52, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  buttonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  disabled: { opacity: 0.6 },
});
