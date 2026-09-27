import { Ionicons } from "@expo/vector-icons";

export type GameMateIconName =
  keyof typeof Ionicons.glyphMap;

export function GameMateIcon({
  name,
  size = 22,
  color = "#F5F7FB",
}: {
  name: GameMateIconName;
  size?: number;
  color?: string;
}) {
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
    />
  );
}
