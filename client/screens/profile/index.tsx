import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import Svg, { Circle, Line, Path, Polygon } from 'react-native-svg';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { FontAwesome6 } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import {
  MoodType,
  MOOD_CONFIG,
  MoodRecord,
} from '@/utils/types';
import {
  DAILY_DROP_LIMIT,
  computeMindGardenState,
  formatShortDate,
  getTotalDrops,
  type MindGardenStampProgress,
} from '@/utils/learning';
import {
  getMoodHistory,
  getChatHistory,
  getTodayDrops,
  clearChatHistory,
  getDailyDrops,
} from '@/utils/storage';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  iconBackground: string;
  iconColor: string;
}

const TOKENS = {
  colors: {
    background: '#f8f9fb',
    surface: '#ffffff',
    surfaceSubtle: '#f2f4f6',
    surfaceMuted: '#edeef0',
    text: '#191c1e',
    mutedText: '#5e3e3e',
    border: '#e9bcbb',
    borderSoft: '#e1e2e4',
    primary: '#ff0040',
    primaryMuted: '#ba002c',
    secondary: '#5e39e0',
    tertiary: '#2b59ad',
    pinkOrb: 'rgba(233, 0, 58, 0.12)',
    purpleOrb: 'rgba(119, 87, 250, 0.12)',
    blueOrb: 'rgba(72, 114, 200, 0.12)',
  },
} as const;

const CARD_SHADOW = {
  shadowColor: '#2e3132',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.05,
  shadowRadius: 18,
  elevation: 2,
};

const StatCard = ({ title, value, icon, iconBackground, iconColor }: StatCardProps) => (
  <View
    className="flex-1 rounded-[24px] border px-3 py-4 items-center"
    style={{
      ...CARD_SHADOW,
      shadowOpacity: 0.04,
      shadowRadius: 12,
      borderColor: TOKENS.colors.borderSoft,
      backgroundColor: TOKENS.colors.surface,
    }}
  >
    <View
      className="w-10 h-10 rounded-full items-center justify-center mb-3"
      style={{ backgroundColor: iconBackground }}
    >
      <FontAwesome6 name={icon as any} size={15} color={iconColor} />
    </View>
    <Text className="text-[28px] leading-[36px] font-bold tracking-[-0.56px]" style={{ color: TOKENS.colors.text }}>
      {value}
    </Text>
    <Text
      className="text-[12px] leading-[16px] font-semibold tracking-[0.12px] mt-1 text-center"
      style={{ color: TOKENS.colors.mutedText }}
    >
      {title}
    </Text>
  </View>
);

interface MoodTrendItem {
  mood: MoodType;
  date: string;
}

const MOOD_ORDER: MoodType[] = ['Hyper', 'Engaged', 'Calm', 'Stuck', 'Crushed'];
const MOOD_EMOJI_ASSET: Record<MoodType, { width: number; height: number; path: string; fill: string }> = {
  Hyper: {
    width: 20,
    height: 25,
    path: 'M5 25L6.25 16.25H0L11.25 0H13.75L12.5 10H20L7.5 25H5V25',
    fill: '#EAB308',
  },
  Engaged: {
    width: 25,
    height: 25,
    path: 'M12.5 19.375C13.9167 19.375 15.2031 18.974 16.3594 18.1719C17.5156 17.3698 18.3542 16.3125 18.875 15H6.125C6.64583 16.3125 7.48438 17.3698 8.64062 18.1719C9.79688 18.974 11.0833 19.375 12.5 19.375ZM7.25 11.25L8.625 9.9375L9.9375 11.25L11.25 9.9375L8.625 7.25L5.9375 9.9375L7.25 11.25ZM15.0625 11.25L16.375 9.9375L17.75 11.25L19.0625 9.9375L16.375 7.25L13.75 9.9375L15.0625 11.25ZM12.5 25C10.7708 25 9.14583 24.6719 7.625 24.0156C6.10417 23.3594 4.78125 22.4688 3.65625 21.3438C2.53125 20.2188 1.64062 18.8958 0.984375 17.375C0.328125 15.8542 0 14.2292 0 12.5C0 10.7708 0.328125 9.14583 0.984375 7.625C1.64062 6.10417 2.53125 4.78125 3.65625 3.65625C4.78125 2.53125 6.10417 1.64062 7.625 0.984375C9.14583 0.328125 10.7708 0 12.5 0C14.2292 0 15.8542 0.328125 17.375 0.984375C18.8958 1.64062 20.2188 2.53125 21.3438 3.65625C22.4688 4.78125 23.3594 6.10417 24.0156 7.625C24.6719 9.14583 25 10.7708 25 12.5C25 14.2292 24.6719 15.8542 24.0156 17.375C23.3594 18.8958 22.4688 20.2188 21.3438 21.3438C20.2188 22.4688 18.8958 23.3594 17.375 24.0156C15.8542 24.6719 14.2292 25 12.5 25Z',
    fill: '#22C55E',
  },
  Calm: {
    width: 25,
    height: 25,
    path: 'M16.875 11.25C17.3958 11.25 17.8385 11.0677 18.2031 10.7031C18.5677 10.3385 18.75 9.89583 18.75 9.375C18.75 8.85417 18.5677 8.41146 18.2031 8.04688C17.8385 7.68229 17.3958 7.5 16.875 7.5C16.3542 7.5 15.9115 7.68229 15.5469 8.04688C15.1823 8.41146 15 8.85417 15 9.375C15 9.89583 15.1823 10.3385 15.5469 10.7031C15.9115 11.0677 16.3542 11.25 16.875 11.25ZM8.125 11.25C8.64583 11.25 9.08854 11.0677 9.45312 10.7031C9.81771 10.3385 10 9.89583 10 9.375C10 8.85417 9.81771 8.41146 9.45312 8.04688C9.08854 7.68229 8.64583 7.5 8.125 7.5C7.60417 7.5 7.16146 7.68229 6.79688 8.04688C6.43229 8.41146 6.25 8.85417 6.25 9.375C6.25 9.89583 6.43229 10.3385 6.79688 10.7031C7.16146 11.0677 7.60417 11.25 8.125 11.25ZM12.5 19.375C13.9167 19.375 15.2031 18.974 16.3594 18.1719C17.5156 17.3698 18.3542 16.3125 18.875 15H16.8125C16.3542 15.7708 15.7448 16.3802 14.9844 16.8281C14.224 17.276 13.3958 17.5 12.5 17.5C11.6042 17.5 10.776 17.276 10.0156 16.8281C9.25521 16.3802 8.64583 15.7708 8.1875 15H6.125C6.64583 16.3125 7.48438 17.3698 8.64062 18.1719C9.79688 18.974 11.0833 19.375 12.5 19.375ZM12.5 25C10.7708 25 9.14583 24.6719 7.625 24.0156C6.10417 23.3594 4.78125 22.4688 3.65625 21.3438C2.53125 20.2188 1.64062 18.8958 0.984375 17.375C0.328125 15.8542 0 14.2292 0 12.5C0 10.7708 0.328125 9.14583 0.984375 7.625C1.64062 6.10417 2.53125 4.78125 3.65625 3.65625C4.78125 2.53125 6.10417 1.64062 7.625 0.984375C9.14583 0.328125 10.7708 0 12.5 0C14.2292 0 15.8542 0.328125 17.375 0.984375C18.8958 1.64062 20.2188 2.53125 21.3438 3.65625C22.4688 4.78125 23.3594 6.10417 24.0156 7.625C24.6719 9.14583 25 10.7708 25 12.5C25 14.2292 24.6719 15.8542 24.0156 17.375C23.3594 18.8958 22.4688 20.2188 21.3438 21.3438C20.2188 22.4688 18.8958 23.3594 17.375 24.0156C15.8542 24.6719 14.2292 25 12.5 25Z',
    fill: '#3B82F6',
  },
  Stuck: {
    width: 25,
    height: 25,
    path: 'M16.875 11.25C17.3958 11.25 17.8385 11.0677 18.2031 10.7031C18.5677 10.3385 18.75 9.89583 18.75 9.375C18.75 8.85417 18.5677 8.41146 18.2031 8.04688C17.8385 7.68229 17.3958 7.5 16.875 7.5C16.3542 7.5 15.9115 7.68229 15.5469 8.04688C15.1823 8.41146 15 8.85417 15 9.375C15 9.89583 15.1823 10.3385 15.5469 10.7031C15.9115 11.0677 16.3542 11.25 16.875 11.25ZM8.125 11.25C8.64583 11.25 9.08854 11.0677 9.45312 10.7031C9.81771 10.3385 10 9.89583 10 9.375C10 8.85417 9.81771 8.41146 9.45312 8.04688C9.08854 7.68229 8.64583 7.5 8.125 7.5C7.60417 7.5 7.16146 7.68229 6.79688 8.04688C6.43229 8.41146 6.25 8.85417 6.25 9.375C6.25 9.89583 6.43229 10.3385 6.79688 10.7031C7.16146 11.0677 7.60417 11.25 8.125 11.25ZM8.75 16.875H16.25V15H8.75V16.875ZM12.5 25C10.7708 25 9.14583 24.6719 7.625 24.0156C6.10417 23.3594 4.78125 22.4688 3.65625 21.3438C2.53125 20.2188 1.64062 18.8958 0.984375 17.375C0.328125 15.8542 0 14.2292 0 12.5C0 10.7708 0.328125 9.14583 0.984375 7.625C1.64062 6.10417 2.53125 4.78125 3.65625 3.65625C4.78125 2.53125 6.10417 1.64062 7.625 0.984375C9.14583 0.328125 10.7708 0 12.5 0C14.2292 0 15.8542 0.328125 17.375 0.984375C18.8958 1.64062 20.2188 2.53125 21.3438 3.65625C22.4688 4.78125 23.3594 6.10417 24.0156 7.625C24.6719 9.14583 25 10.7708 25 12.5C25 14.2292 24.6719 15.8542 24.0156 17.375C23.3594 18.8958 22.4688 20.2188 21.3438 21.3438C20.2188 22.4688 18.8958 23.3594 17.375 24.0156C15.8542 24.6719 14.2292 25 12.5 25Z',
    fill: '#EAB308',
  },
  Crushed: {
    width: 25,
    height: 25,
    path: 'M16.875 11.25C17.3958 11.25 17.8385 11.0677 18.2031 10.7031C18.5677 10.3385 18.75 9.89583 18.75 9.375C18.75 8.85417 18.5677 8.41146 18.2031 8.04688C17.8385 7.68229 17.3958 7.5 16.875 7.5C16.3542 7.5 15.9115 7.68229 15.5469 8.04688C15.1823 8.41146 15 8.85417 15 9.375C15 9.89583 15.1823 10.3385 15.5469 10.7031C15.9115 11.0677 16.3542 11.25 16.875 11.25ZM8.125 11.25C8.64583 11.25 9.08854 11.0677 9.45312 10.7031C9.81771 10.3385 10 9.89583 10 9.375C10 8.85417 9.81771 8.41146 9.45312 8.04688C9.08854 7.68229 8.64583 7.5 8.125 7.5C7.60417 7.5 7.16146 7.68229 6.79688 8.04688C6.43229 8.41146 6.25 8.85417 6.25 9.375C6.25 9.89583 6.43229 10.3385 6.79688 10.7031C7.16146 11.0677 7.60417 11.25 8.125 11.25ZM12.5 14.375C11.0833 14.375 9.79688 14.776 8.64062 15.5781C7.48438 16.3802 6.64583 17.4375 6.125 18.75H8.1875C8.64583 17.9792 9.25521 17.3698 10.0156 16.9219C10.776 16.474 11.6042 16.25 12.5 16.25C13.3958 16.25 14.224 16.474 14.9844 16.9219C15.7448 17.3698 16.3542 17.9792 16.8125 18.75H18.875C18.3542 17.4375 17.5156 16.3802 16.3594 15.5781C15.2031 14.776 13.9167 14.375 12.5 14.375ZM12.5 25C10.7708 25 9.14583 24.6719 7.625 24.0156C6.10417 23.3594 4.78125 22.4688 3.65625 21.3438C2.53125 20.2188 1.64062 18.8958 0.984375 17.375C0.328125 15.8542 0 14.2292 0 12.5C0 10.7708 0.328125 9.14583 0.984375 7.625C1.64062 6.10417 2.53125 4.78125 3.65625 3.65625C4.78125 2.53125 6.10417 1.64062 7.625 0.984375C9.14583 0.328125 10.7708 0 12.5 0C14.2292 0 15.8542 0.328125 17.375 0.984375C18.8958 1.64062 20.2188 2.53125 21.3438 3.65625C22.4688 4.78125 23.3594 6.10417 24.0156 7.625C24.6719 9.14583 25 10.7708 25 12.5C25 14.2292 24.6719 15.8542 24.0156 17.375C23.3594 18.8958 22.4688 20.2188 21.3438 21.3438C20.2188 22.4688 18.8958 23.3594 17.375 24.0156C15.8542 24.6719 14.2292 25 12.5 25Z',
    fill: '#EF4444',
  },
};
const RADAR_SIZE = 320;
const RADAR_CENTER = RADAR_SIZE / 2;
const RADAR_RADIUS = 96;
const RADAR_LEVELS = 4;
const SESSION_GAP_MINUTES = 30;
const COUNTED_GAP_CAP_MINUTES = 5;
const RADAR_ICON_SIZE = 28;
const RADAR_LABEL_WIDTH = 118;
const RADAR_LABEL_HEIGHT = 14;
const RADAR_LABEL_GAP = 8;

const formatStudyDuration = (minutes: number): string => {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  return `${minutes}m`;
};

export default function ProfileScreen() {
  const router = useSafeRouter();
  const [moodHistory, setMoodHistory] = useState<MoodRecord[]>([]);
  const [studyMinutes, setStudyMinutes] = useState(0);
  const [todayDrops, setTodayDrops] = useState(0);
  const [totalDays, setTotalDays] = useState(0);
  const [selectedStamp, setSelectedStamp] = useState<MindGardenStampProgress | null>(null);
  const [dailyDrops, setDailyDrops] = useState<Record<string, number>>({});

  const loadData = useCallback(async () => {
    const [history, chats, dropsToday, allDrops] = await Promise.all([
      getMoodHistory(),
      getChatHistory(),
      getTodayDrops(),
      getDailyDrops(),
    ]);
    const uniqueDays = new Set(history.map((record) => record.date));

    const timedMessages = chats
      .filter((message) => message.role !== 'system')
      .map((message) => message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp))
      .sort((left, right) => left.getTime() - right.getTime());

    let estimatedMinutes = 0;
    for (let index = 1; index < timedMessages.length; index += 1) {
      const gapMinutes = Math.round((timedMessages[index].getTime() - timedMessages[index - 1].getTime()) / 60000);
      if (gapMinutes > 0 && gapMinutes <= SESSION_GAP_MINUTES) {
        estimatedMinutes += Math.min(gapMinutes, COUNTED_GAP_CAP_MINUTES);
      }
    }

    if (timedMessages.length > 0) {
      estimatedMinutes = Math.max(estimatedMinutes, 1);
    }

    setMoodHistory(history);
    setStudyMinutes(estimatedMinutes);
    setTodayDrops(dropsToday);
    setTotalDays(uniqueDays.size);
    setDailyDrops(allDrops);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const mindGardenState = useMemo(() => computeMindGardenState(dailyDrops), [dailyDrops]);
  const totalDrops = useMemo(() => getTotalDrops(dailyDrops), [dailyDrops]);

  const currentStage = mindGardenState.currentStage;

  const resolvedSelectedStamp = useMemo(() => {
    if (mindGardenState.stamps.length === 0) {
      return null;
    }

    if (selectedStamp) {
      const matched = mindGardenState.stamps.find((stamp) => stamp.key === selectedStamp.key);
      if (matched) return matched;
    }

    return currentStage || mindGardenState.stamps.find((stamp) => stamp.unlocked) || mindGardenState.stamps[0] || null;
  }, [currentStage, mindGardenState.stamps, selectedStamp]);

  const getStampRequirementCopy = (stamp: MindGardenStampProgress): string => {
    const stageIndex = mindGardenState.stamps.findIndex((item) => item.key === stamp.key);
    const previousStamp = stageIndex > 0 ? mindGardenState.stamps[stageIndex - 1] : null;
    const prerequisite = previousStamp
      ? `Unlock "${previousStamp.englishLabel}" first, then complete ${stamp.targetDays} full 5-drop day(s).`
      : 'Complete your first full 5-drop day to unlock this stamp.';

    if (stamp.unlocked) {
      return `${prerequisite} Unlocked on ${formatShortDate(stamp.unlockDate)}.`;
    }

    if (stamp.isCurrent) {
      return `${prerequisite} Current progress: ${stamp.progressDays}/${stamp.targetDays}. Progress only increases when Learning Drop reaches 5/5 for the day.`;
    }

    return prerequisite;
  };

  const getStampStatusCopy = (stamp: MindGardenStampProgress): string => {
    if (stamp.unlocked) return 'Unlocked';
    if (stamp.isCurrent) return 'Current challenge';
    return 'Locked';
  };

  const getMoodTrend = (): MoodTrendItem[] => {
    const today = new Date();
    const trend: MoodTrendItem[] = [];

    for (let index = 6; index >= 0; index -= 1) {
      const date = new Date(today);
      date.setDate(date.getDate() - index);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const record = moodHistory.find((item) => item.date === dateStr);
      trend.push({
        mood: record?.mood || 'Calm',
        date: dateStr,
      });
    }

    return trend;
  };

  const getMoodDistribution = (): Record<MoodType, number> => {
    const distribution: Record<MoodType, number> = {
      Crushed: 0,
      Stuck: 0,
      Calm: 0,
      Engaged: 0,
      Hyper: 0,
    };

    moodHistory.forEach((record) => {
      distribution[record.mood] += 1;
    });

    return distribution;
  };

  const handleOpenDailyReport = useCallback(() => {
    router.push('/tutor', {
      openReport: true,
      reportLaunchToken: Date.now(),
      entrySource: 'profile_stats',
    });
  }, [router]);

  const performClearHistory = useCallback(async () => {
    await clearChatHistory();
    setSelectedStamp(null);
    await loadData();

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert('History has been removed.');
      return;
    }

    Alert.alert('Cleared', 'History has been removed.');
  }, [loadData]);

  const handleClearData = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm('Clear AI Tutor history? This action cannot be undone.');
      if (!confirmed) {
        return;
      }

      void performClearHistory();
      return;
    }

    Alert.alert('Clear History', 'Clear AI Tutor history? This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        style: 'destructive',
        onPress: () => {
          void performClearHistory();
        },
      },
    ]);
  }, [performClearHistory]);

  const moodTrend = getMoodTrend();
  const moodDistribution = getMoodDistribution();
  const maxMoodCount = Math.max(...Object.values(moodDistribution), 1);
  const focusStamp = resolvedSelectedStamp || currentStage;
  const focusProgressRatio = focusStamp
    ? Math.min(1, focusStamp.progressDays / focusStamp.targetDays)
    : 1;

  const radarAxes = useMemo(() => {
    return MOOD_ORDER.map((mood, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / MOOD_ORDER.length;
      const outerX = RADAR_CENTER + Math.cos(angle) * RADAR_RADIUS;
      const outerY = RADAR_CENTER + Math.sin(angle) * RADAR_RADIUS;
      const value = moodDistribution[mood];
      const ratio = value / maxMoodCount;
      const pointX = RADAR_CENTER + Math.cos(angle) * RADAR_RADIUS * ratio;
      const pointY = RADAR_CENTER + Math.sin(angle) * RADAR_RADIUS * ratio;

      return {
        mood,
        angle,
        outerX,
        outerY,
        pointX,
        pointY,
        value,
      };
    });
  }, [maxMoodCount, moodDistribution]);

  const radarPolygonPoints = useMemo(
    () => radarAxes.map((axis) => `${axis.pointX},${axis.pointY}`).join(' '),
    [radarAxes]
  );

  const radarGridPolygons = useMemo(
    () => Array.from({ length: RADAR_LEVELS }, (_, levelIndex) => {
      const ratio = (levelIndex + 1) / RADAR_LEVELS;
      return radarAxes
        .map((axis) => {
          const x = RADAR_CENTER + (axis.outerX - RADAR_CENTER) * ratio;
          const y = RADAR_CENTER + (axis.outerY - RADAR_CENTER) * ratio;
          return `${x},${y}`;
        })
        .join(' ');
    }),
    [radarAxes]
  );

  const radarMetaAnchors = useMemo(
    () => radarAxes.map((axis) => {
      const iconOffset = RADAR_RADIUS + 28;
      const iconX = RADAR_CENTER + Math.cos(axis.angle) * iconOffset;
      const iconY = RADAR_CENTER + Math.sin(axis.angle) * iconOffset;
      const labelLeft = Math.min(
        Math.max(iconX - RADAR_LABEL_WIDTH / 2, 0),
        RADAR_SIZE - RADAR_LABEL_WIDTH
      );
      const labelTop = Math.min(
        iconY + RADAR_ICON_SIZE / 2 + RADAR_LABEL_GAP,
        RADAR_SIZE - RADAR_LABEL_HEIGHT
      );

      return {
        mood: axis.mood,
        value: axis.value,
        iconX,
        iconY,
        labelLeft,
        labelTop,
      };
    }),
    [radarAxes]
  );

  return (
    <Screen backgroundColor={TOKENS.colors.background}>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        <View className="px-5 pt-3">
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -36,
              left: -54,
              width: 208,
              height: 208,
              borderRadius: 999,
              backgroundColor: TOKENS.colors.pinkOrb,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 134,
              right: -68,
              width: 220,
              height: 220,
              borderRadius: 999,
              backgroundColor: TOKENS.colors.purpleOrb,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 446,
              left: -82,
              width: 240,
              height: 240,
              borderRadius: 999,
              backgroundColor: TOKENS.colors.blueOrb,
            }}
          />

          <View
            className="rounded-[32px] border px-5 pb-6 pt-4 mb-5"
            style={{
              ...CARD_SHADOW,
              borderColor: TOKENS.colors.borderSoft,
              backgroundColor: TOKENS.colors.surface,
            }}
          >
            <View className="flex-row items-center justify-center">
              <Text
                className="text-[28px] leading-[36px] font-bold tracking-[-0.56px]"
                style={{ color: TOKENS.colors.primary }}
              >
                Profile
              </Text>
            </View>

            <View className="items-center mt-7">
              <View
                className="w-24 h-24 rounded-full border-[3px] items-center justify-center"
                style={{
                  borderColor: TOKENS.colors.borderSoft,
                  backgroundColor: TOKENS.colors.surfaceMuted,
                }}
              >
                <FontAwesome6 name="user" size={35} color={TOKENS.colors.mutedText} />
              </View>

              <Text className="text-[20px] leading-[28px] font-semibold mt-5 text-center" style={{ color: TOKENS.colors.text }}>
                Alex W
              </Text>
            </View>
          </View>

          <View className="mb-5">
            <Text className="text-[20px] leading-[28px] font-semibold mb-3" style={{ color: TOKENS.colors.text }}>
              My Study Stats
            </Text>
            <View
              className="rounded-[24px] border p-4"
              style={{
                ...CARD_SHADOW,
                borderColor: TOKENS.colors.borderSoft,
                backgroundColor: TOKENS.colors.surface,
              }}
            >
              <View className="flex-row gap-3">
                <StatCard
                  title="Total Drops"
                  value={totalDrops}
                  icon="droplet"
                  iconBackground="#ffe3ea"
                  iconColor={TOKENS.colors.primaryMuted}
                />
                <StatCard
                  title="Study Days"
                  value={totalDays}
                  icon="calendar"
                  iconBackground="#ece5ff"
                  iconColor={TOKENS.colors.secondary}
                />
                <StatCard
                  title="Study Time"
                  value={formatStudyDuration(studyMinutes)}
                  icon="stopwatch"
                  iconBackground="#e0ebff"
                  iconColor={TOKENS.colors.tertiary}
                />
              </View>

              <TouchableOpacity
                activeOpacity={0.75}
                onPress={handleOpenDailyReport}
                className="mt-4 rounded-[16px] border px-4 py-3 flex-row items-center justify-between"
                style={{
                  borderColor: TOKENS.colors.border,
                  backgroundColor: '#fff5f8',
                }}
              >
                <View className="flex-row items-center flex-1">
                  <View
                    className="w-8 h-8 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: '#ffd9e4' }}
                  >
                    <FontAwesome6 name="chart-line" size={14} color={TOKENS.colors.primaryMuted} />
                  </View>
                  <Text className="text-[14px] leading-[20px] font-semibold" style={{ color: TOKENS.colors.primaryMuted }}>
                    Tap to view my daily learning report
                  </Text>
                </View>
                <FontAwesome6 name="arrow-up-right-from-square" size={14} color={TOKENS.colors.primaryMuted} />
              </TouchableOpacity>
            </View>
          </View>

          <View className="mb-5">
            <Text className="text-[20px] leading-[28px] font-semibold mb-3" style={{ color: TOKENS.colors.text }}>
              Mind Garden
            </Text>
            <View
              className="rounded-[32px] border px-4 py-5"
              style={{
                ...CARD_SHADOW,
                borderColor: TOKENS.colors.borderSoft,
                backgroundColor: '#f7f8fa',
              }}
            >
              <View className="flex-row flex-wrap justify-between gap-y-8 pt-2 px-1">
                {mindGardenState.stamps.map((stamp) => {
                  return (
                    <TouchableOpacity
                      key={stamp.key}
                      activeOpacity={0.85}
                      onPress={() => setSelectedStamp(stamp)}
                      className="w-[48%] rounded-[20px] px-2 py-1 items-center"
                      style={{ backgroundColor: 'transparent' }}
                    >
                      <View
                        className="w-[84px] h-[84px] rounded-full items-center justify-center mb-3"
                        style={{
                          borderWidth: 2,
                          borderStyle: 'dashed',
                          borderColor: stamp.unlocked ? `${stamp.accentColor}50` : '#bcbec5',
                          backgroundColor: 'transparent',
                        }}
                      >
                        <FontAwesome6
                          name={stamp.icon as any}
                          size={26}
                          color={stamp.unlocked ? stamp.accentColor : '#a4a6ad'}
                        />
                      </View>
                      <Text className="text-[14px] leading-[20px]" style={{ color: '#6d6f76' }}>
                        {stamp.englishLabel}
                      </Text>
                      <View className="w-14 h-[4px] rounded-full mt-2" style={{ backgroundColor: '#e2e4e9' }} />
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View
                className="mt-7 rounded-[20px] border px-4 py-4"
                style={{
                  borderColor: '#d8dbe1',
                  backgroundColor: '#f8f9fb',
                }}
              >
                {focusStamp ? (
                  <Text className="text-[30px] leading-[32px] font-semibold" style={{ color: '#2e3139' }}>
                    {focusStamp.progressDays}/{focusStamp.targetDays}
                  </Text>
                ) : null}

                <View className="mt-3 h-[8px] rounded-full overflow-hidden" style={{ backgroundColor: '#e1e3e8' }}>
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${focusProgressRatio * 100}%`,
                      backgroundColor: focusStamp?.accentColor || '#bcc1cb',
                    }}
                  />
                </View>

                <Text className="text-[14px] leading-[20px] font-medium mt-5" style={{ color: '#1f2229' }}>
                  {resolvedSelectedStamp
                    ? `Current target · ${resolvedSelectedStamp.englishLabel}`
                    : currentStage
                      ? `Current target · ${currentStage.englishLabel}`
                      : 'Mind Garden complete'}
                </Text>
                <Text className="text-[12px] leading-[18px] mt-2" style={{ color: TOKENS.colors.mutedText }}>
                  {resolvedSelectedStamp
                    ? getStampRequirementCopy(resolvedSelectedStamp)
                    : currentStage
                      ? `Fill Learning Drop to ${DAILY_DROP_LIMIT}/${DAILY_DROP_LIMIT} on ${currentStage.targetDays} qualified day(s). Progress only increases on full-goal days.`
                      : 'You have completed all four stages. Keep learning to maintain your rhythm.'}
                </Text>
                {resolvedSelectedStamp ? (
                  <Text className="text-[12px] leading-[16px] font-semibold mt-2" style={{ color: resolvedSelectedStamp.accentColor }}>
                    {getStampStatusCopy(resolvedSelectedStamp)}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

          <View className="mb-5">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-[20px] leading-[28px] font-semibold" style={{ color: TOKENS.colors.text }}>
                Mood Trend
              </Text>
              <View className="rounded-full px-4 py-2" style={{ backgroundColor: '#edeef1' }}>
                <Text className="text-[12px] leading-[16px] font-semibold" style={{ color: '#5f646d' }}>
                  Last 7 Days
                </Text>
              </View>
            </View>

            <View
              className="rounded-[30px] border px-4 py-6"
              style={{
                ...CARD_SHADOW,
                borderColor: TOKENS.colors.borderSoft,
                backgroundColor: '#f8f9fb',
              }}
            >
              <View className="flex-row justify-between items-end px-1">
                {moodTrend.map((item, index) => (
                  <View key={item.date} className="items-center">
                    <FontAwesome6
                      name={MOOD_CONFIG[item.mood].icon as any}
                      size={24}
                      color={MOOD_CONFIG[item.mood].color}
                    />
                    <Text className="text-[12px] leading-[16px] mt-2" style={{ color: '#5a5f68' }}>
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index]}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View className="mb-5">
            <Text className="text-[20px] leading-[28px] font-semibold mb-3" style={{ color: TOKENS.colors.text }}>
              Mood Distribution
            </Text>
            <View
              className="rounded-[30px] border px-4 py-5"
              style={{
                ...CARD_SHADOW,
                borderColor: TOKENS.colors.borderSoft,
                backgroundColor: '#f8f9fb',
              }}
            >
              <View className="items-center justify-center rounded-[24px] border py-4" style={{ borderColor: '#e5e7eb', backgroundColor: '#f8f9fb' }}>
                <View style={{ width: RADAR_SIZE, height: RADAR_SIZE, position: 'relative' }}>
                  <Svg width={RADAR_SIZE} height={RADAR_SIZE}>
                    {radarGridPolygons.map((points, index) => (
                      <Polygon
                        key={`grid-${index}`}
                        points={points}
                        fill={index === RADAR_LEVELS - 1 ? '#f8f9fb' : 'transparent'}
                        stroke="#cfd2d8"
                        strokeWidth={1}
                      />
                    ))}

                    {radarAxes.map((axis) => (
                      <Line
                        key={`axis-${axis.mood}`}
                        x1={RADAR_CENTER}
                        y1={RADAR_CENTER}
                        x2={axis.outerX}
                        y2={axis.outerY}
                        stroke="#cfd2d8"
                        strokeWidth={1}
                      />
                    ))}

                    <Polygon
                      points={radarPolygonPoints}
                      fill="rgba(255, 0, 64, 0.16)"
                      stroke={TOKENS.colors.primary}
                      strokeWidth={2.5}
                    />

                    {radarAxes.map((axis) => (
                      <Circle
                        key={`point-${axis.mood}`}
                        cx={axis.pointX}
                        cy={axis.pointY}
                        r={5}
                        fill={TOKENS.colors.primary}
                      />
                    ))}
                  </Svg>

                  {radarMetaAnchors.map((anchor) => (
                    <View
                      key={`icon-${anchor.mood}`}
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        left: anchor.iconX - RADAR_ICON_SIZE / 2,
                        top: anchor.iconY - RADAR_ICON_SIZE / 2,
                        width: RADAR_ICON_SIZE,
                        height: RADAR_ICON_SIZE,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Svg
                        width={RADAR_ICON_SIZE}
                        height={RADAR_ICON_SIZE}
                        viewBox={`0 0 ${MOOD_EMOJI_ASSET[anchor.mood].width} ${MOOD_EMOJI_ASSET[anchor.mood].height}`}
                      >
                        <Path d={MOOD_EMOJI_ASSET[anchor.mood].path} fill={MOOD_EMOJI_ASSET[anchor.mood].fill} />
                      </Svg>
                    </View>
                  ))}

                  {radarMetaAnchors.map((anchor) => (
                    <View
                      key={`label-${anchor.mood}`}
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        left: anchor.labelLeft,
                        top: anchor.labelTop,
                        width: RADAR_LABEL_WIDTH,
                        alignItems: 'center',
                      }}
                    >
                      <Text className="text-[11px] leading-[14px] font-medium text-center" style={{ color: '#272b34' }}>
                        {`${MOOD_CONFIG[anchor.mood].label} (${anchor.value})`}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>

          <View className="mb-6">
            <View
              className="rounded-[24px] border overflow-hidden p-4"
              style={{
                ...CARD_SHADOW,
                borderColor: TOKENS.colors.borderSoft,
                backgroundColor: TOKENS.colors.surface,
              }}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push('/tutor')}
                className="rounded-xl px-5 py-[16px] items-center justify-center"
                style={{ backgroundColor: TOKENS.colors.primary }}
              >
                <Text className="text-[16px] leading-[24px] text-white font-semibold">Start Learning</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleClearData}
                className="rounded-xl border px-5 py-[16px] items-center justify-center mt-4"
                style={{ borderColor: TOKENS.colors.border, backgroundColor: TOKENS.colors.surface }}
              >
                <Text className="text-[16px] leading-[24px] font-semibold" style={{ color: TOKENS.colors.primaryMuted }}>
                  Clear History
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
