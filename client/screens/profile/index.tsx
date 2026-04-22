import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';
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
  clearAllData,
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

const MOOD_ORDER: MoodType[] = ['Crushed', 'Stuck', 'Calm', 'Engaged', 'Hyper'];
const RADAR_SIZE = 240;
const RADAR_CENTER = RADAR_SIZE / 2;
const RADAR_RADIUS = 78;
const RADAR_LEVELS = 4;
const SESSION_GAP_MINUTES = 30;
const COUNTED_GAP_CAP_MINUTES = 5;

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

  const handleClearData = () => {
    Alert.alert('Clear Data', 'Are you sure you want to clear all data? This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          await clearAllData();
          setSelectedStamp(null);
          await loadData();
          Alert.alert('Cleared', 'All data has been removed.');
        },
      },
    ]);
  };

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
      const labelX = RADAR_CENTER + Math.cos(angle) * (RADAR_RADIUS + 28);
      const labelY = RADAR_CENTER + Math.sin(angle) * (RADAR_RADIUS + 28);
      const value = moodDistribution[mood];
      const ratio = value / maxMoodCount;
      const pointX = RADAR_CENTER + Math.cos(angle) * RADAR_RADIUS * ratio;
      const pointY = RADAR_CENTER + Math.sin(angle) * RADAR_RADIUS * ratio;

      return {
        mood,
        outerX,
        outerY,
        labelX,
        labelY,
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
            <View className="flex-row items-center justify-between">
              <View className="w-9 h-9 rounded-xl items-center justify-center" style={{ backgroundColor: TOKENS.colors.surfaceSubtle }}>
                <FontAwesome6 name="bars" size={15} color={TOKENS.colors.text} />
              </View>
              <Text
                className="text-[28px] leading-[36px] font-bold tracking-[-0.56px]"
                style={{ color: TOKENS.colors.primary }}
              >
                Profile
              </Text>
              <View className="w-9 h-9 rounded-xl items-center justify-center" style={{ backgroundColor: TOKENS.colors.surfaceSubtle }}>
                <FontAwesome6 name="gear" size={16} color={TOKENS.colors.text} />
              </View>
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

              <Text className="text-[14px] leading-[20px] mt-5 text-center" style={{ color: TOKENS.colors.mutedText }}>
                Track your learning journey
              </Text>

              <View className="mt-4 rounded-full px-4 py-2 flex-row items-center" style={{ backgroundColor: TOKENS.colors.surfaceSubtle }}>
                <View className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: TOKENS.colors.primary }} />
                <Text className="text-[14px] leading-[20px]" style={{ color: TOKENS.colors.mutedText }}>
                  Today Drops {todayDrops}/{DAILY_DROP_LIMIT}
                </Text>
              </View>
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
              className="rounded-[24px] border p-4"
              style={{
                ...CARD_SHADOW,
                borderColor: TOKENS.colors.borderSoft,
                backgroundColor: TOKENS.colors.surface,
              }}
            >
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-[16px] leading-[24px] font-medium" style={{ color: TOKENS.colors.text }}>
                  Mood Distribution
                </Text>
                <Text className="text-[12px] leading-[16px] font-semibold" style={{ color: TOKENS.colors.mutedText }}>
                  {moodHistory.length} total records
                </Text>
              </View>

              <View className="items-center justify-center rounded-[24px] border py-4" style={{ borderColor: TOKENS.colors.borderSoft, backgroundColor: TOKENS.colors.surfaceSubtle }}>
                <Svg width={RADAR_SIZE} height={RADAR_SIZE}>
                  {radarGridPolygons.map((points, index) => (
                    <Polygon
                      key={`grid-${index}`}
                      points={points}
                      fill={index === RADAR_LEVELS - 1 ? '#f9f5f7' : 'transparent'}
                      stroke="#d4d7dc"
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
                      stroke="#d4d7dc"
                      strokeWidth={1}
                    />
                  ))}

                  <Polygon
                    points={radarPolygonPoints}
                    fill="rgba(255, 0, 64, 0.18)"
                    stroke={TOKENS.colors.primary}
                    strokeWidth={2.5}
                  />

                  {radarAxes.map((axis) => (
                    <Circle
                      key={`point-${axis.mood}`}
                      cx={axis.pointX}
                      cy={axis.pointY}
                      r={4.5}
                      fill={TOKENS.colors.primary}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ))}

                  {radarAxes.map((axis) => (
                    <SvgText
                      key={`label-${axis.mood}`}
                      x={axis.labelX}
                      y={axis.labelY}
                      fontSize="11"
                      fontWeight="600"
                      fill={TOKENS.colors.mutedText}
                      textAnchor="middle"
                    >
                      {MOOD_CONFIG[axis.mood].label}
                    </SvgText>
                  ))}
                </Svg>
              </View>

              <View className="flex-row flex-wrap justify-between gap-y-3 mt-4">
                {MOOD_ORDER.map((mood) => (
                  <View
                    key={mood}
                    className="w-[48%] rounded-2xl px-3 py-3 border"
                    style={{ borderColor: TOKENS.colors.borderSoft, backgroundColor: TOKENS.colors.surfaceSubtle }}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center flex-1 pr-2">
                        <FontAwesome6 name={MOOD_CONFIG[mood].icon as any} size={13} color={MOOD_CONFIG[mood].color} />
                        <Text className="text-[14px] leading-[20px] ml-2" style={{ color: TOKENS.colors.text }}>
                          {MOOD_CONFIG[mood].label}
                        </Text>
                      </View>
                      <Text className="text-[12px] leading-[16px] font-semibold" style={{ color: TOKENS.colors.mutedText }}>
                        {moodDistribution[mood]}
                      </Text>
                    </View>
                  </View>
                ))}
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
                  Clear Data
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
