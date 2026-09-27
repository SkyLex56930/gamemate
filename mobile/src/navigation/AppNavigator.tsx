import { useCallback, useState } from "react";
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
import { FriendsScreen } from "../screens/FriendsScreen";
import { MessagesScreen } from "../screens/MessagesScreen";
import { ChatScreen } from "../screens/ChatScreen";
import { DiscoverScreen } from "../screens/DiscoverScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { supabase } from "../lib/supabase";
import type { ChatProfile, Conversation, ConversationItem } from "../lib/messages";
import { theme } from "../theme/theme";

export type MessagesStackParamList = {
  Conversations: undefined;
  Chat: { conversationId: string; profile: ChatProfile };
};

type TabParamList = {
  Accueil: undefined;
  Amis: undefined;
  Messages: NavigatorScreenParams<MessagesStackParamList>;
  Mates: undefined;
  Profil: undefined;
};

const Tabs = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<MessagesStackParamList>();

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

function iconName(name: keyof TabParamList, focused: boolean): keyof typeof Ionicons.glyphMap {
  switch (name) {
    case "Accueil": return focused ? "home" : "home-outline";
    case "Amis": return focused ? "people" : "people-outline";
    case "Messages": return focused ? "chatbubbles" : "chatbubbles-outline";
    case "Mates": return focused ? "search" : "search-outline";
    case "Profil": return focused ? "person-circle" : "person-circle-outline";
  }
}

export function AppNavigator({ session }: { session: Session }) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigationContainerRef<TabParamList>();
  const [unread, setUnread] = useState(0);
  const onUnreadChange = useCallback((count: number) => setUnread(count), []);

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

  function goToTab(tab: "Messages" | "Amis" | "Mates" | "Profil") {
    if (tab === "Messages") navigation.navigate("Messages", { screen: "Conversations" });
    else if (tab === "Amis") navigation.navigate("Amis");
    else if (tab === "Mates") navigation.navigate("Mates");
    else navigation.navigate("Profil");
  }

  return <NavigationContainer ref={navigation} theme={{
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: theme.colors.primary, background: theme.colors.background,
      card: theme.colors.surface, text: theme.colors.text,
      border: theme.colors.border, notification: theme.colors.danger,
    },
  }}>
    <Tabs.Navigator initialRouteName="Accueil" screenOptions={({ route }) => ({
      headerShown: false,
      sceneStyle: { backgroundColor: theme.colors.background },
      tabBarHideOnKeyboard: true,
      tabBarActiveTintColor: "#FFFFFF",
      tabBarInactiveTintColor: theme.colors.textMuted,
      tabBarStyle: getFocusedRouteNameFromRoute(route) === "Chat"
        ? { display: "none" }
        : {
          position: "absolute", left: 16, right: 16, bottom: Math.max(insets.bottom, 10),
          height: 64, paddingTop: 7, paddingBottom: 7, borderTopWidth: 0,
          borderRadius: 22, backgroundColor: theme.colors.surface,
          elevation: 16, shadowColor: "#000000", shadowOpacity: 0.28,
          shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
        },
      tabBarItemStyle: { borderRadius: 17, marginHorizontal: 3 },
      tabBarLabelStyle: { fontSize: 10, fontWeight: "800" },
      tabBarIcon: ({ focused, color }) => <Ionicons name={iconName(route.name, focused)} size={22} color={color} />,
    })}>
      <Tabs.Screen name="Accueil">
        {() => <HomeScreen session={session} onNavigate={goToTab}
          onOpenConversation={openConversation} onUnreadChange={onUnreadChange} />}
      </Tabs.Screen>
      <Tabs.Screen name="Amis">
        {() => <FriendsScreen session={session} onMessage={(userId) => { void openMessage(userId); }} />}
      </Tabs.Screen>
      <Tabs.Screen name="Messages" options={{ tabBarBadge: unread > 0 ? unread : undefined,
        tabBarBadgeStyle: { backgroundColor: theme.colors.primary, color: "#FFFFFF", fontSize: 9, fontWeight: "900" } }}>
        {() => <MessagesStackView session={session} onUnreadChange={onUnreadChange} />}
      </Tabs.Screen>
      <Tabs.Screen name="Mates">
        {() => <DiscoverScreen session={session} onMessage={(userId) => { void openMessage(userId); }} />}
      </Tabs.Screen>
      <Tabs.Screen name="Profil">
        {() => <ProfileScreen session={session} />}
      </Tabs.Screen>
    </Tabs.Navigator>
  </NavigationContainer>;
}
