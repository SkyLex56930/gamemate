import "react-native-gesture-handler";

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";

import type { Session } from "@supabase/supabase-js";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { supabase } from "./src/lib/supabase";
import { startMobilePresence, stopMobilePresence } from "./src/lib/presence";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { theme } from "./src/theme/theme";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;

      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
      }
    );

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user.id) {
      stopMobilePresence();
      return;
    }

    void startMobilePresence();

    return () => {
      stopMobilePresence();
    };
  }, [session?.user.id]);

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="light-content"
        backgroundColor={theme.colors.background}
      />

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" />
        </View>
      ) : session ? (
        <AppNavigator session={session} />
      ) : (
        <View style={styles.loading} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
  },
});
