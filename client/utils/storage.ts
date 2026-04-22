import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  MoodType,
  TutorPersona,
  TtsVoice,
  MoodRecord,
  DropsData,
  LikeRecord,
  ChatMessage,
  SubjectType,
  normalizeMoodType,
  normalizeTutorPersona,
  TTS_VOICES,
} from './types';
import {
  DAILY_DROP_LIMIT,
  computeMindGardenState,
  findNewlyUnlockedStamp,
  type MindGardenState,
  type MindGardenStampProgress,
} from './learning';

const KEYS = {
  INSTALLATION_ID: 'installationId',
  MOOD_HISTORY: 'moodHistory',
  DAILY_DROPS: 'dailyDrops',
  DAILY_DROP_SIGNATURES: 'dailyDropSignatures',
  LIKED_MOTD: 'likedMOTD',
  CURRENT_PERSONA: 'currentPersona',
  PERSONA_VOICE_PREFERENCES: 'personaVoicePreferences',
  CHAT_HISTORY: 'chatHistory',
  TUTOR_GREETING_STATE: 'tutorGreetingState',
  ANALYTICS_EVENTS: 'analyticsEvents',
  TUTOR_FOCUS_TIME: 'tutorFocusTime',
  TUTOR_SUBJECT_STATS: 'tutorSubjectStats',
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

type PersonaVoicePreferences = Partial<Record<TutorPersona, TtsVoice>>;

export type SubjectBreakdown = Record<SubjectType, number>;

interface TutorFocusTimeData {
  [date: string]: number;
}

interface TutorSubjectStatsData {
  [date: string]: SubjectBreakdown;
}

export interface TodayStudyReportData {
  date: string;
  totalMins: number;
  totalSolved: number;
  subjectBreakdown: SubjectBreakdown;
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

const getDefaultSubjectBreakdown = (): SubjectBreakdown => ({
  Math: 0,
  Physics: 0,
  Chemistry: 0,
  History: 0,
  Other: 0,
});

const SUBJECT_TYPES: SubjectType[] = ['Math', 'Physics', 'Chemistry', 'History', 'Other'];

const isTtsVoice = (value: unknown): value is TtsVoice =>
  typeof value === 'string' && TTS_VOICES.includes(value as TtsVoice);

const dataResetListeners = new Set<() => void>();

const notifyDataReset = () => {
  dataResetListeners.forEach((listener) => listener());
};

const createInstallationId = async (): Promise<string> => {
  try {
    return await Crypto.randomUUID();
  } catch {
    return `user-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
};

const normalizeSubject = (raw: string | null | undefined): SubjectType => {
  const value = (raw || '').trim().toLowerCase();

  if (value === 'math' || value === 'mathematics') return 'Math';
  if (value === 'physics') return 'Physics';
  if (value === 'chemistry' || value === 'chem') return 'Chemistry';
  if (value === 'history') return 'History';

  return 'Other';
};

const sanitizeSubjectBreakdown = (value: unknown): SubjectBreakdown => {
  const fallback = getDefaultSubjectBreakdown();

  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const input = value as Record<string, unknown>;
  const output = getDefaultSubjectBreakdown();

  for (const subject of SUBJECT_TYPES) {
    const numericValue = Number(input[subject]);
    output[subject] = Number.isFinite(numericValue) && numericValue > 0
      ? Math.floor(numericValue)
      : 0;
  }

  return output;
};

const sanitizeTutorFocusTimeData = (value: unknown): TutorFocusTimeData => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const input = value as Record<string, unknown>;
  const output: TutorFocusTimeData = {};

  for (const [date, seconds] of Object.entries(input)) {
    const numericValue = Number(seconds);
    output[date] = Number.isFinite(numericValue) && numericValue > 0
      ? Math.floor(numericValue)
      : 0;
  }

  return output;
};

const sanitizeTutorSubjectStatsData = (value: unknown): TutorSubjectStatsData => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const input = value as Record<string, unknown>;
  const output: TutorSubjectStatsData = {};

  for (const [date, breakdown] of Object.entries(input)) {
    output[date] = sanitizeSubjectBreakdown(breakdown);
  }

  return output;
};

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

export const getInstallationId = async (): Promise<string> => {
  const existingId = await AsyncStorage.getItem(KEYS.INSTALLATION_ID);
  if (existingId) {
    return existingId;
  }

  const newId = await createInstallationId();
  await AsyncStorage.setItem(KEYS.INSTALLATION_ID, newId);
  return newId;
};

export const resetInstallationId = async (): Promise<string> => {
  const newId = await createInstallationId();
  await AsyncStorage.setItem(KEYS.INSTALLATION_ID, newId);
  return newId;
};

// 心情记录操作
export const getMoodHistory = async (): Promise<MoodRecord[]> => {
  try {
    const data = await AsyncStorage.getItem(KEYS.MOOD_HISTORY);
    if (!data) {
      return [];
    }

    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.reduce<MoodRecord[]>((records, record) => {
      if (!record || typeof record.date !== 'string') {
        return records;
      }

      const mood = normalizeMoodType(record.mood);
      if (!mood) {
        return records;
      }

      records.push({ date: record.date, mood });
      return records;
    }, []);
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
  return todayRecord?.mood ?? 'Calm';
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

export const addDrop = async ({ dedupeKey }: { dedupeKey?: string } = {}): Promise<number> => {
  const today = getTodayString();
  const drops = await getDailyDrops();
  const currentTodayDrops = drops[today] || 0;
  const previousMindGardenState = computeMindGardenState(drops);

  if (currentTodayDrops >= DAILY_DROP_LIMIT) {
    return currentTodayDrops;
  }

  const signatures = await getDailyDropSignatures();
  const todaySignatures = signatures[today] || [];
  if (dedupeKey && todaySignatures.includes(dedupeKey)) {
    return currentTodayDrops;
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

  return nextDrops[today];
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
    return normalizeTutorPersona(data);
  } catch {
    return 'Einstein';
  }
};

export const saveCurrentPersona = async (persona: TutorPersona): Promise<void> => {
  await AsyncStorage.setItem(KEYS.CURRENT_PERSONA, persona);
};

export const getPersonaVoicePreferences = async (): Promise<PersonaVoicePreferences> => {
  try {
    const data = await AsyncStorage.getItem(KEYS.PERSONA_VOICE_PREFERENCES);
    if (!data) {
      return {};
    }

    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return Object.entries(parsed).reduce<PersonaVoicePreferences>((accumulator, [persona, voice]) => {
      const normalizedPersona = normalizeTutorPersona(persona);
      if (isTtsVoice(voice)) {
        accumulator[normalizedPersona] = voice;
      }
      return accumulator;
    }, {});
  } catch {
    return {};
  }
};

export const getPersonaVoicePreference = async (persona: TutorPersona): Promise<TtsVoice | null> => {
  const preferences = await getPersonaVoicePreferences();
  return preferences[persona] ?? null;
};

export const savePersonaVoicePreference = async (persona: TutorPersona, voice: TtsVoice): Promise<void> => {
  const preferences = await getPersonaVoicePreferences();
  preferences[persona] = voice;
  await AsyncStorage.setItem(KEYS.PERSONA_VOICE_PREFERENCES, JSON.stringify(preferences));
};

// 聊天历史
export const getChatHistory = async (): Promise<ChatMessage[]> => {
  try {
    const data = await AsyncStorage.getItem(KEYS.CHAT_HISTORY);
    if (!data) {
      return [];
    }

    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((message: ChatMessage) => ({
      ...message,
      timestamp: new Date(message.timestamp),
      persona: message.persona ? normalizeTutorPersona(message.persona) : undefined,
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
  await resetInstallationId();
  notifyDataReset();
};

export const clearChatHistory = async (): Promise<void> => {
  await AsyncStorage.setItem(KEYS.CHAT_HISTORY, JSON.stringify([]));
  notifyDataReset();
};

export const subscribeToDataReset = (listener: () => void): (() => void) => {
  dataResetListeners.add(listener);

  return () => {
    dataResetListeners.delete(listener);
  };
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

const getTutorFocusTimeData = async (): Promise<TutorFocusTimeData> => {
  try {
    const data = await AsyncStorage.getItem(KEYS.TUTOR_FOCUS_TIME);
    const parsed = data ? JSON.parse(data) : {};
    return sanitizeTutorFocusTimeData(parsed);
  } catch {
    return {};
  }
};

const saveTutorFocusTimeData = async (value: TutorFocusTimeData): Promise<void> => {
  await AsyncStorage.setItem(KEYS.TUTOR_FOCUS_TIME, JSON.stringify(value));
};

const getTutorSubjectStatsData = async (): Promise<TutorSubjectStatsData> => {
  try {
    const data = await AsyncStorage.getItem(KEYS.TUTOR_SUBJECT_STATS);
    const parsed = data ? JSON.parse(data) : {};
    return sanitizeTutorSubjectStatsData(parsed);
  } catch {
    return {};
  }
};

const saveTutorSubjectStatsData = async (value: TutorSubjectStatsData): Promise<void> => {
  await AsyncStorage.setItem(KEYS.TUTOR_SUBJECT_STATS, JSON.stringify(value));
};

export const recordTutorFocusDuration = async (seconds: number): Promise<void> => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  if (safeSeconds <= 0) {
    return;
  }

  const today = getTodayString();
  const current = await getTutorFocusTimeData();
  const nextValue = (current[today] || 0) + safeSeconds;

  await saveTutorFocusTimeData({
    ...current,
    [today]: nextValue,
  });
};

export const getTodayFocusMinutes = async (): Promise<number> => {
  const today = getTodayString();
  const focusData = await getTutorFocusTimeData();
  const totalSeconds = focusData[today] || 0;
  return Math.max(0, Math.floor(totalSeconds / 60));
};

export const recordTutorSolvedSubject = async (subject: SubjectType): Promise<void> => {
  const today = getTodayString();
  const stats = await getTutorSubjectStatsData();
  const todayStats = sanitizeSubjectBreakdown(stats[today]);

  todayStats[subject] += 1;

  await saveTutorSubjectStatsData({
    ...stats,
    [today]: todayStats,
  });
};

export const getTodaySubjectBreakdown = async (): Promise<SubjectBreakdown> => {
  const today = getTodayString();
  const stats = await getTutorSubjectStatsData();
  return sanitizeSubjectBreakdown(stats[today]);
};

export const extractSubjectTag = (rawContent: string): { content: string; subject: SubjectType } => {
  const text = String(rawContent || '');
  const trimmed = text.trimEnd();

  const closeBracketIndex = trimmed.lastIndexOf(']');
  const openBracketIndex = trimmed.lastIndexOf('[');

  if (openBracketIndex === -1 || closeBracketIndex !== trimmed.length - 1 || openBracketIndex >= closeBracketIndex) {
    return {
      content: trimmed,
      subject: 'Other',
    };
  }

  const insideTag = trimmed.slice(openBracketIndex + 1, closeBracketIndex).trim();
  const separatorIndex = insideTag.indexOf(':');

  if (separatorIndex === -1) {
    return {
      content: trimmed,
      subject: 'Other',
    };
  }

  const tagKey = insideTag.slice(0, separatorIndex).trim().toLowerCase();
  if (tagKey !== 'subject') {
    return {
      content: trimmed,
      subject: 'Other',
    };
  }

  const subjectText = insideTag.slice(separatorIndex + 1).trim();

  return {
    content: trimmed.slice(0, openBracketIndex).trimEnd(),
    subject: normalizeSubject(subjectText),
  };
};

export const getTodayStudyReportData = async (): Promise<TodayStudyReportData> => {
  const [totalMins, totalSolved, subjectBreakdown] = await Promise.all([
    getTodayFocusMinutes(),
    getTodayDrops(),
    getTodaySubjectBreakdown(),
  ]);

  return {
    date: getTodayString(),
    totalMins,
    totalSolved,
    subjectBreakdown,
  };
};
