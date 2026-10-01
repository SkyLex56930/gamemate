import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";
import type { Session } from "@supabase/supabase-js";
import {
  DarkTheme, getFocusedRouteNameFromRoute, NavigationContainer, useNavigationContainerRef,
  type NavigatorScreenParams,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HomeScreen } from "../screens/HomeScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { MessagesScreen } from "../screens/MessagesScreen";
import { ChatScreen } from "../screens/ChatScreen";
import { DiscoverScreen } from "../screens/DiscoverScreen";
import { SquadsScreen } from "../screens/SquadsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { ProfileSettingsScreen } from "../screens/ProfileSettingsScreen";
import { AppSettingsScreen } from "../screens/AppSettingsScreen";
import { ShopScreen } from "../screens/ShopScreen";
import { supabase } from "../lib/supabase";
import type { ChatProfile, Conversation, ConversationItem } from "../lib/messages";
import { theme } from "../theme/theme";
import { accentPalettes, useMobilePreferences } from "../lib/mobilePreferences";
import { useMobilePush, type PushStatus } from "../lib/mobilePush";
import { useSessionReminders } from "../lib/sessionReminders";
import { LinearGradient } from "expo-linear-gradient";

type HomeStackParamList = { TableauDeBord: undefined; Notifications: undefined };

export type MessagesStackParamList = {
  Conversations: undefined;
  Chat: { conversationId: string; profile: ChatProfile };
};

export type ProfileStackParamList = {
  ApercuProfil: undefined;
  Parametres: undefined;
  ParametresApplication: undefined;
  Boutique: undefined;
};

type TabParamList = {
  Accueil: NavigatorScreenParams<HomeStackParamList>;
  Messages: NavigatorScreenParams<MessagesStackParamList>;
  Reseau: undefined;
  Squads: { tab?: "planning"; requestId?: number } | undefined;
  Profil: NavigatorScreenParams<ProfileStackParamList>;
};

const Tabs = createBottomTabNavigator<TabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const Stack = createNativeStackNavigator<MessagesStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

function MessagesStackView({ session, onUnreadChange }: {
  session: Session;
  onUnreadChange: (count: number) => void;
}) {
  return <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Conversations">
      {(props) => <MessagesScreen {...props} session={session} onUnreadChange={onUnreadChange} />}
    </Stack.Screen>
    <Stack.Screen name="Chat">
      {(props) => <ChatScreen {...props} session={session} />}
    </Stack.Screen>
  </Stack.Navigator>;
}

function HomeStackView({ session, onNavigate, onOpenConversation, onUnreadChange }: {
  session: Session;
  onNavigate: (tab: "Messages" | "Reseau" | "Squads" | "Profil" | "Boutique") => void;
  onOpenConversation: (item: ConversationItem) => void;
  onUnreadChange: (count: number) => void;
}) {
  return <HomeStack.Navigator screenOptions={{ headerShown: false }}>
    <HomeStack.Screen name="TableauDeBord">
      {({ navigation }) => <HomeScreen session={session} onNavigate={onNavigate}
        onOpenConversation={onOpenConversation} onUnreadChange={onUnreadChange}
        onNotifications={() => navigation.navigate("Notifications")} />}
    </HomeStack.Screen>
    <HomeStack.Screen name="Notifications">
      {({ navigation }) => <NotificationsScreen session={session} onBack={() => navigation.goBack()} />}
    </HomeStack.Screen>
  </HomeStack.Navigator>;
}

function ProfileStackView({ session, pushStatus, retryPush }: {
  session: Session; pushStatus: PushStatus; retryPush: () => void;
}) {
  return <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
    <ProfileStack.Screen name="ApercuProfil">
      {({ navigation }) => <ProfileScreen session={session}
        onSettings={() => navigation.navigate("Parametres")}
        onAppSettings={() => navigation.navigate("ParametresApplication")}
        onShop={() => navigation.navigate("Boutique")} />}
    </ProfileStack.Screen>
    <ProfileStack.Screen name="Parametres">
      {({ navigation }) => <ProfileSettingsScreen session={session} onBack={() => navigation.goBack()} />}
    </ProfileStack.Screen>
    <ProfileStack.Screen name="ParametresApplication">
      {({ navigation }) => <AppSettingsScreen onBack={() => navigation.goBack()}
        pushStatus={pushStatus} retryPush={retryPush} />}
    </ProfileStack.Screen>
    <ProfileStack.Screen name="Boutique">
      {({ navigation }) => <ShopScreen session={session} onBack={() => navigation.goBack()} />}
    </ProfileStack.Screen>
  </ProfileStack.Navigator>;
}

function iconName(name: keyof TabParamList, focused: boolean): keyof typeof Ionicons.glyphMap {
  switch (name) {
    case "Accueil": return focused ? "home" : "home-outline";
    case "Messages": return focused ? "chatbubbles" : "chatbubbles-outline";
    case "Reseau": return focused ? "planet" : "planet-outline";
    case "Squads": return focused ? "shield" : "shield-outline";
    case "Profil": return focused ? "person-circle" : "person-circle-outline";
  }
}

export function AppNavigator({ session }: { session: Session }) {
  const { preferences } = useMobilePreferences();
  const accent = accentPalettes[preferences.accent].primary;
  const insets = useSafeAreaInsets();
  const navigation = useNavigationContainerRef<TabParamList>();
  const [unread, setUnread] = useState(0);
  const onUnreadChange = useCallback((count: number) => setUnread(count), []);
  const pendingPush = useRef<Record<string, unknown> | null>(null);
  const reminderRequest = useRef(0);

  const openPush = useCallback(async (data: Record<string, unknown>) => {
    if (!navigation.isReady()) { pendingPush.current = data; return; }
    if (data.kind === "squad_session_reminder") {
      reminderRequest.current += 1;
      navigation.navigate("Squads", { tab: "planning", requestId: reminderRequest.current });
      return;
    }
    if (data.kind === "friend_request" || data.kind === "squad_invite") {
      navigation.navigate("Accueil", { screen: "Notifications" });
      return;
    }
    if (data.kind !== "message" || typeof data.conversationId !== "string"
      || typeof data.senderId !== "string") return;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(data.conversationId) || !uuid.test(data.senderId)) return;

    const [conversation, profile] = await Promise.all([
      supabase.from("conversations").select("id").eq("id", data.conversationId).single(),
      supabase.from("profiles").select("id,username,display_name,avatar_url")
        .eq("id", data.senderId).single(),
    ]);
    if (conversation.error || profile.error || !conversation.data || !profile.data) return;
    navigation.navigate("Messages", { screen: "Chat", params: {
      conversationId: conversation.data.id, profile: profile.data as ChatProfile,
    } });
  }, [navigation]);

  const push = useMobilePush(session, openPush);
  useSessionReminders(session.user.id, push.status);

  async function openMessage(userId: string) {
    try {
      const { data: conversation, error } = await supabase.rpc("get_or_create_conversation", {
        p_other_user_id: userId,
      });
      if (error || !conversation) throw error ?? new Error("Conversation introuvable");
      const { data: profile, error: profileError } = await supabase.from("profiles")
        .select("id,username,display_name,avatar_url").eq("id", userId).single();
      if (profileError || !profile) throw profileError ?? new Error("Profil introuvable");
      navigation.navigate("Messages", {
        screen: "Chat",
        params: { conversationId: (conversation as Conversation).id, profile: profile as ChatProfile },
      });
    } catch (error) {
      console.error("Messages / open:", error);
      Alert.alert("Messages", "Impossible d'ouvrir cette conversation.");
    }
  }

  function openConversation(item: ConversationItem) {
    navigation.navigate("Messages", {
      screen: "Chat",
      params: { conversationId: item.conversation.id, profile: item.profile },
    });
  }

  function goToTab(tab: "Messages" | "Reseau" | "Squads" | "Profil" | "Boutique") {
    if (tab === "Messages") navigation.navigate("Messages", { screen: "Conversations" });
    else if (tab === "Reseau") navigation.navigate("Reseau");
    else if (tab === "Squads") navigation.navigate("Squads", undefined);
    else navigation.navigate("Profil", { screen: tab === "Boutique" ? "Boutique" : "ApercuProfil" });
  }

  return <NavigationContainer ref={navigation} onReady={() => {
    if (pendingPush.current) {
      const data = pendingPush.current;
      pendingPush.current = null;
      void openPush(data);
    }
  }} theme={{
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: accent, background: theme.colors.background,
      card: theme.colors.surface, text: theme.colors.text,
      border: theme.colors.border, notification: theme.colors.danger,
    },
  }}>
    <Tabs.Navigator initialRouteName="Accueil" screenOptions={({ route }) => ({
      headerShown: false,
      sceneStyle: { backgroundColor: theme.colors.background },
      tabBarHideOnKeyboard: true,
      tabBarActiveTintColor: "#FFFFFF",
      tabBarInactiveTintColor: "#7187A8",
      tabBarActiveBackgroundColor: "rgba(118,94,255,0.16)",
      tabBarStyle: (route.name === "Messages" && getFocusedRouteNameFromRoute(route) === "Chat")
        ? { display: "none" }
        : {
          position: "absolute", left: 16, right: 16, bottom: Math.max(insets.bottom, 16),
          height: 68, paddingTop: 7, paddingBottom: 7, borderTopWidth: 0,
          borderRadius: 24, backgroundColor: "transparent", borderWidth: 1,
          borderColor: "rgba(80, 202, 255, 0.25)", overflow: "hidden",
          elevation: 20, shadowColor: "#765EFF", shadowOpacity: 0.24,
          shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
        },
      tabBarBackground: () => <LinearGradient colors={["rgba(7,22,43,0.98)", "rgba(14,20,55,0.98)"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />,
      tabBarItemStyle: { borderRadius: 18, margin: 3 },
      tabBarLabelStyle: { fontSize: 9, fontWeight: "800" },
      tabBarIcon: ({ focused, color }) => <Ionicons name={iconName(route.name, focused)} size={22} color={color} />,
    })}>
      <Tabs.Screen name="Accueil">
        {() => <HomeStackView session={session} onNavigate={goToTab}
          onOpenConversation={openConversation} onUnreadChange={onUnreadChange} />}
      </Tabs.Screen>
      <Tabs.Screen name="Messages" options={{ tabBarBadge: preferences.messageBadges && unread > 0 ? unread : undefined,
      tabBarBadgeStyle: { backgroundColor: accent, color: "#FFFFFF", fontSize: 9, fontWeight: "900" } }}>
        {() => <MessagesStackView session={session} onUnreadChange={onUnreadChange} />}
      </Tabs.Screen>
      <Tabs.Screen name="Reseau" options={{ title: "Réseau" }}>
        {() => <DiscoverScreen session={session} onMessage={(userId) => { void openMessage(userId); }}
          onOpenSquads={() => navigation.navigate("Squads")}
          onOpenSettings={() => navigation.navigate("Profil", { screen: "Parametres" })}
          onOpenFriends={() => navigation.navigate("Reseau")} />}
      </Tabs.Screen>
      <Tabs.Screen name="Squads">
        {({ route }) => <SquadsScreen session={session} openTab={route.params?.tab} reminderRequestId={route.params?.requestId} />}
      </Tabs.Screen>
      <Tabs.Screen name="Profil">
        {() => <ProfileStackView session={session} pushStatus={push.status} retryPush={push.retry} />}
      </Tabs.Screen>
    </Tabs.Navigator>
  </NavigationContainer>;
}
