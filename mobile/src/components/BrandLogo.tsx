import { Image, StyleSheet, type ImageStyle, type StyleProp } from "react-native";

type Props = {
  variant?: "full" | "mark";
  style?: StyleProp<ImageStyle>;
};

export function BrandLogo({ variant = "full", style }: Props) {
  const source = variant === "mark"
    ? require("../../assets/gamemate-mark-transparent.png")
    : require("../../assets/gamemate-logo-transparent.png");

  return <Image source={source} resizeMode="contain" style={[styles.logo, style]} accessibilityLabel="GameMate" />;
}

const styles = StyleSheet.create({
  logo: { width: 210, height: 80 },
});
