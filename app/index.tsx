import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import LeaderboardScreen from '@/components/LeaderboardScreen';
import ShopScreen from '@/components/ShopScreen';
import {
  COSMETIC_THEMES,
  DEFAULT_LOCAL_ECONOMY,
  ECONOMY_STORAGE_KEY,
  LEADERBOARD_STORAGE_KEY,
  type CosmeticTheme,
  type LocalEconomy,
  type LocalScoreEntry,
  parseLocalEconomy,
  parseLocalScores,
  rankLocalScores,
} from '@/game/economy';
import {
  DAILY_CHALLENGE_LENGTH,
  type Challenge,
  type ChallengeFamily,
  type GameItem,
  generateChallenge,
  generateDailyChallenges,
} from '@/game/engine';

const BEST_SCORE_KEY = 'dont-tap-best-score';
const SOUND_SETTING_KEY = 'dont-tap-sound-enabled';
const HAPTICS_SETTING_KEY = 'dont-tap-haptics-enabled';
const DAILY_STORAGE_PREFIX = 'dont-tap-daily-';

type AppScreen =
  | 'splash'
  | 'home'
  | 'game'
  | 'settings'
  | 'leaderboard'
  | 'shop';
type GamePhase = 'playing' | 'over';
type GameMode = 'classic' | 'daily';
type DailyRunRecord = {
  date: string;
  status: 'in-progress' | 'complete';
  score: number;
  roundIndex: number;
};
type SoundPlayer = ReturnType<typeof useAudioPlayer>;

function getUtcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDailyStorageKey(date: string): string {
  return `${DAILY_STORAGE_PREFIX}${date}`;
}

function parseDailyRunRecord(
  stored: string,
  expectedDate: string,
): DailyRunRecord | null {
  try {
    const value = JSON.parse(stored) as Partial<DailyRunRecord>;
    if (
      value.date !== expectedDate ||
      (value.status !== 'in-progress' && value.status !== 'complete') ||
      !Number.isInteger(value.score) ||
      (value.score ?? -1) < 0 ||
      (value.score ?? DAILY_CHALLENGE_LENGTH + 1) > DAILY_CHALLENGE_LENGTH ||
      !Number.isInteger(value.roundIndex) ||
      (value.roundIndex ?? -1) < 0 ||
      (value.roundIndex ?? DAILY_CHALLENGE_LENGTH) >= DAILY_CHALLENGE_LENGTH
    ) {
      return null;
    }
    return value as DailyRunRecord;
  } catch {
    return null;
  }
}

function playSound(player: SoundPlayer, enabled: boolean): void {
  if (!enabled) return;
  void player
    .seekTo(0)
    .then(() => player.play())
    .catch(() => {});
}

function playImpact(enabled: boolean): void {
  if (!enabled) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

function playSuccess(enabled: boolean): void {
  if (!enabled) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => {},
  );
}

function playError(enabled: boolean): void {
  if (!enabled) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
    () => {},
  );
}

function SettingRow({
  icon,
  label,
  description,
  value,
  onValueChange,
  styles,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}>
        <Feather
          name={icon}
          size={18}
          color={styles.settingIconGlyph.color as string}
        />
      </View>
      <View style={styles.settingCopy}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      <Switch
        accessibilityLabel={`${label} ${value ? 'on' : 'off'}`}
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: styles.settingSwitchTrack.backgroundColor as string,
          true: styles.settingSwitchActive.backgroundColor as string,
        }}
        thumbColor={styles.settingSwitchThumb.color as string}
        testID={`setting-${label.toLowerCase().replaceAll(' ', '-')}`}
      />
    </View>
  );
}

function ChoiceTile({
  item,
  family,
  onPress,
  moving,
  disabled,
  styles,
}: {
  item: GameItem;
  family: ChallengeFamily;
  onPress: () => void;
  moving: boolean;
  disabled: boolean;
  styles: ReturnType<typeof makeStyles>;
}) {
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!moving) {
      bob.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 460 + Math.random() * 380,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 460 + Math.random() * 380,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [bob, moving]);

  const animatedStyle = {
    transform: [
      {
        translateY: bob.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -7],
        }),
      },
    ],
  };

  let visual: React.ReactNode;
  if (family === 'colour' || family === 'opposite') {
    visual = (
      <View
        style={[
          styles.colourCircle,
          { backgroundColor: item.colour?.value ?? '#FF795B' },
        ]}
      />
    );
  } else if (family === 'number') {
    visual = <Text style={styles.numberValue}>{item.label}</Text>;
  } else if (family === 'size') {
    const size = item.size ?? 56;
    visual = (
      <View
        style={[
          styles.sizeCircle,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        <Text style={styles.sizeLabel}>{item.label}</Text>
      </View>
    );
  } else {
    visual = (
      <Text style={[styles.stroopWord, { color: item.ink?.value ?? '#FF795B' }]}>
        {item.word}
      </Text>
    );
  }

  return (
    <Animated.View style={[styles.choiceCell, animatedStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          family === 'stroop'
            ? `${item.word} written in ${item.ink?.name} ink`
            : item.label ?? item.colour?.name ?? `choice ${item.id}`
        }
        disabled={disabled}
        onPress={onPress}
        testID={`challenge-${item.id}`}
        style={({ pressed }) => [
          styles.choiceTile,
          pressed && !disabled && styles.choicePressed,
        ]}
      >
        {visual}
      </Pressable>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const baseColors = useColors();
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<AppScreen>('splash');
  const [gamePhase, setGamePhase] = useState<GamePhase>('playing');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [gameMode, setGameMode] = useState<GameMode>('classic');
  const [dailyDate, setDailyDate] = useState<string>(getUtcDateKey);
  const [dailyRecord, setDailyRecord] = useState<DailyRunRecord | null>(null);
  const [isLoadingDailyRecord, setIsLoadingDailyRecord] = useState(true);
  const [dailyStorageError, setDailyStorageError] = useState(false);
  const [dailyChallenges, setDailyChallenges] = useState<Challenge[]>([]);
  const [activeDailyDate, setActiveDailyDate] = useState<string | null>(null);
  const [dailyVictory, setDailyVictory] = useState(false);
  const [bestScore, setBestScore] = useState(0);
  const [economy, setEconomy] = useState<LocalEconomy>(DEFAULT_LOCAL_ECONOMY);
  const [leaderboardEntries, setLeaderboardEntries] = useState<LocalScoreEntry[]>([]);
  const [remainingMs, setRemainingMs] = useState(0);
  const [storageError, setStorageError] = useState(false);
  const [notice, setNotice] = useState('');
  const [isLoadingBest, setIsLoadingBest] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const splashOpacity = useRef(new Animated.Value(0)).current;
  const splashScale = useRef(new Animated.Value(0.92)).current;
  const tapMePulse = useRef(new Animated.Value(1)).current;
  const tapPlayer = useAudioPlayer(require('../assets/audio/tap.wav'));
  const correctPlayer = useAudioPlayer(require('../assets/audio/correct.wav'));
  const mistakePlayer = useAudioPlayer(require('../assets/audio/mistake.wav'));
  const activeTheme =
    COSMETIC_THEMES.find((theme) => theme.id === economy.equippedThemeId) ??
    COSMETIC_THEMES[0];
  const colors = {
    ...baseColors,
    primary: activeTheme.primary,
    primaryForeground: activeTheme.primaryForeground,
    accent: activeTheme.accent,
    accentForeground: activeTheme.accentForeground,
    tint: activeTheme.primary,
  };
  const styles = makeStyles(colors);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(BEST_SCORE_KEY)
      .then((stored) => {
        if (active && stored) {
          const parsed = Number.parseInt(stored, 10);
          if (Number.isFinite(parsed) && parsed >= 0) setBestScore(parsed);
        }
      })
      .catch(() => {
        if (active) setStorageError(true);
      })
      .finally(() => {
        if (active) setIsLoadingBest(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    AsyncStorage.multiGet([ECONOMY_STORAGE_KEY, LEADERBOARD_STORAGE_KEY])
      .then(([economyResult, leaderboardResult]) => {
        if (!active) return;
        if (economyResult?.[1]) {
          const storedEconomy = parseLocalEconomy(economyResult[1]);
          if (storedEconomy) {
            setEconomy(storedEconomy);
          } else {
            setStorageError(true);
          }
        }
        if (leaderboardResult?.[1]) {
          const storedScores = parseLocalScores(leaderboardResult[1]);
          if (storedScores) {
            setLeaderboardEntries(storedScores);
          } else {
            setStorageError(true);
          }
        }
      })
      .catch(() => {
        if (active) setStorageError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setIsLoadingDailyRecord(true);
    setDailyStorageError(false);
    AsyncStorage.getItem(getDailyStorageKey(dailyDate))
      .then((stored) => {
        if (!active) return;
        const record = stored ? parseDailyRunRecord(stored, dailyDate) : null;
        if (stored && !record) {
          setStorageError(true);
          setDailyStorageError(true);
        }
        setDailyRecord(record);
      })
      .catch(() => {
        if (active) {
          setStorageError(true);
          setDailyStorageError(true);
        }
      })
      .finally(() => {
        if (active) setIsLoadingDailyRecord(false);
      });
    return () => {
      active = false;
    };
  }, [dailyDate]);

  useEffect(() => {
    const interval = setInterval(() => {
      setDailyDate((currentDate) => {
        const currentUtcDate = getUtcDateKey();
        return currentDate === currentUtcDate ? currentDate : currentUtcDate;
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;
    AsyncStorage.multiGet([SOUND_SETTING_KEY, HAPTICS_SETTING_KEY])
      .then(([sound, haptics]) => {
        if (!active) return;
        setSoundEnabled(sound?.[1] !== 'false');
        setHapticsEnabled(haptics?.[1] !== 'false');
      })
      .catch(() => {
        if (active) setStorageError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    tapPlayer.volume = 0.36;
    correctPlayer.volume = 0.48;
    mistakePlayer.volume = 0.42;
  }, [tapPlayer, correctPlayer, mistakePlayer]);

  useEffect(() => {
    if (screen !== 'splash') return;
    const entrance = Animated.parallel([
      Animated.timing(splashOpacity, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(splashScale, {
        toValue: 1,
        damping: 13,
        stiffness: 105,
        useNativeDriver: true,
      }),
    ]);
    entrance.start();
    const timeout = setTimeout(() => setScreen('home'), 1_900);
    return () => {
      clearTimeout(timeout);
      entrance.stop();
    };
  }, [screen, splashOpacity, splashScale]);

  useEffect(() => {
    if (screen !== 'game' || !challenge || gamePhase !== 'playing') return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const nextRemaining = Math.max(
        0,
        challenge.durationMs - (Date.now() - startedAt),
      );
      setRemainingMs(nextRemaining);
      if (nextRemaining === 0) {
        clearInterval(timer);
        if (challenge.family === 'no-tap') {
          advanceCorrectChallenge('success');
        } else {
          playError(hapticsEnabled);
          playSound(mistakePlayer, soundEnabled);
          endRun();
        }
      }
    }, 40);
    return () => clearInterval(timer);
  }, [
    screen,
    challenge,
    gamePhase,
    streak,
    score,
    gameMode,
    dailyDate,
    activeDailyDate,
    dailyChallenges,
    hapticsEnabled,
    soundEnabled,
    correctPlayer,
    mistakePlayer,
  ]);

  useEffect(() => {
    if (screen !== 'game' || !challenge || challenge.family !== 'no-tap') return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(tapMePulse, {
          toValue: 1.08,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(tapMePulse, {
          toValue: 0.96,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [screen, challenge, tapMePulse]);

  function beginRun(): void {
    playImpact(hapticsEnabled);
    playSound(tapPlayer, soundEnabled);
    setGameMode('classic');
    setActiveDailyDate(null);
    setDailyChallenges([]);
    setDailyVictory(false);
    setScore(0);
    setStreak(0);
    setGamePhase('playing');
    const firstChallenge = generateChallenge(0);
    setChallenge(firstChallenge);
    setRemainingMs(firstChallenge.durationMs);
    setScreen('game');
  }

  function saveDailyRecord(record: DailyRunRecord): void {
    setDailyRecord(record);
    AsyncStorage.setItem(getDailyStorageKey(record.date), JSON.stringify(record)).catch(
      () => {
        setStorageError(true);
        setDailyStorageError(true);
      },
    );
  }

  function saveEconomy(nextEconomy: LocalEconomy): void {
    setEconomy(nextEconomy);
    AsyncStorage.setItem(ECONOMY_STORAGE_KEY, JSON.stringify(nextEconomy)).catch(
      () => setStorageError(true),
    );
  }

  function saveLeaderboard(nextEntries: LocalScoreEntry[]): void {
    const rankedEntries = rankLocalScores(nextEntries);
    setLeaderboardEntries(rankedEntries);
    AsyncStorage.setItem(
      LEADERBOARD_STORAGE_KEY,
      JSON.stringify(rankedEntries),
    ).catch(() => setStorageError(true));
  }

  function recordCompletedRun(
    finalScore: number,
    mode: GameMode,
    completedDaily: boolean,
  ): void {
    const entry: LocalScoreEntry = {
      id: `${Date.now()}-${mode}-${Math.random().toString(36).slice(2, 8)}`,
      mode,
      score: finalScore,
      playedAt: Date.now(),
      utcDate: getUtcDateKey(),
    };
    saveLeaderboard([...leaderboardEntries, entry]);

    const earnedCoins = finalScore + (mode === 'daily' && completedDaily ? 10 : 0);
    if (earnedCoins > 0) {
      saveEconomy({
        ...economy,
        coins: economy.coins + earnedCoins,
      });
    }
  }

  function unlockTheme(theme: CosmeticTheme): void {
    if (
      economy.unlockedThemeIds.includes(theme.id) ||
      economy.coins < theme.cost
    ) {
      return;
    }
    saveEconomy({
      ...economy,
      coins: economy.coins - theme.cost,
      unlockedThemeIds: [...economy.unlockedThemeIds, theme.id],
      equippedThemeId: theme.id,
    });
    setNotice(`${theme.name.toUpperCase()} EQUIPPED`);
    setTimeout(() => setNotice(''), 1_800);
  }

  function equipTheme(theme: CosmeticTheme): void {
    if (!economy.unlockedThemeIds.includes(theme.id)) return;
    saveEconomy({ ...economy, equippedThemeId: theme.id });
    setNotice(`${theme.name.toUpperCase()} EQUIPPED`);
    setTimeout(() => setNotice(''), 1_800);
  }

  function beginDailyRun(): void {
    if (isLoadingDailyRecord || dailyStorageError) return;
    const date = dailyDate;
    const previousRecord = dailyRecord?.date === date ? dailyRecord : null;
    if (previousRecord?.status === 'complete') return;

    const challenges = generateDailyChallenges(date);
    const progress: DailyRunRecord =
      previousRecord ?? {
        date,
        status: 'in-progress',
        score: 0,
        roundIndex: 0,
      };
    const currentChallenge = challenges[progress.roundIndex];
    if (!currentChallenge) {
      setStorageError(true);
      return;
    }

    playImpact(hapticsEnabled);
    playSound(tapPlayer, soundEnabled);
    setGameMode('daily');
    setActiveDailyDate(date);
    setDailyChallenges(challenges);
    setDailyVictory(false);
    setScore(progress.score);
    setStreak(progress.roundIndex);
    setGamePhase('playing');
    setChallenge(currentChallenge);
    setRemainingMs(currentChallenge.durationMs);
    setScreen('game');
    if (!previousRecord) saveDailyRecord(progress);
  }

  function endRun(finalScore = score, completedDaily = false): void {
    setGamePhase('over');
    setRemainingMs(0);
    setDailyVictory(completedDaily);
    if (gameMode === 'daily') {
      saveDailyRecord({
        date: activeDailyDate ?? dailyDate,
        status: 'complete',
        score: finalScore,
        roundIndex: Math.min(streak, DAILY_CHALLENGE_LENGTH - 1),
      });
    }
    recordCompletedRun(finalScore, gameMode, completedDaily);
    setBestScore((currentBest) => {
      const nextBest = Math.max(currentBest, finalScore);
      if (nextBest > currentBest) {
        AsyncStorage.setItem(BEST_SCORE_KEY, String(nextBest)).catch(() =>
          setStorageError(true),
        );
      }
      return nextBest;
    });
  }

  function returnHome(): void {
    setScreen('home');
    setChallenge(null);
    setGamePhase('playing');
  }

  function advanceCorrectChallenge(
    hapticFeedback: 'impact' | 'success' = 'impact',
  ): void {
    if (!challenge || gamePhase !== 'playing') return;
    if (hapticFeedback === 'success') {
      playSuccess(hapticsEnabled);
    } else {
      playImpact(hapticsEnabled);
    }
    playSound(correctPlayer, soundEnabled);

    const nextScore = score + 1;
    const nextStreak = streak + 1;
    if (gameMode === 'daily') {
      if (nextStreak >= DAILY_CHALLENGE_LENGTH) {
        setScore(nextScore);
        setStreak(nextStreak);
        endRun(nextScore, true);
        return;
      }

      const nextChallenge = dailyChallenges[nextStreak];
      if (!nextChallenge) {
        setStorageError(true);
        endRun(nextScore);
        return;
      }
      saveDailyRecord({
        date: activeDailyDate ?? dailyDate,
        status: 'in-progress',
        score: nextScore,
        roundIndex: nextStreak,
      });
      setScore(nextScore);
      setStreak(nextStreak);
      setChallenge(nextChallenge);
      setRemainingMs(nextChallenge.durationMs);
      return;
    }

    const nextChallenge = generateChallenge(nextStreak, challenge.family);
    setScore(nextScore);
    setStreak(nextStreak);
    setChallenge(nextChallenge);
    setRemainingMs(nextChallenge.durationMs);
  }

  function chooseItem(itemId: string): void {
    if (!challenge || gamePhase !== 'playing') return;
    if (challenge.correctIds.includes(itemId)) {
      advanceCorrectChallenge();
      return;
    }
    playError(hapticsEnabled);
    playSound(mistakePlayer, soundEnabled);
    endRun();
  }

  function handleNoTapTouch(): void {
    if (gamePhase !== 'playing') return;
    playError(hapticsEnabled);
    playSound(mistakePlayer, soundEnabled);
    endRun();
  }

  function updateSoundSetting(enabled: boolean): void {
    setSoundEnabled(enabled);
    AsyncStorage.setItem(SOUND_SETTING_KEY, String(enabled)).catch(() =>
      setStorageError(true),
    );
    playSound(tapPlayer, enabled);
  }

  function updateHapticsSetting(enabled: boolean): void {
    setHapticsEnabled(enabled);
    AsyncStorage.setItem(HAPTICS_SETTING_KEY, String(enabled)).catch(() =>
      setStorageError(true),
    );
    playImpact(enabled);
  }

  const safeTop =
    insets.top + (Platform.OS === 'web' ? 67 : 10);
  const safeBottom =
    insets.bottom + (Platform.OS === 'web' ? 34 : 12);
  const todayDailyRecord =
    dailyRecord?.date === dailyDate ? dailyRecord : null;
  const dailyStatus = dailyStorageError
    ? 'SAVED DATA UNAVAILABLE'
    : isLoadingDailyRecord
      ? 'CHECKING TODAY'
    : todayDailyRecord?.status === 'complete'
      ? `DONE · ${todayDailyRecord.score}/${DAILY_CHALLENGE_LENGTH}`
      : todayDailyRecord?.status === 'in-progress'
        ? `RESUME · ${todayDailyRecord.roundIndex + 1}/${DAILY_CHALLENGE_LENGTH}`
        : '10 ROUNDS · UTC RESET';

  if (screen === 'splash') {
    return (
      <View
        style={[
          styles.screen,
          styles.splashScreen,
          { paddingTop: safeTop, paddingBottom: safeBottom },
        ]}
      >
        <StatusBar style="light" />
        <Animated.View
          style={[
            styles.splashContent,
            {
              opacity: splashOpacity,
              transform: [{ scale: splashScale }],
            },
          ]}
        >
          <Image
            source={require('../assets/images/icon_2.png')}
            style={styles.splashIcon}
            contentFit="contain"
          />
          <Text style={styles.splashTitle}>
            DON&apos;T <Text style={styles.titleAccent}>TAP!</Text>
          </Text>
          <Text style={styles.splashTagline}>
            Your brain is faster than your finger... right?
          </Text>
          <View style={styles.splashDots}>
            <View style={styles.splashDot} />
            <View style={[styles.splashDot, styles.splashDotDim]} />
            <View style={[styles.splashDot, styles.splashDotDim]} />
          </View>
        </Animated.View>
      </View>
    );
  }

  if (screen === 'home') {
    return (
      <View
        style={[
          styles.screen,
          { paddingTop: safeTop, paddingBottom: safeBottom },
        ]}
      >
        <StatusBar style="light" />
        <ScrollView
          contentContainerStyle={styles.homeScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.homeTopline}>
            <View style={styles.brandMark}>
              <Image
                source={require('../assets/images/icon_2.png')}
                style={styles.brandIcon}
                contentFit="cover"
              />
            </View>
            <Text style={styles.editionLabel}>THE QUICK-THINKING TEST</Text>
            <View style={styles.toplineDot} />
          </View>

          <View style={styles.homeHero}>
            <Text style={styles.homeEyebrow}>A GAME OF SELF-CONTROL</Text>
            <Text style={styles.homeTitle}>
              DON&apos;T{'\n'}
              <Text style={styles.titleAccent}>TAP!</Text>
            </Text>
            <Text style={styles.homeTagline}>
              Your brain is faster than your finger... right?
            </Text>
          </View>

          <View style={styles.bestCard}>
            <View style={styles.bestIconWrap}>
              <Feather name="award" size={19} color={colors.accent} />
            </View>
            <View style={styles.bestCopy}>
              <Text style={styles.bestLabel}>PERSONAL BEST</Text>
              <Text style={styles.bestCaption}>
                {isLoadingBest ? 'Checking your record…' : 'One mistake ends it.'}
              </Text>
            </View>
            <Text style={styles.bestScore}>{isLoadingBest ? '—' : bestScore}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Play"
            onPress={beginRun}
            testID="play-button"
            style={({ pressed }) => [
              styles.playButton,
              pressed && styles.playButtonPressed,
            ]}
          >
            <View style={styles.playIconWrap}>
              <Feather name="play" size={17} color={colors.primaryForeground} />
            </View>
            <Text style={styles.playButtonText}>PLAY</Text>
            <Feather name="arrow-up-right" size={20} color={colors.primaryForeground} />
          </Pressable>

          <Text style={styles.comingSoonHeading}>MORE WAYS TO PLAY</Text>
          <View style={styles.menuGrid}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Daily Challenge, ${dailyStatus}`}
              disabled={
                dailyStorageError ||
                isLoadingDailyRecord ||
                todayDailyRecord?.status === 'complete'
              }
              onPress={beginDailyRun}
              testID="daily-challenge-button"
              style={({ pressed }) => [
                styles.menuButton,
                styles.dailyMenuButton,
                todayDailyRecord?.status === 'complete' && styles.dailyMenuDone,
                pressed && styles.pressed,
              ]}
            >
              <Feather name="calendar" size={17} color={colors.foreground} />
              <View style={styles.dailyButtonCopy}>
                <Text numberOfLines={1} style={styles.menuButtonText}>
                  DAILY CHALLENGE
                </Text>
                <Text numberOfLines={1} style={styles.dailyButtonStatus}>
                  {dailyStatus}
                </Text>
              </View>
              <Feather
                name={todayDailyRecord?.status === 'complete' ? 'check' : 'chevron-right'}
                size={15}
                color={colors.mutedForeground}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Leaderboard"
              onPress={() => setScreen('leaderboard')}
              testID="leaderboard-button"
              style={({ pressed }) => [
                styles.menuButton,
                pressed && styles.pressed,
              ]}
            >
              <Feather name="bar-chart-2" size={18} color={colors.foreground} />
              <View style={styles.menuButtonCopy}>
                <Text style={styles.menuButtonText}>LEADERBOARD</Text>
                <Text style={styles.menuButtonStatus}>
                  {leaderboardEntries.length > 0
                    ? `${leaderboardEntries.length} LOCAL SCORES`
                    : 'START A RUN'}
                </Text>
              </View>
              <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Shop, ${economy.coins} coins`}
              onPress={() => setScreen('shop')}
              testID="shop-button"
              style={({ pressed }) => [
                styles.menuButton,
                pressed && styles.pressed,
              ]}
            >
              <Feather name="shopping-bag" size={18} color={colors.foreground} />
              <View style={styles.menuButtonCopy}>
                <Text style={styles.menuButtonText}>SHOP</Text>
                <Text style={styles.menuButtonStatus}>{economy.coins} COINS</Text>
              </View>
              <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() => setScreen('settings')}
              testID="settings-button"
              style={({ pressed }) => [
                styles.menuButton,
                pressed && styles.pressed,
              ]}
            >
              <Feather name="sliders" size={18} color={colors.foreground} />
              <Text style={styles.menuButtonText}>SETTINGS</Text>
              <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
            </Pressable>
          </View>
          {storageError ? (
            <Text style={styles.storageWarning}>
              Some game settings or scores couldn&apos;t be saved on this device.
            </Text>
          ) : null}
          <Text style={styles.homeFooter}>THINK FAST. TAP CAREFULLY.</Text>
        </ScrollView>
        {notice ? (
          <View style={[styles.notice, { bottom: safeBottom + 10 }]}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (screen === 'leaderboard') {
    return (
      <LeaderboardScreen
        colors={colors}
        entries={leaderboardEntries}
        storageAvailable={!storageError}
        onBack={() => setScreen('home')}
      />
    );
  }

  if (screen === 'shop') {
    return (
      <ShopScreen
        colors={colors}
        coins={economy.coins}
        themes={COSMETIC_THEMES}
        unlockedThemeIds={economy.unlockedThemeIds}
        equippedThemeId={economy.equippedThemeId}
        storageAvailable={!storageError}
        onBack={() => setScreen('home')}
        onUnlock={unlockTheme}
        onEquip={equipTheme}
      />
    );
  }

  if (screen === 'settings') {
    return (
      <View
        style={[
          styles.screen,
          styles.gameScreen,
          { paddingTop: safeTop, paddingBottom: safeBottom },
        ]}
      >
        <StatusBar style="light" />
        <View style={styles.settingsHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to home"
            onPress={() => setScreen('home')}
            hitSlop={12}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.pressed,
            ]}
          >
            <Feather name="arrow-left" size={19} color={colors.foreground} />
          </Pressable>
          <Text style={styles.settingsHeaderTitle}>SETTINGS</Text>
          <View style={styles.settingsHeaderSpacer} />
        </View>

        <View style={styles.settingsHero}>
          <Text style={styles.settingsEyebrow}>YOUR GAME, YOUR RULES</Text>
          <Text style={styles.settingsTitle}>Make it yours.</Text>
          <Text style={styles.settingsIntro}>
            Adjust the feedback you feel and hear while you play.
          </Text>
        </View>

        <View style={styles.settingsRows}>
          <SettingRow
            icon="volume-2"
            label="Sound effects"
            description="Clicks, correct answers and mistakes"
            value={soundEnabled}
            onValueChange={updateSoundSetting}
            styles={styles}
          />
          <SettingRow
            icon="smartphone"
            label="Vibration"
            description="Feel each answer and mistake"
            value={hapticsEnabled}
            onValueChange={updateHapticsSetting}
            styles={styles}
          />
        </View>

        <View style={styles.settingsNote}>
          <Feather name="lock" size={14} color={colors.mutedForeground} />
          <Text style={styles.settingsNoteText}>
            {storageError
              ? 'A preference could not be saved on this device.'
              : 'Your preferences stay saved on this device.'}
          </Text>
        </View>
      </View>
    );
  }

  const isOver = gamePhase === 'over';
  const timeFraction = challenge
    ? Math.max(0, Math.min(1, remainingMs / challenge.durationMs))
    : 0;
  const displaySeconds = (remainingMs / 1_000).toFixed(1);

  return (
    <View
      style={[
        styles.screen,
        styles.gameScreen,
        { paddingTop: safeTop, paddingBottom: safeBottom },
      ]}
    >
      <StatusBar style="light" />
      <View style={styles.gameTopline}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave game"
          onPress={returnHome}
          hitSlop={12}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.pressed,
          ]}
        >
          <Feather name="arrow-left" size={19} color={colors.foreground} />
        </Pressable>
        <View style={styles.gameScore}>
          <Text style={styles.gameScoreLabel}>SCORE</Text>
          <Text style={styles.gameScoreValue}>{score}</Text>
        </View>
        <View style={styles.streakBadge}>
          <Feather name="zap" size={14} color={colors.accent} />
          <Text style={styles.streakText}>
            {gameMode === 'daily'
              ? `ROUND ${dailyVictory ? DAILY_CHALLENGE_LENGTH : Math.min(streak + 1, DAILY_CHALLENGE_LENGTH)}/${DAILY_CHALLENGE_LENGTH}`
              : `STREAK ×${streak}`}
          </Text>
        </View>
      </View>

      {isOver ? (
        <View style={styles.gameOverContent}>
          <View style={styles.gameOverIcon}>
            <Feather
              name={dailyVictory ? 'award' : 'x'}
              size={33}
              color={dailyVictory ? colors.accent : colors.destructive}
            />
          </View>
          <Text style={styles.gameOverEyebrow}>
            {gameMode === 'daily'
              ? dailyVictory
                ? 'DAILY CHALLENGE COMPLETE'
                : 'DAILY RESULT SAVED'
              : 'RUN OVER'}
          </Text>
          <Text style={styles.gameOverTitle}>
            {gameMode === 'daily'
              ? dailyVictory
                ? 'Perfect 10.'
                : 'Run over.'
              : 'Got you.'}
          </Text>
          <Text style={styles.gameOverCopy}>
            {gameMode === 'daily'
              ? 'Today’s result is saved. A fresh challenge unlocks tomorrow.'
              : 'One little mistake. Ready to outsmart it?'}
          </Text>
          <View style={styles.resultCard}>
            <View>
              <Text style={styles.bestLabel}>YOUR SCORE</Text>
              <Text style={styles.resultValue}>{score}</Text>
            </View>
            <View style={styles.resultDivider} />
            <View>
              <Text style={styles.bestLabel}>BEST SCORE</Text>
              <Text style={[styles.resultValue, { color: colors.accent }]}>
                {bestScore}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              gameMode === 'daily' ? 'Back to home' : 'Play again'
            }
            onPress={gameMode === 'daily' ? returnHome : beginRun}
            testID={gameMode === 'daily' ? 'daily-home-button' : 'play-again-button'}
            style={({ pressed }) => [
              styles.playButton,
              pressed && styles.playButtonPressed,
            ]}
          >
            <View style={styles.playIconWrap}>
              <Feather
                name={gameMode === 'daily' ? 'home' : 'rotate-ccw'}
                size={16}
                color={colors.primaryForeground}
              />
            </View>
            <Text style={styles.playButtonText}>
              {gameMode === 'daily' ? 'BACK TO HOME' : 'TRY AGAIN'}
            </Text>
            <Feather name="arrow-up-right" size={20} color={colors.primaryForeground} />
          </Pressable>
          {gameMode === 'classic' ? (
            <Pressable
              accessibilityRole="button"
              onPress={returnHome}
              style={({ pressed }) => [
                styles.homeLink,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.homeLinkText}>BACK TO HOME</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <>
          <View style={styles.timerBlock}>
            <View style={styles.timerMeta}>
              <Text style={styles.timerTier}>{challenge?.tier ?? 'EASY'}</Text>
              <Text style={styles.timerDigits}>{displaySeconds}s</Text>
            </View>
            <View style={styles.timerTrack}>
              <View
                style={[
                  styles.timerFill,
                  { width: `${timeFraction * 100}%` },
                  timeFraction < 0.28 && styles.timerFillUrgent,
                ]}
              />
            </View>
          </View>

          <View style={styles.instructionBlock}>
            <Text style={styles.instructionEyebrow}>
              READ IT. THEN DO IT.
            </Text>
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              numberOfLines={2}
              style={styles.instruction}
            >
              {challenge?.instruction ?? ''}
            </Text>
          </View>

          {challenge?.family === 'no-tap' ? (
            <View style={styles.noTapArea}>
              <Text style={styles.noTapHint}>HANDS OFF THE SCREEN</Text>
              <Animated.View style={{ transform: [{ scale: tapMePulse }] }}>
                <View style={styles.temptationButton}>
                  <View style={styles.temptationInner}>
                    <Text style={styles.temptationText}>TAP ME</Text>
                    <Feather name="chevron-right" size={16} color="#251515" />
                  </View>
                </View>
              </Animated.View>
              <Text style={styles.resistCopy}>Resist the urge.</Text>
            </View>
          ) : (
            <View
              style={[
                styles.choiceGrid,
                challenge?.items.length === 4 && styles.choiceGridFour,
              ]}
            >
              {challenge?.items.map((item) => (
                <ChoiceTile
                  key={item.id}
                  item={item}
                  family={challenge.family}
                  onPress={() => chooseItem(item.id)}
                  moving={streak >= 7}
                  disabled={isOver}
                  styles={styles}
                />
              ))}
            </View>
          )}

          <View style={styles.gameFooter}>
            <View style={styles.roundDot} />
            <Text style={styles.gameFooterText}>
              {challenge?.family === 'no-tap'
                ? 'DO NOTHING UNTIL TIME RUNS OUT'
                : 'ONE WRONG MOVE AND IT’S OVER'}
            </Text>
            <View style={styles.roundDot} />
          </View>

          {challenge?.family === 'no-tap' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Touch anywhere to fail this don't tap challenge"
              onPress={handleNoTapTouch}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 24,
    },
    splashScreen: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    splashContent: {
      alignItems: 'center',
      width: '100%',
    },
    splashIcon: {
      width: 104,
      height: 104,
      borderRadius: 28,
      marginBottom: 27,
    },
    splashTitle: {
      color: colors.foreground,
      fontSize: 50,
      lineHeight: 55,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -2.5,
      textAlign: 'center',
    },
    titleAccent: {
      color: colors.primary,
    },
    splashTagline: {
      color: colors.mutedForeground,
      fontSize: 15,
      lineHeight: 23,
      marginTop: 13,
      textAlign: 'center',
      maxWidth: 275,
    },
    splashDots: {
      flexDirection: 'row',
      gap: 7,
      marginTop: 54,
    },
    splashDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    splashDotDim: {
      opacity: 0.28,
    },
    homeScroll: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingBottom: 8,
    },
    homeTopline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 28,
    },
    brandMark: {
      width: 31,
      height: 31,
      borderRadius: 10,
      overflow: 'hidden',
    },
    brandIcon: {
      width: 31,
      height: 31,
    },
    editionLabel: {
      color: colors.mutedForeground,
      fontSize: 9,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1.45,
      flex: 1,
    },
    toplineDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.accent,
    },
    homeHero: {
      marginBottom: 23,
    },
    homeEyebrow: {
      color: colors.accent,
      fontSize: 10,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1.5,
      marginBottom: 8,
    },
    homeTitle: {
      color: colors.foreground,
      fontSize: 64,
      lineHeight: 61,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -4.4,
    },
    homeTagline: {
      color: colors.mutedForeground,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 12,
    },
    bestCard: {
      borderRadius: 18,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 14,
      paddingHorizontal: 15,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 14,
    },
    bestIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.secondary,
      marginRight: 12,
    },
    bestCopy: {
      flex: 1,
    },
    bestLabel: {
      color: colors.mutedForeground,
      fontSize: 9,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1.25,
    },
    bestCaption: {
      color: colors.foreground,
      fontSize: 11,
      marginTop: 5,
    },
    bestScore: {
      color: colors.accent,
      fontFamily: 'Inter_700Bold',
      fontSize: 25,
      letterSpacing: -0.5,
    },
    playButton: {
      minHeight: 62,
      borderRadius: 19,
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 17,
      marginBottom: 25,
    },
    playButtonPressed: {
      opacity: 0.83,
      transform: [{ scale: 0.985 }],
    },
    playIconWrap: {
      width: 31,
      height: 31,
      borderRadius: 11,
      backgroundColor: 'rgba(23, 19, 26, 0.12)',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    playButtonText: {
      color: colors.primaryForeground,
      fontSize: 15,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1.5,
      flex: 1,
    },
    comingSoonHeading: {
      color: colors.mutedForeground,
      fontSize: 9,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1.35,
      marginBottom: 10,
    },
    menuGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 9,
    },
    menuButton: {
      width: '48%',
      minHeight: 49,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 15,
      paddingHorizontal: 10,
      gap: 7,
    },
    menuIcon: {
      color: colors.foreground,
    },
    menuButtonText: {
      color: colors.foreground,
      fontSize: 9,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 0.5,
      flex: 1,
    },
    menuButtonCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    menuButtonStatus: {
      color: colors.mutedForeground,
      fontSize: 8,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 0.25,
    },
    dailyMenuButton: {
      minHeight: 58,
    },
    dailyMenuDone: {
      opacity: 0.72,
    },
    dailyButtonCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    dailyButtonStatus: {
      color: colors.mutedForeground,
      fontSize: 8,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 0.25,
    },
    menuHint: {
      color: colors.mutedForeground,
    },
    homeFooter: {
      color: colors.mutedForeground,
      textAlign: 'center',
      fontSize: 9,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1.5,
      marginTop: 24,
      opacity: 0.64,
    },
    storageWarning: {
      color: colors.destructive,
      fontSize: 11,
      marginTop: 12,
      textAlign: 'center',
    },
    notice: {
      position: 'absolute',
      alignSelf: 'center',
      backgroundColor: colors.foreground,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 20,
    },
    noticeText: {
      color: colors.background,
      fontSize: 11,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 0.8,
    },
    pressed: {
      opacity: 0.65,
    },
    settingsHeader: {
      minHeight: 50,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    settingsHeaderTitle: {
      color: colors.foreground,
      fontSize: 11,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1.5,
    },
    settingsHeaderSpacer: {
      width: 40,
    },
    settingsHero: {
      marginTop: 49,
      marginBottom: 27,
    },
    settingsEyebrow: {
      color: colors.accent,
      fontSize: 9,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1.4,
      marginBottom: 9,
    },
    settingsTitle: {
      color: colors.foreground,
      fontSize: 34,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -1.5,
    },
    settingsIntro: {
      color: colors.mutedForeground,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 8,
      maxWidth: 280,
    },
    settingsRows: {
      gap: 11,
    },
    settingRow: {
      minHeight: 84,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 19,
      paddingHorizontal: 13,
      paddingVertical: 11,
    },
    settingIcon: {
      width: 39,
      height: 39,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.secondary,
      marginRight: 12,
    },
    settingIconGlyph: {
      color: colors.accent,
    },
    settingCopy: {
      flex: 1,
      paddingRight: 8,
    },
    settingLabel: {
      color: colors.foreground,
      fontSize: 13,
      fontFamily: 'Inter_700Bold',
    },
    settingDescription: {
      color: colors.mutedForeground,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 4,
    },
    settingSwitchTrack: {
      backgroundColor: colors.border,
    },
    settingSwitchActive: {
      backgroundColor: colors.accent,
    },
    settingSwitchThumb: {
      color: colors.accentForeground,
    },
    settingsNote: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 23,
    },
    settingsNoteText: {
      color: colors.mutedForeground,
      fontSize: 11,
    },
    gameScreen: {
      paddingHorizontal: 20,
    },
    gameTopline: {
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
    gameScore: {
      alignItems: 'center',
    },
    gameScoreLabel: {
      color: colors.mutedForeground,
      fontSize: 8,
      letterSpacing: 1.5,
      fontFamily: 'Inter_700Bold',
    },
    gameScoreValue: {
      color: colors.foreground,
      fontSize: 20,
      fontFamily: 'Inter_700Bold',
      marginTop: 2,
    },
    streakBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 11,
      height: 34,
      borderRadius: 13,
      backgroundColor: colors.secondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    streakText: {
      color: colors.foreground,
      fontSize: 10,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 0.55,
    },
    timerBlock: {
      marginTop: 22,
    },
    timerMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    timerTier: {
      color: colors.accent,
      fontSize: 9,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1.4,
    },
    timerDigits: {
      color: colors.foreground,
      fontSize: 13,
      fontFamily: 'Inter_700Bold',
      fontVariant: ['tabular-nums'],
    },
    timerTrack: {
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.secondary,
      overflow: 'hidden',
    },
    timerFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    timerFillUrgent: {
      backgroundColor: colors.destructive,
    },
    instructionBlock: {
      alignItems: 'center',
      marginTop: 35,
      marginBottom: 18,
      minHeight: 104,
      justifyContent: 'center',
    },
    instructionEyebrow: {
      color: colors.mutedForeground,
      fontSize: 9,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1.5,
      marginBottom: 11,
    },
    instruction: {
      color: colors.foreground,
      textAlign: 'center',
      fontSize: 27,
      lineHeight: 34,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -0.7,
      width: '100%',
    },
    choiceGrid: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignContent: 'center',
      justifyContent: 'center',
      gap: 11,
      paddingVertical: 8,
    },
    choiceGridFour: {
      maxHeight: 332,
    },
    choiceCell: {
      width: '47%',
      minHeight: 111,
    },
    choiceTile: {
      flex: 1,
      minHeight: 111,
      borderRadius: 23,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    choicePressed: {
      transform: [{ scale: 0.95 }],
      borderColor: colors.primary,
    },
    colourCircle: {
      width: 59,
      height: 59,
      borderRadius: 30,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    numberValue: {
      color: colors.foreground,
      fontSize: 32,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -1.2,
    },
    sizeCircle: {
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.22)',
    },
    sizeLabel: {
      color: colors.primaryForeground,
      fontSize: 13,
      fontFamily: 'Inter_700Bold',
    },
    stroopWord: {
      fontSize: 20,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 0.4,
    },
    noTapArea: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: 22,
    },
    noTapHint: {
      color: colors.accent,
      fontSize: 10,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1.45,
      marginBottom: 24,
    },
    temptationButton: {
      minWidth: 206,
      minHeight: 77,
      borderRadius: 24,
      backgroundColor: colors.primary,
      padding: 7,
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOpacity: 0.25,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 7 },
      elevation: 8,
    },
    temptationInner: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
    },
    temptationText: {
      color: '#251515',
      fontSize: 18,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1.6,
    },
    resistCopy: {
      color: colors.mutedForeground,
      fontSize: 13,
      marginTop: 21,
    },
    gameFooter: {
      minHeight: 31,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 8,
    },
    roundDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.primary,
    },
    gameFooterText: {
      color: colors.mutedForeground,
      fontSize: 8,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1,
      textAlign: 'center',
    },
    gameOverContent: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingBottom: 40,
    },
    gameOverIcon: {
      width: 68,
      height: 68,
      borderRadius: 24,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 25,
    },
    gameOverEyebrow: {
      color: colors.destructive,
      fontSize: 10,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1.6,
    },
    gameOverTitle: {
      color: colors.foreground,
      fontSize: 42,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -2,
      marginTop: 8,
    },
    gameOverCopy: {
      color: colors.mutedForeground,
      fontSize: 14,
      textAlign: 'center',
      marginTop: 8,
    },
    resultCard: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 21,
      paddingVertical: 18,
      marginTop: 31,
      marginBottom: 18,
    },
    resultValue: {
      color: colors.foreground,
      fontSize: 27,
      fontFamily: 'Inter_700Bold',
      textAlign: 'center',
      marginTop: 7,
    },
    resultDivider: {
      width: 1,
      height: 37,
      backgroundColor: colors.border,
    },
    homeLink: {
      paddingVertical: 14,
      paddingHorizontal: 18,
    },
    homeLinkText: {
      color: colors.mutedForeground,
      fontSize: 10,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1.3,
    },
  });
}