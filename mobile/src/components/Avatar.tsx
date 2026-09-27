import { StyleSheet, Text, View } from "react-native";
import { theme } from "../theme/theme";

export function Avatar({
  name,
  size = 48,
}: {
  name: string;
  size?: number;
}) {
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
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          { fontSize: size * 0.32 },
        ]}
      >
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
