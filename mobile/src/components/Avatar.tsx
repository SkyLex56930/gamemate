import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "../theme/theme";

export function Avatar({
  name,
  size = 48,
  url,
}: {
  name: string;
  size?: number;
  url?: string | null;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "GM";

  return (
    <LinearGradient colors={["#245483", "#765EFF", "#EC4DFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size * 0.34,
          overflow: "hidden",
        },
      ]}
    >
      <View style={styles.inner}>{url && failedUrl !== url ? (
        <Image source={{ uri: url }} style={styles.photo}
          accessibilityLabel={`Photo de ${name}`} onError={() => setFailedUrl(url)} />
      ) : <Text
        style={[
          styles.text,
          { fontSize: size * 0.32 },
        ]}
      >
        {initials}
      </Text>}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  photo: { width: "100%", height: "100%" },
  inner: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center", borderRadius: 999,
    overflow: "hidden", borderWidth: 2, borderColor: "rgba(3,8,23,0.88)" },
  avatar: {
    alignItems: "center",
    justifyContent: "center",

    padding: 2,
  },

  text: {
    color: theme.colors.text,
    fontWeight: "900",
  },
});
