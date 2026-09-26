export type ChallengeFamily =
  | 'colour'
  | 'opposite'
  | 'number'
  | 'size'
  | 'stroop'
  | 'no-tap';

export type GameColour = {
  name: string;
  value: string;
};

export type GameItem = {
  id: string;
  label?: string;
  colour?: GameColour;
  value?: number;
  size?: number;
  word?: string;
  ink?: GameColour;
};

export type DifficultyTier = 'EASY' | 'NORMAL' | 'HARD';

export type Challenge = {
  family: ChallengeFamily;
  instruction: string;
  durationMs: number;
  tier: DifficultyTier;
  items: GameItem[];
  correctIds: string[];
  targetName?: string;
};

export const GAME_COLOURS: GameColour[] = [
  { name: 'RED', value: '#FF566E' },
  { name: 'BLUE', value: '#63A8FF' },
  { name: 'GREEN', value: '#BDF47A' },
  { name: 'YELLOW', value: '#FFD45C' },
  { name: 'PURPLE', value: '#C59AFF' },
  { name: 'ORANGE', value: '#FF9A55' },
];

const WORDS = ['RED', 'BLUE', 'GREEN', 'YELLOW', 'PURPLE', 'ORANGE'];

type RandomSource = () => number;

function randomInt(max: number, random: RandomSource): number {
  return Math.floor(random() * max);
}

function pick<T>(items: T[], random: RandomSource): T {
  return items[randomInt(items.length, random)];
}

function shuffle<T>(items: T[], random: RandomSource): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1, random);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function getDifficulty(streak: number): {
  tier: DifficultyTier;
  count: number;
  durationMs: number;
} {
  if (streak <= 5) {
    return { tier: 'EASY', count: 4, durationMs: 8_000 - streak * 220 };
  }
  if (streak <= 15) {
    return { tier: 'NORMAL', count: 5, durationMs: 6_300 - (streak - 6) * 145 };
  }
  return {
    tier: 'HARD',
    count: 6,
    durationMs: Math.max(3_500, 4_800 - (streak - 16) * 55),
  };
}

function makeItems(count: number): GameItem[] {
  return Array.from({ length: count }, (_, index) => ({ id: `item-${index}` }));
}

export function generateChallenge(
  streak: number,
  previousFamily?: ChallengeFamily,
  random: RandomSource = Math.random,
): Challenge {
  const difficulty = getDifficulty(streak);
  const families: ChallengeFamily[] =
    streak === 0
      ? ['colour']
      : streak < 4
        ? ['colour', 'number', 'size']
        : ['colour', 'opposite', 'number', 'size', 'stroop', 'no-tap'];

  let family: ChallengeFamily;
  if (streak >= 4 && random() < (difficulty.tier === 'HARD' ? 0.14 : 0.1)) {
    family = 'no-tap';
  } else {
    const choices = families.filter(
      (candidate) => candidate !== 'no-tap' && candidate !== previousFamily,
    );
    family = pick(choices.length > 0 ? choices : families, random);
  }

  const items = makeItems(difficulty.count);
  const durationMs =
    family === 'no-tap'
      ? Math.max(1_600, Math.round(difficulty.durationMs * 0.38))
      : difficulty.durationMs;

  if (family === 'colour') {
    const colours = shuffle(GAME_COLOURS, random).slice(0, difficulty.count);
    const target = pick(colours, random);
    return {
      ...difficulty,
      family,
      instruction: `TAP ${target.name}`,
      durationMs,
      items: items.map((item, index) => ({ ...item, colour: colours[index] })),
      correctIds: [items[colours.indexOf(target)].id],
      targetName: target.name,
    };
  }

  if (family === 'opposite') {
    const colours = Array.from({ length: difficulty.count }, () =>
      pick(GAME_COLOURS, random),
    );
    const target = pick(GAME_COLOURS, random);
    const safeIndex = randomInt(difficulty.count, random);
    colours[safeIndex] = GAME_COLOURS.find((colour) => colour.name !== target.name)!;
    return {
      ...difficulty,
      family,
      instruction: `DON'T TAP ${target.name}`,
      durationMs,
      items: items.map((item, index) => ({ ...item, colour: colours[index] })),
      correctIds: items
        .filter((_, index) => colours[index].name !== target.name)
        .map((item) => item.id),
      targetName: target.name,
    };
  }

  if (family === 'number') {
    const values = shuffle(
      Array.from({ length: 80 }, (_, index) => index + 1),
      random,
    ).slice(0, difficulty.count);
    const highest = random() > 0.3;
    const targetValue = highest ? Math.max(...values) : Math.min(...values);
    return {
      ...difficulty,
      family,
      instruction: highest ? 'TAP THE HIGHEST NUMBER' : 'TAP THE LOWEST NUMBER',
      durationMs,
      items: items.map((item, index) => ({
        ...item,
        label: String(values[index]),
        value: values[index],
      })),
      correctIds: [items[values.indexOf(targetValue)].id],
    };
  }

  if (family === 'size') {
    const sizes = shuffle([42, 48, 54, 60, 66, 72, 78, 84], random).slice(
      0,
      difficulty.count,
    );
    const largest = Math.max(...sizes);
    return {
      ...difficulty,
      family,
      instruction: 'TAP THE BIGGEST CIRCLE',
      durationMs,
      items: items.map((item, index) => ({
        ...item,
        size: sizes[index],
        label: String(randomInt(90, random) + 10),
      })),
      correctIds: [items[sizes.indexOf(largest)].id],
    };
  }

  if (family === 'stroop') {
    const wordNames = shuffle(WORDS, random).slice(0, difficulty.count);
    const offset = randomInt(difficulty.count - 1, random) + 1;
    const inkNames = wordNames.map(
      (_, index) => wordNames[(index + offset) % wordNames.length],
    );
    const useWord = random() > 0.5;
    const targetName = pick(wordNames, random);
    const correctIndex = useWord
      ? wordNames.indexOf(targetName)
      : inkNames.indexOf(targetName);

    return {
      ...difficulty,
      family,
      instruction: useWord
        ? `TAP THE WORD ${targetName}`
        : `TAP THE ${targetName} INK`,
      durationMs,
      items: items.map((item, index) => ({
        ...item,
        word: wordNames[index],
        ink: GAME_COLOURS.find((colour) => colour.name === inkNames[index]),
      })),
      correctIds: [items[correctIndex].id],
      targetName,
    };
  }

  return {
    ...difficulty,
    family: 'no-tap',
    instruction: "DON'T TAP ANYTHING",
    durationMs,
    items: [],
    correctIds: [],
  };
}

export const DAILY_CHALLENGE_LENGTH = 10;

export function createSeededRandom(seed: string): RandomSource {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  }
  let state = hash >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function generateDailyChallenges(utcDate: string): Challenge[] {
  const random = createSeededRandom(`dont-tap-daily:${utcDate}`);
  const challenges: Challenge[] = [];
  let previousFamily: ChallengeFamily | undefined;

  for (let streak = 0; streak < DAILY_CHALLENGE_LENGTH; streak += 1) {
    const challenge = generateChallenge(streak, previousFamily, random);
    challenges.push(challenge);
    previousFamily = challenge.family;
  }

  return challenges;
}