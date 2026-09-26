import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { useColors } from '@/hooks/useColors';
import type { LocalScoreEntry, ScoreMode } from '@/game/economy';

type Palette = ReturnType<typeof useColors>;

type LeaderboardScreenProps = {
  colors: Palette;
  entries: LocalScoreEntry[];
  storageAvailable: boolean;
  onBack: () => void;
};

function formatDate(utcDate: string): string {
  const date = new Date(`${utcDate}T12:00:00Z`);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function LeaderboardScreen({
  colors,
  entries,
  storageAvailable,
  onBack,
}: LeaderboardScreenProps) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<ScoreMode>('classic');
  const styles = makeStyles(colors);
  const scores = entries
    .filter((entry) => entry.mode === mode)
    .sort((a, b) => b.score - a.score || b.playedAt - a.playedAt)
    .slice(0, 10);

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 10) },
      ]}
    >
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to home"
            onPress={onBack}
            hitSlop={12}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.pressed,
            ]}
          >
            <Feather name="arrow-left" size={19} color={colors.foreground} />
          </Pressable>
          <Text style={styles.headerTitle}>LEADERBOARD</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>YOUR BEST RUNS</Text>
          <Text style={styles.title}>Top scores.</Text>
          <Text style={styles.subtitle}>
            Your rankings are saved on this device.
          </Text>
        </View>

        <View
          accessibilityRole="tablist"
          style={styles.tabs}
        >
          {(['classic', 'daily'] as const).map((tab) => {
            const selected = mode === tab;
            return (
              <Pressable
                key={tab}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setMode(tab)}
                testID={`leaderboard-${tab}-tab`}
                style={({ pressed }) => [
                  styles.tab,
                  selected && styles.tabSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    selected && styles.tabLabelSelected,
                  ]}
                >
                  {tab === 'classic' ? 'CLASSIC' : 'DAILY'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {scores.length > 0 ? (
          <View style={styles.scoreList}>
            {scores.map((entry, index) => (
              <View key={entry.id} style={styles.scoreRow}>
                <View
                  style={[
                    styles.rankBadge,
                    index === 0 && styles.rankBadgeFirst,
                  ]}
                >
                  {index === 0 ? (
                    <Feather name="award" size={16} color={colors.accent} />
                  ) : (
                    <Text style={styles.rankText}>
                      {String(index + 1).padStart(2, '0')}
                    </Text>
                  )}
                </View>
                <View style={styles.scoreCopy}>
                  <Text style={styles.scoreDate}>{formatDate(entry.utcDate)}</Text>
                  <Text style={styles.scoreMode}>
                    {mode === 'daily' ? 'DAILY CHALLENGE' : 'CLASSIC RUN'}
                  </Text>
                </View>
                <Text style={styles.scoreValue}>{entry.score}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Feather name="award" size={21} color={colors.accent} />
            </View>
            <Text style={styles.emptyTitle}>No scores yet</Text>
            <Text style={styles.emptyCopy}>
              Finish a {mode === 'daily' ? 'Daily Challenge' : 'Classic run'} to
              put your first score here.
            </Text>
          </View>
        )}

        <View style={styles.privacyNote}>
          <Feather
            name={storageAvailable ? 'smartphone' : 'alert-circle'}
            size={14}
            color={storageAvailable ? colors.mutedForeground : colors.destructive}
          />
          <Text
            style={[
              styles.privacyText,
              !storageAvailable && styles.storageUnavailable,
            ]}
          >
            {storageAvailable
              ? 'Top 10 scores per mode · stored locally'
              : 'Local score storage is unavailable on this device'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 20,
    },
    content: {
      flexGrow: 1,
    },
    header: {
      minHeight: 50,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerTitle: {
      color: colors.foreground,
      fontSize: 11,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1.5,
    },
    headerSpacer: {
      width: 40,
    },
    hero: {
      marginTop: 40,
      marginBottom: 25,
    },
    eyebrow: {
      color: colors.accent,
      fontSize: 9,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1.4,
      marginBottom: 8,
    },
    title: {
      color: colors.foreground,
      fontSize: 36,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -1.6,
    },
    subtitle: {
      color: colors.mutedForeground,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 8,
    },
    tabs: {
      flexDirection: 'row',
      gap: 8,
      padding: 4,
      backgroundColor: colors.card,
      borderRadius: 15,
      marginBottom: 16,
    },
    tab: {
      flex: 1,
      minHeight: 39,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 11,
    },
    tabSelected: {
      backgroundColor: colors.primary,
    },
    tabLabel: {
      color: colors.mutedForeground,
      fontSize: 10,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1,
    },
    tabLabelSelected: {
      color: colors.primaryForeground,
    },
    scoreList: {
      gap: 9,
    },
    scoreRow: {
      minHeight: 70,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 13,
      paddingVertical: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 17,
    },
    rankBadge: {
      width: 39,
      height: 39,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 13,
      backgroundColor: colors.secondary,
      marginRight: 12,
    },
    rankBadgeFirst: {
      backgroundColor: colors.primary,
    },
    rankText: {
      color: colors.foreground,
      fontSize: 12,
      fontFamily: 'Inter_700Bold',
    },
    scoreCopy: {
      flex: 1,
      gap: 5,
    },
    scoreDate: {
      color: colors.foreground,
      fontSize: 12,
      fontFamily: 'Inter_700Bold',
    },
    scoreMode: {
      color: colors.mutedForeground,
      fontSize: 8,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1,
    },
    scoreValue: {
      color: colors.accent,
      fontSize: 25,
      fontFamily: 'Inter_700Bold',
      minWidth: 34,
      textAlign: 'right',
    },
    emptyCard: {
      alignItems: 'center',
      paddingHorizontal: 26,
      paddingVertical: 31,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 19,
    },
    emptyIcon: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.secondary,
      borderRadius: 16,
      marginBottom: 15,
    },
    emptyTitle: {
      color: colors.foreground,
      fontSize: 15,
      fontFamily: 'Inter_700Bold',
    },
    emptyCopy: {
      color: colors.mutedForeground,
      fontSize: 11,
      lineHeight: 17,
      textAlign: 'center',
      marginTop: 7,
    },
    privacyNote: {
      minHeight: 44,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      marginTop: 19,
    },
    privacyText: {
      color: colors.mutedForeground,
      fontSize: 10,
    },
    storageUnavailable: {
      color: colors.destructive,
    },
    pressed: {
      opacity: 0.68,
    },
  });
}