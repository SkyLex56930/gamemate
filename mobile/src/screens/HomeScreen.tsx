import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { Session } from "@supabase/supabase-js";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../lib/supabase";
import { theme } from "../theme/theme";
import { Avatar } from "../components/Avatar";

type ShortcutProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress?: () => void;
};

export function HomeScreen({
  session,
}: {
  session: Session;
}) {
  const [name, setName] = useState("Joueur");

  useEffect(() => {
    void supabase
      .from("profiles")
      .select("display_name,username")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setName(
            data.display_name ||
              data.username ||
              "Joueur"
          );
        }
      });
  }, [session.user.id]);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>G</Text>
            </View>

            <Text style={styles.brand}>
              GameMate
            </Text>
          </View>

          <Pressable style={styles.headerAction}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={22}
              color={theme.colors.text}
            />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={
            styles.shortcuts
          }
        >
          <Shortcut
            icon="chatbubble"
            label="Messages"
            active
          />

          <Shortcut
            icon="people"
            label="Amis"
          />

          <Shortcut
            icon="shield-outline"
            label="Squads"
          />

          <Shortcut
            icon="search"
            label="Mates"
          />

          <Shortcut
            icon="call"
            label="Appels"
          />
        </ScrollView>

        <View style={styles.welcome}>
          <Text style={styles.welcomeSmall}>
            Bonjour
          </Text>

          <Text style={styles.welcomeName}>
            {name}
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Discussions récentes
          </Text>

          <Pressable>
            <Text style={styles.seeAll}>
              Voir tout
            </Text>
          </Pressable>
        </View>

        <Conversation
          name="GameMate"
          preview="Bienvenue sur ton application mobile."
          time="Maintenant"
          online
          unread={1}
        />

        <Conversation
          name="Tes amis"
          preview="Tes discussions apparaîtront ici."
          time=""
        />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Activité
          </Text>
        </View>

        <View style={styles.activityCard}>
          <View style={styles.activityIcon}>
            <Ionicons
              name="people-outline"
              size={21}
              color={theme.colors.primarySoft}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.activityTitle}>
              Retrouve tes mates
            </Text>

            <Text style={styles.activityText}>
              Vois qui est en ligne et démarre
              une discussion depuis ton mobile.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Shortcut({
  icon,
  label,
  active,
  onPress,
}: ShortcutProps) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.shortcutWrap}
    >
      <View
        style={[
          styles.shortcut,
          active && styles.shortcutActive,
        ]}
      >
        <Ionicons
          name={icon}
          size={25}
          color={
            active
              ? "#FFFFFF"
              : theme.colors.text
          }
        />
      </View>

      <Text
        style={[
          styles.shortcutLabel,
          active && styles.shortcutLabelActive,
        ]}
      >
        {label}
      </Text>

      {active ? (
        <View style={styles.shortcutIndicator} />
      ) : null}
    </Pressable>
  );
}

function Conversation({
  name,
  preview,
  time,
  online = false,
  unread = 0,
}: {
  name: string;
  preview: string;
  time: string;
  online?: boolean;
  unread?: number;
}) {
  return (
    <View style={styles.conversation}>
      <View>
        <Avatar name={name} size={48} />

        <View
          style={[
            styles.presence,
            {
              backgroundColor: online
                ? theme.colors.success
                : theme.colors.textMuted,
            },
          ]}
        />
      </View>

      <View style={styles.conversationMain}>
        <View style={styles.conversationTop}>
          <Text style={styles.conversationName}>
            {name}
          </Text>

          <Text style={styles.time}>
            {time}
          </Text>
        </View>

        <View style={styles.conversationBottom}>
          <Text
            numberOfLines={1}
            style={styles.preview}
          >
            {preview}
          </Text>

          {unread > 0 ? (
            <View style={styles.unread}>
              <Text style={styles.unreadText}>
                {unread}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  page: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 110,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  logo: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },

  logoText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 19,
  },

  brand: {
    color: theme.colors.text,
    fontWeight: "900",
    fontSize: 24,
  },

  headerAction: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  shortcuts: {
    gap: 14,
    paddingVertical: 22,
  },

  shortcutWrap: {
    alignItems: "center",
    width: 61,
  },

  shortcut: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },

  shortcutActive: {
    backgroundColor: theme.colors.primary,
  },

  shortcutLabel: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 6,
  },

  shortcutLabelActive: {
    color: theme.colors.text,
  },

  shortcutIndicator: {
    width: 28,
    height: 3,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
    marginTop: 5,
  },

  welcome: {
    marginBottom: 18,
  },

  welcomeSmall: {
    color: theme.colors.textSoft,
    fontSize: 13,
  },

  welcomeName: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: "900",
    marginTop: 2,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 9,
  },

  sectionTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "900",
  },

  seeAll: {
    color: theme.colors.primarySoft,
    fontSize: 12,
    fontWeight: "800",
  },

  conversation: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    gap: 12,
  },

  presence: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: theme.colors.background,
  },

  conversationMain: {
    flex: 1,
  },

  conversationTop: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  conversationName: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "900",
  },

  time: {
    color: theme.colors.textMuted,
    fontSize: 10,
  },

  conversationBottom: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },

  preview: {
    flex: 1,
    color: theme.colors.textSoft,
    fontSize: 12,
  },

  unread: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.textMuted,
  },

  unreadText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },

  activityCard: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderRadius: 15,
    backgroundColor: theme.colors.surface,
  },

  activityIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceSoft,
  },

  activityTitle: {
    color: theme.colors.text,
    fontWeight: "900",
    fontSize: 14,
  },

  activityText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
});
