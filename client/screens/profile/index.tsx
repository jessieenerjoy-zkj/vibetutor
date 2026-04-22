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
  color: string;
}

const StatCard = ({ title, value, icon, color }: StatCardProps) => (
  <View
    className="flex-1 bg-[var(--color-surface)] p-4 rounded-2xl items-center"
    style={{
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 1,
    }}
  >
    <View className={`w-10 h-10 ${color} rounded-full items-center justify-center mb-2`}>
      <FontAwesome6 name={icon as any} size={16} color="#fff" />
    </View>
    <Text className="text-xl font-bold text-[var(--color-foreground)]">{value}</Text>
    <Text className="text-xs text-[var(--color-muted)] mt-1 text-center">{title}</Text>
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
    <Screen>
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        <View className="px-5 pt-4 pb-6">
          <Text className="text-2xl font-bold text-[var(--color-foreground)] tracking-tight">
            Profile
          </Text>
          <Text className="text-sm text-[var(--color-muted)] mt-1">
            Track your learning journey
          </Text>
        </View>

        <View className="px-5 mb-6">
          <View
            className="bg-[var(--color-surface)] rounded-3xl p-5"
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.04,
              shadowRadius: 8,
              elevation: 1,
            }}
          >
            <Text className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider mb-4">
              My Study Stats
            </Text>
            <View className="flex-row gap-3">
              <StatCard title="Total Drops" value={totalDrops} icon="droplet" color="bg-[#0284C7]" />
              <StatCard title="Study Days" value={totalDays} icon="calendar" color="bg-[#8E7431]" />
              <StatCard title="Study Time" value={formatStudyDuration(studyMinutes)} icon="clock" color="bg-[#10B981]" />
            </View>
          </View>
        </View>

        <View className="px-5 mb-6">
          <View
            className="bg-[var(--color-surface)] rounded-3xl p-5"
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.04,
              shadowRadius: 8,
              elevation: 1,
            }}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider">
                Mind Garden
              </Text>
              <Text className="text-xs text-[var(--color-muted)]">
                {mindGardenState.completed ? 'All stamps unlocked' : 'Sequential unlock'}
              </Text>
            </View>

            <View className="flex-row flex-wrap justify-between gap-y-4">
              {mindGardenState.stamps.map((stamp) => {
                const progressRatio = Math.min(1, stamp.progressDays / stamp.targetDays);
                return (
                  <TouchableOpacity
                    key={stamp.key}
                    activeOpacity={0.85}
                    onPress={() => setSelectedStamp(stamp)}
                    className="w-[48%] rounded-[24px] px-4 py-4"
                    style={{
                      backgroundColor: stamp.unlocked ? `${stamp.accentColor}14` : '#F3F4F6',
                      borderWidth: 1,
                      borderColor: stamp.unlocked ? `${stamp.accentColor}40` : '#E5E7EB',
                    }}
                  >
                    <View
                      className="w-14 h-14 rounded-full items-center justify-center mb-3"
                      style={{
                        backgroundColor: stamp.unlocked ? `${stamp.accentColor}22` : '#E5E7EB',
                      }}
                    >
                      <FontAwesome6
                        name={stamp.icon as any}
                        size={24}
                        color={stamp.unlocked ? stamp.accentColor : '#9CA3AF'}
                      />
                    </View>
                    <Text className="text-sm font-semibold text-[var(--color-foreground)]">
                      {stamp.englishLabel}
                    </Text>
                    <Text className="text-xs text-[var(--color-muted)] mt-1">
                      {stamp.unlocked ? `Unlocked · ${formatShortDate(stamp.unlockDate)}` : `${stamp.progressDays}/${stamp.targetDays} days`}
                    </Text>
                    <View className="mt-3 h-2 rounded-full bg-white/70 overflow-hidden">
                      <View
                        className="h-full rounded-full"
                        style={{
                          width: `${progressRatio * 100}%`,
                          backgroundColor: stamp.unlocked ? stamp.accentColor : '#9CA3AF',
                        }}
                      />
                    </View>
                    {stamp.isCurrent && !stamp.unlocked ? (
                      <Text className="text-[11px] mt-2" style={{ color: stamp.accentColor }}>
                        Current challenge
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View className="mt-5 rounded-2xl bg-[#F8FAFC] px-4 py-4">
              <Text className="text-sm font-semibold text-[var(--color-foreground)]">
                {resolvedSelectedStamp
                  ? `Current target · ${resolvedSelectedStamp.englishLabel}`
                  : currentStage
                    ? `Current target · ${currentStage.englishLabel}`
                    : 'Mind Garden complete'}
              </Text>
              <Text className="text-xs text-[var(--color-muted)] mt-1 leading-5">
                {resolvedSelectedStamp
                  ? getStampRequirementCopy(resolvedSelectedStamp)
                  : currentStage
                    ? `Fill Learning Drop to ${DAILY_DROP_LIMIT}/${DAILY_DROP_LIMIT} on ${currentStage.targetDays} qualified day(s). Progress only increases on full-goal days.`
                    : 'You have completed all four stages. Keep learning to maintain your rhythm.'}
              </Text>
              {resolvedSelectedStamp ? (
                <Text className="text-xs mt-3" style={{ color: resolvedSelectedStamp.accentColor }}>
                  {getStampStatusCopy(resolvedSelectedStamp)}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <View className="px-5 mb-6">
          <View
            className="bg-[var(--color-surface)] rounded-3xl p-5"
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.04,
              shadowRadius: 8,
              elevation: 1,
            }}
          >
            <Text className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider mb-4">
              Mood Trend · Last 7 Days
            </Text>
            <View className="flex-row justify-between items-end mb-5">
              {moodTrend.map((item, index) => (
                <View key={item.date} className="items-center">
                  <FontAwesome6
                    name={MOOD_CONFIG[item.mood].icon as any}
                    size={22}
                    color={MOOD_CONFIG[item.mood].color}
                  />
                  <Text className="text-xs text-[var(--color-muted)] mt-1.5">
                    {index === 6 ? 'Today' : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][index]}
                  </Text>
                </View>
              ))}
            </View>
            <View className="flex-row justify-center gap-4 pt-3 border-t border-[var(--color-separator)]">
              {(Object.keys(MOOD_CONFIG) as MoodType[]).map((mood) => (
                <View key={mood} className="flex-row items-center">
                  <FontAwesome6 name={MOOD_CONFIG[mood].icon as any} size={10} color={MOOD_CONFIG[mood].color} />
                  <Text className="text-xs text-[var(--color-muted)] ml-1">
                    {MOOD_CONFIG[mood].label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View className="px-5 mb-6">
          <View
            className="bg-[var(--color-surface)] rounded-3xl p-5"
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.04,
              shadowRadius: 8,
              elevation: 1,
            }}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider">
                Mood Distribution
              </Text>
              <Text className="text-xs text-[var(--color-muted)]">
                {moodHistory.length} total records
              </Text>
            </View>

            <View className="items-center justify-center rounded-[28px] bg-[#F8FAFC] py-4">
              <Svg width={RADAR_SIZE} height={RADAR_SIZE}>
                {radarGridPolygons.map((points, index) => (
                  <Polygon
                    key={`grid-${index}`}
                    points={points}
                    fill={index === RADAR_LEVELS - 1 ? '#F8FAFC' : 'transparent'}
                    stroke="#D6DCE5"
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
                    stroke="#D6DCE5"
                    strokeWidth={1}
                  />
                ))}

                <Polygon
                  points={radarPolygonPoints}
                  fill="rgba(14, 165, 233, 0.18)"
                  stroke="#0EA5E9"
                  strokeWidth={2.5}
                />

                {radarAxes.map((axis) => (
                  <Circle
                    key={`point-${axis.mood}`}
                    cx={axis.pointX}
                    cy={axis.pointY}
                    r={4.5}
                    fill={MOOD_CONFIG[axis.mood].color}
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
                    fill="#5B6472"
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
                  className="w-[48%] rounded-2xl px-3 py-3 bg-[#F8FAFC]"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1 pr-2">
                      <FontAwesome6 name={MOOD_CONFIG[mood].icon as any} size={13} color={MOOD_CONFIG[mood].color} />
                      <Text className="text-sm text-[var(--color-foreground)] ml-2">
                        {MOOD_CONFIG[mood].label}
                      </Text>
                    </View>
                    <Text className="text-xs font-semibold text-[var(--color-muted)]">
                      {moodDistribution[mood]}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View className="px-5 mb-6">
          <View
            className="bg-[var(--color-surface)] rounded-3xl overflow-hidden"
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.04,
              shadowRadius: 8,
              elevation: 1,
            }}
          >
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push('/tutor')}
              className="flex-row items-center justify-between px-5 py-4"
            >
              <View className="flex-row items-center">
                <View className="w-10 h-10 bg-[#8E7431]/10 rounded-full items-center justify-center mr-3">
                  <FontAwesome6 name="robot" size={18} color="#8E7431" />
                </View>
                <Text className="text-sm text-[var(--color-foreground)]">Start Learning</Text>
              </View>
              <FontAwesome6 name="chevron-right" size={14} color="var(--color-muted)" />
            </TouchableOpacity>
            <View className="h-px bg-[var(--color-separator)] mx-5" />
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleClearData}
              className="flex-row items-center justify-between px-5 py-4"
            >
              <View className="flex-row items-center">
                <View className="w-10 h-10 bg-[#FF3B30]/10 rounded-full items-center justify-center mr-3">
                  <FontAwesome6 name="trash" size={18} color="#FF3B30" />
                </View>
                <Text className="text-sm text-[#FF3B30]">Clear Data</Text>
              </View>
              <FontAwesome6 name="chevron-right" size={14} color="var(--color-muted)" />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
