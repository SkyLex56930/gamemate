import "react-native-gesture-handler";

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";

import type { Session } from "@supabase/supabase-js";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { NavigationBar } from "expo-navigation-bar";

import { supabase } from "./src/lib/supabase";
import { startMobilePresence, stopMobilePresence } from "./src/lib/presence";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { MobilePreferencesProvider } from "./src/lib/mobilePreferences";
import { LoginScreen } from "./src/screens/LoginScreen";
import { theme } from "./src/theme/theme";
import { DirectCallsProvider } from "./src/lib/directCalls";

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
    if (AppState.currentState === "active") supabase.auth.startAutoRefresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => {
      subscription.remove();
      supabase.auth.stopAutoRefresh();
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
        hidden={Platform.OS === "android"}
      />
      {Platform.OS === "android" && <NavigationBar hidden />}
      <MobilePreferencesProvider>
        <SafeAreaView style={styles.root} edges={["top"]}>
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" />
            </View>
          ) : session ? (
            <DirectCallsProvider session={session}>
              <AppNavigator session={session} />
            </DirectCallsProvider>
          ) : (
            <SafeAreaView style={styles.root} edges={["bottom"]}>
              <LoginScreen />
            </SafeAreaView>
          )}
        </SafeAreaView>
      </MobilePreferencesProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
  },
});
