import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MoodType,
  TutorPersona,
  MoodRecord,
  DropsData,
  LikeRecord,
  ChatMessage,
} from './types';
import {
  DAILY_DROP_LIMIT,
  computeMindGardenState,
  findNewlyUnlockedStamp,
  type MindGardenState,
  type MindGardenStampProgress,
} from './learning';

const KEYS = {
  MOOD_HISTORY: 'moodHistory',
  DAILY_DROPS: 'dailyDrops',
  DAILY_DROP_SIGNATURES: 'dailyDropSignatures',
  LIKED_MOTD: 'likedMOTD',
  CURRENT_PERSONA: 'currentPersona',
  CHAT_HISTORY: 'chatHistory',
  TUTOR_GREETING_STATE: 'tutorGreetingState',
  ANALYTICS_EVENTS: 'analyticsEvents',
};

interface TutorGreetingState {
  date: string;
  persona: TutorPersona;
}

interface DailyDropSignatures {
  [date: string]: string[];
}

interface AnalyticsEventRecord {
  name: string;
  params?: Record<string, unknown>;
  timestamp: string;
}

export interface DropUpdateResult {
  drops: number;
  added: boolean;
  duplicate: boolean;
  alreadyAtLimit: boolean;
  goalReached: boolean;
  mindGardenState: MindGardenState;
  unlockedStamp: MindGardenStampProgress | null;
}

const clampDrops = (value: unknown): number => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }

  return Math.min(DAILY_DROP_LIMIT, Math.floor(numericValue));
};

const sanitizeDropsData = (drops: DropsData): DropsData => {
  return Object.entries(drops || {}).reduce<DropsData>((accumulator, [date, value]) => {
    accumulator[date] = clampDrops(value);
    return accumulator;
  }, {});
};

// 获取今日日期字符串
export const getTodayString = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// 心情记录操作
export const getMoodHistory = async (): Promise<MoodRecord[]> => {
  try {
    const data = await AsyncStorage.getItem(KEYS.MOOD_HISTORY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const saveMoodRecord = async (mood: MoodType): Promise<void> => {
  const today = getTodayString();
  const history = await getMoodHistory();
  const existingIndex = history.findIndex((record) => record.date === today);

  if (existingIndex >= 0) {
    history[existingIndex].mood = mood;
  } else {
    history.push({ date: today, mood });
  }

  await AsyncStorage.setItem(KEYS.MOOD_HISTORY, JSON.stringify(history));
};

export const getTodayMood = async (): Promise<MoodType | null> => {
  const today = getTodayString();
  const history = await getMoodHistory();
  const todayRecord = history.find((record) => record.date === today);
  return todayRecord?.mood || null;
};

// 水滴记录操作
export const getDailyDrops = async (): Promise<DropsData> => {
  try {
    const data = await AsyncStorage.getItem(KEYS.DAILY_DROPS);
    const parsed = data ? (JSON.parse(data) as DropsData) : {};
    return sanitizeDropsData(parsed);
  } catch {
    return {};
  }
};

export const getTodayDrops = async (): Promise<number> => {
  const today = getTodayString();
  const drops = await getDailyDrops();
  return drops[today] || 0;
};

const getDailyDropSignatures = async (): Promise<DailyDropSignatures> => {
  try {
    const data = await AsyncStorage.getItem(KEYS.DAILY_DROP_SIGNATURES);
    return data ? (JSON.parse(data) as DailyDropSignatures) : {};
  } catch {
    return {};
  }
};

const saveDailyDropSignatures = async (signatures: DailyDropSignatures): Promise<void> => {
  await AsyncStorage.setItem(KEYS.DAILY_DROP_SIGNATURES, JSON.stringify(signatures));
};

export const trackLocalEvent = async (
  name: string,
  params?: Record<string, unknown>
): Promise<void> => {
  try {
    const existing = await AsyncStorage.getItem(KEYS.ANALYTICS_EVENTS);
    const events = existing ? (JSON.parse(existing) as AnalyticsEventRecord[]) : [];
    events.push({
      name,
      params,
      timestamp: new Date().toISOString(),
    });
    await AsyncStorage.setItem(KEYS.ANALYTICS_EVENTS, JSON.stringify(events.slice(-200)));
  } catch {
    // ignore local analytics write failures
  }
};

export const addDrop = async ({ dedupeKey }: { dedupeKey?: string } = {}): Promise<DropUpdateResult> => {
  const today = getTodayString();
  const drops = await getDailyDrops();
  const currentTodayDrops = drops[today] || 0;
  const previousMindGardenState = computeMindGardenState(drops);

  if (currentTodayDrops >= DAILY_DROP_LIMIT) {
    return {
      drops: currentTodayDrops,
      added: false,
      duplicate: false,
      alreadyAtLimit: true,
      goalReached: false,
      mindGardenState: previousMindGardenState,
      unlockedStamp: null,
    };
  }

  const signatures = await getDailyDropSignatures();
  const todaySignatures = signatures[today] || [];
  if (dedupeKey && todaySignatures.includes(dedupeKey)) {
    return {
      drops: currentTodayDrops,
      added: false,
      duplicate: true,
      alreadyAtLimit: false,
      goalReached: false,
      mindGardenState: previousMindGardenState,
      unlockedStamp: null,
    };
  }

  const nextDrops: DropsData = {
    ...drops,
    [today]: currentTodayDrops + 1,
  };
  await AsyncStorage.setItem(KEYS.DAILY_DROPS, JSON.stringify(nextDrops));

  if (dedupeKey) {
    const nextSignatures = {
      ...signatures,
      [today]: [...todaySignatures, dedupeKey].slice(-100),
    };
    await saveDailyDropSignatures(nextSignatures);
  }

  const nextMindGardenState = computeMindGardenState(nextDrops);
  const goalReached = currentTodayDrops < DAILY_DROP_LIMIT && nextDrops[today] >= DAILY_DROP_LIMIT;
  const unlockedStamp = goalReached
    ? findNewlyUnlockedStamp(previousMindGardenState, nextMindGardenState, today)
    : null;

  if (goalReached) {
    await trackLocalEvent('daily_drop_goal_reached', {
      drops_total: nextDrops[today],
      goal_limit: DAILY_DROP_LIMIT,
      date: today,
    });
  }

  if (unlockedStamp) {
    await trackLocalEvent('stamp_unlocked', {
      stamp_name: unlockedStamp.label,
      stamp_key: unlockedStamp.key,
      unlock_date: unlockedStamp.unlockDate,
    });
  }

  return {
    drops: nextDrops[today],
    added: true,
    duplicate: false,
    alreadyAtLimit: false,
    goalReached,
    mindGardenState: nextMindGardenState,
    unlockedStamp,
  };
};

export const getMindGardenStateData = async (): Promise<MindGardenState> => {
  const drops = await getDailyDrops();
  return computeMindGardenState(drops);
};

export const resetDropsIfNewDay = async (): Promise<void> => {
  // 每日0点重置通过 date-keyed 存储天然实现，无需额外清理。
};

// MOTD点赞操作
export const getLikedMOTD = async (): Promise<LikeRecord> => {
  try {
    const data = await AsyncStorage.getItem(KEYS.LIKED_MOTD);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
};

export const isMOTDLiked = async (date: string): Promise<boolean> => {
  const liked = await getLikedMOTD();
  return liked[date] || false;
};

export const toggleMOTDLike = async (date: string): Promise<boolean> => {
  const liked = await getLikedMOTD();
  const nextState = !liked[date];
  liked[date] = nextState;
  await AsyncStorage.setItem(KEYS.LIKED_MOTD, JSON.stringify(liked));
  return nextState;
};

// 当前人格
export const getCurrentPersona = async (): Promise<TutorPersona> => {
  try {
    const data = await AsyncStorage.getItem(KEYS.CURRENT_PERSONA);
    return (data as TutorPersona) || 'Neutral';
  } catch {
    return 'Neutral';
  }
};

export const saveCurrentPersona = async (persona: TutorPersona): Promise<void> => {
  await AsyncStorage.setItem(KEYS.CURRENT_PERSONA, persona);
};

// 聊天历史
export const getChatHistory = async (): Promise<ChatMessage[]> => {
  try {
    const data = await AsyncStorage.getItem(KEYS.CHAT_HISTORY);
    if (!data) {
      return [];
    }

    const parsed = JSON.parse(data);
    return parsed.map((message: ChatMessage) => ({
      ...message,
      timestamp: new Date(message.timestamp),
    }));
  } catch {
    return [];
  }
};

export const saveChatHistory = async (history: ChatMessage[]): Promise<void> => {
  await AsyncStorage.setItem(KEYS.CHAT_HISTORY, JSON.stringify(history));
};

export const getTutorGreetingState = async (): Promise<TutorGreetingState | null> => {
  try {
    const data = await AsyncStorage.getItem(KEYS.TUTOR_GREETING_STATE);
    return data ? (JSON.parse(data) as TutorGreetingState) : null;
  } catch {
    return null;
  }
};

export const shouldTutorAutoGreet = async (persona: TutorPersona): Promise<boolean> => {
  const state = await getTutorGreetingState();
  const today = getTodayString();

  if (!state) {
    return true;
  }

  if (state.date !== today) {
    return true;
  }

  return state.persona !== persona;
};

export const saveTutorGreetingState = async (persona: TutorPersona): Promise<void> => {
  const state: TutorGreetingState = {
    date: getTodayString(),
    persona,
  };

  await AsyncStorage.setItem(KEYS.TUTOR_GREETING_STATE, JSON.stringify(state));
};

// 清空所有数据
export const clearAllData = async (): Promise<void> => {
  await AsyncStorage.multiRemove(Object.values(KEYS));
};

export const clearChatHistory = async (): Promise<void> => {
  await AsyncStorage.setItem(KEYS.CHAT_HISTORY, JSON.stringify([]));
};

// 获取用户数据摘要
export const getUserStats = async (): Promise<{
  totalDrops: number;
  streakDays: number;
  todayMinutes: number;
}> => {
  const drops = await getDailyDrops();

  const totalDrops = Object.values(drops).reduce((sum, value) => sum + value, 0);

  let streakDays = 0;
  const sortedDates = Object.keys(drops).sort().reverse();
  for (const date of sortedDates) {
    if ((drops[date] || 0) > 0) {
      streakDays += 1;
    } else {
      break;
    }
  }

  return {
    totalDrops,
    streakDays,
    todayMinutes: 0,
  };
};
