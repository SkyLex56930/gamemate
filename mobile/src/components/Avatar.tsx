import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
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
    <View
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
      {url && failedUrl !== url ? (
        <Image source={{ uri: url }} style={styles.photo}
          accessibilityLabel={`Photo de ${name}`} onError={() => setFailedUrl(url)} />
      ) : <Text
        style={[
          styles.text,
          { fontSize: size * 0.32 },
        ]}
      >
        {initials}
      </Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: "100%", height: "100%" },
  avatar: {
    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "#172744",

    borderWidth: 1,
    borderColor: "#29476D",
  },

  text: {
    color: theme.colors.text,
    fontWeight: "900",
  },
});
