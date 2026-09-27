import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

import {
  DarkTheme,
  NavigationContainer,
} from "@react-navigation/native";

import {
  createBottomTabNavigator,
} from "@react-navigation/bottom-tabs";

import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HomeScreen } from "../screens/HomeScreen";
import { FriendsScreen } from "../screens/FriendsScreen";
import { MessagesScreen } from "../screens/MessagesScreen";
import { DiscoverScreen } from "../screens/DiscoverScreen";
import { ProfileScreen } from "../screens/ProfileScreen";

import { theme } from "../theme/theme";

type TabParamList = {
  Accueil: undefined;
  Amis: undefined;
  Messages: undefined;
  Mates: undefined;
  Profil: undefined;
};

const Tabs = createBottomTabNavigator<TabParamList>();

export function AppNavigator({
  session,
}: {
  session: Session;
}) {
  const insets = useSafeAreaInsets();

  function iconName(
    routeName: keyof TabParamList,
    focused: boolean
  ): keyof typeof Ionicons.glyphMap {
    switch (routeName) {
      case "Accueil":
        return focused ? "home" : "home-outline";

      case "Amis":
        return focused ? "people" : "people-outline";

      case "Messages":
        return focused
          ? "chatbubbles"
          : "chatbubbles-outline";

      case "Mates":
        return focused ? "search" : "search-outline";

      case "Profil":
        return focused
          ? "person-circle"
          : "person-circle-outline";

      default:
        return "ellipse-outline";
    }
  }

  return (
    <NavigationContainer
      theme={{
        ...DarkTheme,

        colors: {
          ...DarkTheme.colors,

          primary: theme.colors.primary,

          background:
            theme.colors.background,

          card:
            theme.colors.surface,

          text:
            theme.colors.text,

          border:
            theme.colors.border,

          notification:
            theme.colors.danger,
        },
      }}
    >
      <Tabs.Navigator
        initialRouteName="Accueil"

        screenOptions={({ route }) => ({
          headerShown: false,

          sceneStyle: {
            backgroundColor:
              theme.colors.background,
          },

          tabBarHideOnKeyboard: true,

          tabBarActiveTintColor:
            "#FFFFFF",

          tabBarInactiveTintColor:
            theme.colors.textMuted,

          tabBarStyle: {
            position: "absolute",

            left: 16,
            right: 16,

            bottom:
              Math.max(
                insets.bottom,
                10
              ),

            height: 64,

            paddingTop: 7,
            paddingBottom: 7,

            borderTopWidth: 0,

            borderRadius: 22,

            backgroundColor:
              theme.colors.surface,

            elevation: 16,

            shadowColor: "#000000",
            shadowOpacity: 0.28,
            shadowRadius: 14,

            shadowOffset: {
              width: 0,
              height: 6,
            },
          },

          tabBarItemStyle: {
            borderRadius: 17,
            marginHorizontal: 3,
          },

          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: "800",
          },

          tabBarIcon: ({
            focused,
            color,
          }) => {
            const icon =
              iconName(
                route.name,
                focused
              );

            return (
              <Ionicons
                name={icon}
                size={22}
                color={color}
              />
            );
          },

          tabBarBackground: () => null,
        })}
      >
        <Tabs.Screen
          name="Accueil"
          options={{
            tabBarLabel: "Accueil",
          }}
        >
          {() => (
            <HomeScreen
              session={session}
            />
          )}
        </Tabs.Screen>

        <Tabs.Screen
          name="Amis"
          options={{
            tabBarLabel: "Amis",
          }}
        >
          {() => (
            <FriendsScreen
              session={session}
            />
          )}
        </Tabs.Screen>

        <Tabs.Screen
          name="Messages"
          options={{
            tabBarLabel: "Messages",

            tabBarBadgeStyle: {
              backgroundColor:
                theme.colors.primary,

              color: "#FFFFFF",

              fontSize: 9,

              fontWeight: "900",
            },
          }}
        >
          {() => (
            <MessagesScreen
              session={session}
            />
          )}
        </Tabs.Screen>

        <Tabs.Screen name="Mates">
  {() => (
    <DiscoverScreen
      session={session}
      onMessage={async (userId) => {
        const { data, error } = await supabase.rpc(
          "get_or_create_conversation",
          {
            p_other_user_id: userId,
          }
        );

        if (!error && data) {
          // prochaine étape :
          // navigation directe vers Chat
        }
      }}
    />
  )}
</Tabs.Screen>

        <Tabs.Screen
          name="Profil"
          options={{
            tabBarLabel: "Profil",
          }}
        >
          {() => (
            <ProfileScreen
              session={session}
            />
          )}
        </Tabs.Screen>
      </Tabs.Navigator>
    </NavigationContainer>
  );
}