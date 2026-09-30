import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Platform, View } from "react-native";

/** The extra inset is only needed on devices where the keyboard overlays the app. */
export function useAndroidKeyboardOverlap() {
  const root = useRef<View>(null);
  const keyboardTop = useRef<number | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);

  const measureKeyboardOverlap = useCallback(() => {
    if (Platform.OS !== "android" || keyboardTop.current === null) return;
    root.current?.measureInWindow((_x, y, _width, height) => {
      if (keyboardTop.current === null) return;
      const measuredTop = Keyboard.metrics()?.screenY;
      const top = measuredTop == null ? keyboardTop.current : Math.min(keyboardTop.current, measuredTop);
      const overlap = Math.max(0, Math.ceil(y + height - top));
      setKeyboardInset(overlap > 0 ? overlap + 8 : 0);
    });
  }, []);

  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardVisible(true);
      if (Platform.OS !== "android") return;
      keyboardTop.current = event.endCoordinates.screenY;
      requestAnimationFrame(measureKeyboardOverlap);
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => {
      keyboardTop.current = null;
      setKeyboardInset(0);
      setKeyboardVisible(false);
    });
    return () => { shown.remove(); hidden.remove(); };
  }, [measureKeyboardOverlap]);

  return { root, keyboardVisible, keyboardInset, measureKeyboardOverlap };
}
