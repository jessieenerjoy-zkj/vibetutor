import { DropsData } from './types';

export const DAILY_DROP_LIMIT = 5;

export type MindGardenStampKey = 'sprout' | 'cactus' | 'sunflower' | 'bodhi';

export interface MindGardenStageDefinition {
  key: MindGardenStampKey;
  label: string;
  englishLabel: string;
  icon: string;
  accentColor: string;
  targetDays: number;
  dedication: string;
}

export interface MindGardenStampProgress extends MindGardenStageDefinition {
  progressDays: number;
  unlocked: boolean;
  unlockDate: string | null;
  isCurrent: boolean;
}

export interface MindGardenState {
  stamps: MindGardenStampProgress[];
  fullGoalDays: number;
  currentStage: MindGardenStampProgress | null;
  completed: boolean;
}

export const MIND_GARDEN_STAGES: MindGardenStageDefinition[] = [
  {
    key: 'sprout',
    label: '小幼苗',
    englishLabel: 'Sprout',
    icon: 'seedling',
    accentColor: '#34D399',
    targetDays: 1,
    dedication: 'Your first focused day is in bloom. Small starts count.',
  },
  {
    key: 'cactus',
    label: '坚韧仙人掌',
    englishLabel: 'Cactus',
    icon: 'staff-snake',
    accentColor: '#F59E0B',
    targetDays: 3,
    dedication: 'You stayed steady through friction. Resilience is growing quietly.',
  },
  {
    key: 'sunflower',
    label: '专注向日葵',
    englishLabel: 'Sunflower',
    icon: 'sun',
    accentColor: '#FBBF24',
    targetDays: 7,
    dedication: 'Your focus keeps turning toward the light. Momentum looks good on you.',
  },
  {
    key: 'bodhi',
    label: '智慧菩提',
    englishLabel: 'Bodhi',
    icon: 'spa',
    accentColor: '#8B5CF6',
    targetDays: 21,
    dedication: 'Consistency has turned into wisdom. Your garden remembers every effort.',
  },
];

export const getTotalDrops = (dailyDrops: DropsData): number => {
  return Object.values(dailyDrops).reduce((sum, value) => sum + value, 0);
};

export const getFullGoalDates = (dailyDrops: DropsData): string[] => {
  return Object.keys(dailyDrops)
    .filter((date) => (dailyDrops[date] || 0) >= DAILY_DROP_LIMIT)
    .sort();
};

export const computeMindGardenState = (dailyDrops: DropsData): MindGardenState => {
  const fullGoalDates = getFullGoalDates(dailyDrops);
  const stamps: MindGardenStampProgress[] = [];
  let previousUnlockDate: string | null = null;
  let challengeOpen = true;
  let currentStage: MindGardenStampProgress | null = null;

  for (const stage of MIND_GARDEN_STAGES) {
    if (!challengeOpen) {
      const lockedStage: MindGardenStampProgress = {
        ...stage,
        progressDays: 0,
        unlocked: false,
        unlockDate: null,
        isCurrent: false,
      };
      stamps.push(lockedStage);
      continue;
    }

    const eligibleDates = fullGoalDates.filter((date) => {
      return previousUnlockDate ? date > previousUnlockDate : true;
    });

    const unlocked = eligibleDates.length >= stage.targetDays;
    const unlockDate = unlocked ? eligibleDates[stage.targetDays - 1] : null;
    const stamp: MindGardenStampProgress = {
      ...stage,
      progressDays: unlocked ? stage.targetDays : Math.min(stage.targetDays, eligibleDates.length),
      unlocked,
      unlockDate,
      isCurrent: !unlocked,
    };

    if (!unlocked) {
      currentStage = stamp;
      challengeOpen = false;
    } else {
      previousUnlockDate = unlockDate;
    }

    stamps.push(stamp);
  }

  return {
    stamps,
    fullGoalDays: fullGoalDates.length,
    currentStage,
    completed: stamps.every((stamp) => stamp.unlocked),
  };
};

export const findNewlyUnlockedStamp = (
  previousState: MindGardenState,
  nextState: MindGardenState,
  date: string
): MindGardenStampProgress | null => {
  for (const nextStamp of nextState.stamps) {
    const previousStamp = previousState.stamps.find((stamp) => stamp.key === nextStamp.key);
    const becameUnlocked = nextStamp.unlocked && !previousStamp?.unlocked;
    if (becameUnlocked && nextStamp.unlockDate === date) {
      return nextStamp;
    }
  }

  return null;
};

export const formatShortDate = (date: string | null): string => {
  if (!date) return '-';

  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return date;

  return `${year}.${month}.${day}`;
};
