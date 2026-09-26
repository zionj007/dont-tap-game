import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { useColors } from '@/hooks/useColors';
import type { CosmeticTheme } from '@/game/economy';

type Palette = ReturnType<typeof useColors>;

type ShopScreenProps = {
  colors: Palette;
  coins: number;
  themes: CosmeticTheme[];
  unlockedThemeIds: string[];
  equippedThemeId: string;
  storageAvailable: boolean;
  onBack: () => void;
  onUnlock: (theme: CosmeticTheme) => void;
  onEquip: (theme: CosmeticTheme) => void;
};

export default function ShopScreen({
  colors,
  coins,
  themes,
  unlockedThemeIds,
  equippedThemeId,
  storageAvailable,
  onBack,
  onUnlock,
  onEquip,
}: ShopScreenProps) {
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
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
          <Text style={styles.headerTitle}>SHOP</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>MAKE IT YOURS</Text>
          <Text style={styles.title}>Pick a look.</Text>
          <Text style={styles.subtitle}>
            Earn coins by playing and spend them on color themes.
          </Text>
        </View>

        <View style={styles.wallet}>
          <View style={styles.coinIcon}>
            <Feather name="circle" size={18} color={colors.accent} />
          </View>
          <View style={styles.walletCopy}>
            <Text style={styles.walletLabel}>YOUR COINS</Text>
            <Text style={styles.walletHint}>+1 for every point scored</Text>
          </View>
          <Text style={styles.coinValue}>{coins}</Text>
        </View>

        <View style={styles.themeList}>
          {themes.map((theme) => {
            const unlocked = unlockedThemeIds.includes(theme.id);
            const equipped = equippedThemeId === theme.id;
            const affordable = coins >= theme.cost;
            return (
              <View key={theme.id} style={styles.themeCard}>
                <View
                  style={[
                    styles.themePreview,
                    { backgroundColor: theme.primary },
                  ]}
                >
                  <View
                    style={[
                      styles.previewDot,
                      { backgroundColor: theme.accent },
                    ]}
                  />
                  <Text
                    style={[
                      styles.previewText,
                      { color: theme.primaryForeground },
                    ]}
                  >
                    TAP
                  </Text>
                </View>
                <View style={styles.themeCopy}>
                  <Text style={styles.themeName}>{theme.name}</Text>
                  <Text style={styles.themeDescription}>{theme.description}</Text>
                </View>
                {equipped ? (
                  <View style={styles.equippedBadge}>
                    <Feather name="check" size={13} color={colors.accentForeground} />
                    <Text style={styles.equippedText}>EQUIPPED</Text>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      unlocked
                        ? `Equip ${theme.name} theme`
                        : `Unlock ${theme.name} theme for ${theme.cost} coins`
                    }
                    accessibilityState={{ disabled: !unlocked && !affordable }}
                    disabled={!unlocked && !affordable}
                    onPress={() => (unlocked ? onEquip(theme) : onUnlock(theme))}
                    testID={`theme-${theme.id}-button`}
                    style={({ pressed }) => [
                      styles.themeAction,
                      !unlocked && affordable && styles.unlockAction,
                      !unlocked && !affordable && styles.disabledAction,
                      pressed && styles.pressed,
                    ]}
                  >
                    {unlocked ? (
                      <Text style={styles.themeActionText}>EQUIP</Text>
                    ) : (
                      <>
                        <Feather
                          name="circle"
                          size={12}
                          color={affordable ? colors.primaryForeground : colors.mutedForeground}
                        />
                        <Text
                          style={[
                            styles.themeActionText,
                            !affordable && styles.disabledActionText,
                          ]}
                        >
                          {theme.cost}
                        </Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.storageNote}>
          <Feather
            name={storageAvailable ? 'smartphone' : 'alert-circle'}
            size={14}
            color={storageAvailable ? colors.mutedForeground : colors.destructive}
          />
          <Text
            style={[
              styles.storageText,
              !storageAvailable && styles.storageUnavailable,
            ]}
          >
            {storageAvailable
              ? 'Coins and themes are saved on this device'
              : 'Shop storage is unavailable on this device'}
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
    wallet: {
      minHeight: 70,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 13,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      marginBottom: 16,
    },
    coinIcon: {
      width: 39,
      height: 39,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 13,
      backgroundColor: colors.secondary,
      marginRight: 12,
    },
    walletCopy: {
      flex: 1,
      gap: 5,
    },
    walletLabel: {
      color: colors.foreground,
      fontSize: 11,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1,
    },
    walletHint: {
      color: colors.mutedForeground,
      fontSize: 9,
    },
    coinValue: {
      color: colors.accent,
      fontSize: 25,
      fontFamily: 'Inter_700Bold',
    },
    themeList: {
      gap: 9,
    },
    themeCard: {
      minHeight: 86,
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
    },
    themePreview: {
      width: 64,
      height: 64,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 15,
      marginRight: 11,
      overflow: 'hidden',
    },
    previewDot: {
      position: 'absolute',
      width: 19,
      height: 19,
      borderRadius: 10,
      top: 8,
      right: 8,
    },
    previewText: {
      fontSize: 13,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 0.8,
    },
    themeCopy: {
      flex: 1,
      gap: 5,
    },
    themeName: {
      color: colors.foreground,
      fontSize: 13,
      fontFamily: 'Inter_700Bold',
    },
    themeDescription: {
      color: colors.mutedForeground,
      fontSize: 9,
      lineHeight: 14,
    },
    themeAction: {
      minWidth: 61,
      minHeight: 34,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderRadius: 11,
      backgroundColor: colors.secondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    unlockAction: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    disabledAction: {
      opacity: 0.52,
    },
    themeActionText: {
      color: colors.foreground,
      fontSize: 9,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 0.6,
    },
    disabledActionText: {
      color: colors.mutedForeground,
    },
    equippedBadge: {
      minHeight: 34,
      paddingHorizontal: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: 11,
      backgroundColor: colors.accent,
    },
    equippedText: {
      color: colors.accentForeground,
      fontSize: 8,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 0.4,
    },
    storageNote: {
      minHeight: 44,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      marginTop: 19,
    },
    storageText: {
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