export type CosmeticTheme = {
  id: string;
  name: string;
  description: string;
  cost: number;
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
};

export type LocalEconomy = {
  coins: number;
  unlockedThemeIds: string[];
  equippedThemeId: string;
};

export type ScoreMode = 'classic' | 'daily';

export type LocalScoreEntry = {
  id: string;
  mode: ScoreMode;
  score: number;
  playedAt: number;
  utcDate: string;
};

export const ECONOMY_STORAGE_KEY = 'dont-tap-local-economy';
export const LEADERBOARD_STORAGE_KEY = 'dont-tap-local-leaderboard';
export const MAX_LOCAL_SCORES_PER_MODE = 10;

export const COSMETIC_THEMES: CosmeticTheme[] = [
  {
    id: 'original',
    name: 'Original',
    description: 'The classic DON’T TAP! look',
    cost: 0,
    primary: '#FF795B',
    primaryForeground: '#17131A',
    accent: '#BDF47A',
    accentForeground: '#171A12',
  },
  {
    id: 'arctic',
    name: 'Arctic',
    description: 'Cool blue with a mint accent',
    cost: 12,
    primary: '#68C8FF',
    primaryForeground: '#0E1C26',
    accent: '#A9F0E6',
    accentForeground: '#102622',
  },
  {
    id: 'orchid',
    name: 'Orchid',
    description: 'Violet tones with a soft pink accent',
    cost: 24,
    primary: '#C49AFF',
    primaryForeground: '#261B32',
    accent: '#F2A7DB',
    accentForeground: '#2C1925',
  },
  {
    id: 'lime',
    name: 'Lime',
    description: 'Bright lime with a fresh green accent',
    cost: 40,
    primary: '#D9F05E',
    primaryForeground: '#222713',
    accent: '#72E7AD',
    accentForeground: '#17251E',
  },
];

export const DEFAULT_LOCAL_ECONOMY: LocalEconomy = {
  coins: 0,
  unlockedThemeIds: ['original'],
  equippedThemeId: 'original',
};

export function parseLocalEconomy(stored: string): LocalEconomy | null {
  try {
    const value = JSON.parse(stored) as Partial<LocalEconomy>;
    const allowedIds = new Set(COSMETIC_THEMES.map((theme) => theme.id));
    if (
      !Number.isInteger(value.coins) ||
      (value.coins ?? -1) < 0 ||
      !Array.isArray(value.unlockedThemeIds) ||
      !value.unlockedThemeIds.every(
        (id): id is string => typeof id === 'string' && allowedIds.has(id),
      ) ||
      !value.unlockedThemeIds.includes('original') ||
      typeof value.equippedThemeId !== 'string' ||
      !value.unlockedThemeIds.includes(value.equippedThemeId)
    ) {
      return null;
    }
    return {
      coins: value.coins as number,
      unlockedThemeIds: [...new Set(value.unlockedThemeIds)],
      equippedThemeId: value.equippedThemeId,
    };
  } catch {
    return null;
  }
}

export function rankLocalScores(
  entries: LocalScoreEntry[],
): LocalScoreEntry[] {
  const valid = entries.filter(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof entry.id === 'string' &&
      (entry.mode === 'classic' || entry.mode === 'daily') &&
      Number.isInteger(entry.score) &&
      entry.score >= 0 &&
      Number.isFinite(entry.playedAt) &&
      typeof entry.utcDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(entry.utcDate),
  );

  return (['classic', 'daily'] as const).flatMap((mode) =>
    valid
      .filter((entry) => entry.mode === mode)
      .sort((a, b) => b.score - a.score || b.playedAt - a.playedAt)
      .slice(0, MAX_LOCAL_SCORES_PER_MODE),
  );
}

export function parseLocalScores(stored: string): LocalScoreEntry[] | null {
  try {
    const value: unknown = JSON.parse(stored);
    if (!Array.isArray(value)) return null;
    return rankLocalScores(value as LocalScoreEntry[]);
  } catch {
    return null;
  }
}