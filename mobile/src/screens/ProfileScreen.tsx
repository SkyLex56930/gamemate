import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../lib/supabase";
import { theme } from "../theme/theme";

export function ProfileScreen({ session }: { session: Session }) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [region, setRegion] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void supabase
      .from("profiles")
      .select("display_name,username,bio,region")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        if (!data) return;

        setDisplayName(data.display_name ?? "");
        setUsername(data.username ?? "");
        setBio(data.bio ?? "");
        setRegion(data.region ?? "");
      });
  }, [session.user.id]);

  async function save() {
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        region: region.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);

    setNotice(error ? "Erreur pendant l'enregistrement." : "Profil mis à jour.");
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.banner} />

      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {(displayName || username || "G").slice(0, 1).toUpperCase()}
        </Text>
      </View>

      <Text style={styles.name}>{displayName || username || "Joueur"}</Text>
      <Text style={styles.handle}>@{username || "joueur"}</Text>

      <View style={styles.card}>
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

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <Pressable style={styles.button} onPress={() => void save()}>
          <Ionicons name="save-outline" size={18} color="#FFF" />
          <Text style={styles.buttonText}>Enregistrer</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingBottom: 120,
    backgroundColor: theme.colors.background,
  },
  banner: {
    height: 160,
    backgroundColor: "#101A35",
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#172744",
    marginTop: -42,
    marginLeft: 20,
    borderWidth: 4,
    borderColor: theme.colors.background,
  },
  avatarText: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: "900",
  },
  name: {
    color: theme.colors.text,
    fontSize: 25,
    fontWeight: "900",
    marginHorizontal: 20,
    marginTop: 12,
  },
  handle: {
    color: theme.colors.textSoft,
    marginHorizontal: 20,
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
});
