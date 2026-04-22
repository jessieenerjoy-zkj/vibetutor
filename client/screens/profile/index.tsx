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

const CARD_SHADOW = {
  shadowColor: '#251b2d',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 2,
};

const StatCard = ({ title, value, icon, iconBackground, iconColor }: StatCardProps) => (
  <View
    className="flex-1 rounded-3xl border border-[#d8d5df] bg-[#f7f6fa] px-3 py-4 items-center"
    style={{
      ...CARD_SHADOW,
      shadowOpacity: 0.05,
      shadowRadius: 12,
    }}
  >
    <View
      className="w-10 h-10 rounded-full items-center justify-center mb-3"
      style={{ backgroundColor: iconBackground }}
    >
      <FontAwesome6 name={icon as any} size={15} color={iconColor} />
    </View>
    <Text className="text-[42px] leading-[42px] font-bold text-[#17131d] tracking-tight">{value}</Text>
    <Text className="text-[21px] leading-[22px] text-[#2a2630] mt-1 text-center">{title}</Text>
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
    <Screen backgroundColor="#e8e6ee">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        <View className="px-4 pt-3 pb-4">
          <View
            className="rounded-[28px] border border-[#ebe9f0] bg-[#f7f6fa] px-5 pb-6 pt-4"
            style={CARD_SHADOW}
          >
            <View className="flex-row items-center justify-between">
              <View className="w-9 h-9 rounded-xl bg-[#eceaf2] items-center justify-center">
                <FontAwesome6 name="bars" size={15} color="#313046" />
              </View>
              <Text className="text-[34px] leading-[36px] font-semibold text-[#ff0a47] tracking-tight">Profile</Text>
              <View className="w-9 h-9 rounded-xl bg-[#eceaf2] items-center justify-center">
                <FontAwesome6 name="gear" size={16} color="#313046" />
              </View>
            </View>

            <View className="items-center mt-7">
              <View className="w-24 h-24 rounded-full border-[3px] border-[#ecebf1] bg-[#d9d8df] items-center justify-center">
                <FontAwesome6 name="user" size={35} color="#5a5760" />
              </View>

              <Text className="text-[21px] leading-[24px] text-[#2b2631] mt-5 text-center">
                Track your learning journey
              </Text>

              <View className="mt-4 rounded-full px-4 py-2 bg-[#efedf4] flex-row items-center">
                <View className="w-2 h-2 rounded-full bg-[#ff0a47] mr-2" />
                <Text className="text-[19px] leading-[20px] text-[#625d6c]">
                  Today Drops {todayDrops}/{DAILY_DROP_LIMIT}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View className="px-4 mb-6">
          <Text className="text-[35px] leading-[38px] font-semibold text-[#16121c] mb-4">My Study Stats</Text>
          <View
            className="rounded-[30px] border border-[#e5e2eb] bg-[#f8f7fa] px-4 py-4"
            style={CARD_SHADOW}
          >
            <View className="flex-row gap-3">
              <StatCard
                title="Total Drops"
                value={totalDrops}
                icon="droplet"
                iconBackground="#ffd7e0"
                iconColor="#d31646"
              />
              <StatCard
                title="Study Days"
                value={totalDays}
                icon="calendar"
                iconBackground="#e3ddff"
                iconColor="#5a31f4"
              />
              <StatCard
                title="Study Time"
                value={formatStudyDuration(studyMinutes)}
                icon="stopwatch"
                iconBackground="#dae7ff"
                iconColor="#2457ba"
              />
            </View>
          </View>
        </View>

        <View className="px-4 mb-6">
          <Text className="text-[35px] leading-[38px] font-semibold text-[#16121c] mb-4">Mind Garden</Text>
          <View
            className="rounded-[30px] border border-[#e5e2eb] bg-[#f8f7fa] p-4"
            style={CARD_SHADOW}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-[21px] leading-[24px] font-semibold text-[#4d4756]">
                Mind Garden
              </Text>
              <Text className="text-[19px] leading-[20px] text-[#8f879c]">
                {mindGardenState.completed ? 'All stamps unlocked' : 'Sequential unlock'}
              </Text>
            </View>

            <View className="flex-row flex-wrap justify-between gap-y-6 pt-1">
              {mindGardenState.stamps.map((stamp) => {
                const progressRatio = Math.min(1, stamp.progressDays / stamp.targetDays);
                return (
                  <TouchableOpacity
                    key={stamp.key}
                    activeOpacity={0.85}
                    onPress={() => setSelectedStamp(stamp)}
                    className="w-[48%] rounded-[20px] px-3 py-3 items-center"
                    style={{
                      backgroundColor: stamp.unlocked ? `${stamp.accentColor}10` : '#f4f3f8',
                      borderWidth: 1,
                      borderColor: stamp.unlocked ? `${stamp.accentColor}38` : '#dfdce6',
                    }}
                  >
                    <View
                      className="w-[72px] h-[72px] rounded-full items-center justify-center mb-2"
                      style={{
                        backgroundColor: stamp.unlocked ? `${stamp.accentColor}16` : '#f0eef4',
                        borderWidth: 2,
                        borderStyle: 'dashed',
                        borderColor: stamp.unlocked ? `${stamp.accentColor}5a` : '#bdb9c8',
                      }}
                    >
                      <FontAwesome6
                        name={stamp.icon as any}
                        size={23}
                        color={stamp.unlocked ? stamp.accentColor : '#9CA3AF'}
                      />
                    </View>
                    <Text className="text-[20px] leading-[22px] text-[#5a5564]">
                      {stamp.englishLabel}
                    </Text>
                    <View className="w-12 h-[3px] rounded-full bg-[#ddd9e3] mt-2" />
                    <Text className="text-[17px] leading-[18px] text-[#8d8698] mt-2 text-center">
                      {stamp.unlocked ? `Unlocked · ${formatShortDate(stamp.unlockDate)}` : `${stamp.progressDays}/${stamp.targetDays} days`}
                    </Text>
                    <View className="mt-2 h-[6px] rounded-full bg-[#ebe7f0] overflow-hidden w-full">
                      <View
                        className="h-full rounded-full"
                        style={{
                          width: `${progressRatio * 100}%`,
                          backgroundColor: stamp.unlocked ? stamp.accentColor : '#aaa4b5',
                        }}
                      />
                    </View>
                    {stamp.isCurrent && !stamp.unlocked ? (
                      <Text className="text-[16px] leading-[17px] mt-2" style={{ color: stamp.accentColor }}>
                        Current challenge
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View className="mt-5 rounded-2xl border border-[#dedbe4] bg-[#f5f3f8] px-4 py-4">
              {focusStamp ? (
                <Text className="text-[21px] leading-[22px] font-semibold text-[#292531]">
                  {focusStamp.progressDays}/{focusStamp.targetDays}
                </Text>
              ) : null}

              <View className="mt-2 h-[7px] rounded-full bg-[#e4e0e9] overflow-hidden">
                <View
                  className="h-full rounded-full"
                  style={{
                    width: `${focusProgressRatio * 100}%`,
                    backgroundColor: focusStamp?.accentColor || '#a09aa9',
                  }}
                />
              </View>

              <Text className="text-[22px] leading-[24px] font-semibold text-[#2c2735] mt-4">
                {resolvedSelectedStamp
                  ? `Current target · ${resolvedSelectedStamp.englishLabel}`
                  : currentStage
                    ? `Current target · ${currentStage.englishLabel}`
                    : 'Mind Garden complete'}
              </Text>
              <Text className="text-[17px] leading-[24px] text-[#7e778d] mt-2">
                {resolvedSelectedStamp
                  ? getStampRequirementCopy(resolvedSelectedStamp)
                  : currentStage
                    ? `Fill Learning Drop to ${DAILY_DROP_LIMIT}/${DAILY_DROP_LIMIT} on ${currentStage.targetDays} qualified day(s). Progress only increases on full-goal days.`
                    : 'You have completed all four stages. Keep learning to maintain your rhythm.'}
              </Text>
              {resolvedSelectedStamp ? (
                <Text className="text-[17px] leading-[18px] mt-3" style={{ color: resolvedSelectedStamp.accentColor }}>
                  {getStampStatusCopy(resolvedSelectedStamp)}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <View className="px-4 mb-6">
          <Text className="text-[35px] leading-[38px] font-semibold text-[#16121c] mb-4">Mood Trend</Text>
          <View
            className="rounded-[30px] border border-[#e5e2eb] bg-[#f8f7fa] p-4"
            style={CARD_SHADOW}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-[21px] leading-[24px] font-semibold text-[#4d4756]">
                Mood Trend · Last 7 Days
              </Text>
              <View className="rounded-full bg-[#edeaf3] px-3 py-1.5">
                <Text className="text-[16px] leading-[17px] text-[#6f687c]">Last 7 Days</Text>
              </View>
            </View>

            <View className="flex-row justify-between items-end mb-5 px-1">
              {moodTrend.map((item, index) => (
                <View key={item.date} className="items-center">
                  <View className="w-9 h-9 rounded-full bg-[#efedf4] items-center justify-center mb-1.5">
                    <FontAwesome6
                      name={MOOD_CONFIG[item.mood].icon as any}
                      size={17}
                      color={MOOD_CONFIG[item.mood].color}
                    />
                  </View>
                  <Text className="text-[16px] leading-[16px] text-[#867f93]">
                    {index === 6 ? 'Today' : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][index]}
                  </Text>
                </View>
              ))}
            </View>

            <View className="flex-row justify-center gap-4 pt-3 border-t border-[#e4e1ea]">
              {(Object.keys(MOOD_CONFIG) as MoodType[]).map((mood) => (
                <View key={mood} className="flex-row items-center">
                  <FontAwesome6 name={MOOD_CONFIG[mood].icon as any} size={10} color={MOOD_CONFIG[mood].color} />
                  <Text className="text-[15px] leading-[16px] text-[#8a8396] ml-1">
                    {MOOD_CONFIG[mood].label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View className="px-4 mb-6">
          <Text className="text-[35px] leading-[38px] font-semibold text-[#16121c] mb-4">Mood Distribution</Text>
          <View
            className="rounded-[30px] border border-[#e5e2eb] bg-[#f8f7fa] p-4"
            style={CARD_SHADOW}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-[21px] leading-[24px] font-semibold text-[#4d4756]">
                Mood Distribution
              </Text>
              <Text className="text-[17px] leading-[18px] text-[#8f879c]">
                {moodHistory.length} total records
              </Text>
            </View>

            <View className="items-center justify-center rounded-[24px] border border-[#e2d9df] bg-[#f6f2f5] py-4">
              <Svg width={RADAR_SIZE} height={RADAR_SIZE}>
                {radarGridPolygons.map((points, index) => (
                  <Polygon
                    key={`grid-${index}`}
                    points={points}
                    fill={index === RADAR_LEVELS - 1 ? '#f9f3f5' : 'transparent'}
                    stroke="#cfccd6"
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
                    stroke="#cfccd6"
                    strokeWidth={1}
                  />
                ))}

                <Polygon
                  points={radarPolygonPoints}
                  fill="rgba(255, 10, 71, 0.2)"
                  stroke="#ff0a47"
                  strokeWidth={2.5}
                />

                {radarAxes.map((axis) => (
                  <Circle
                    key={`point-${axis.mood}`}
                    cx={axis.pointX}
                    cy={axis.pointY}
                    r={4.5}
                    fill="#ff0a47"
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
                    fill="#5a5465"
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
                  className="w-[48%] rounded-2xl px-3 py-3 bg-[#f1eef4] border border-[#e3dfe8]"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1 pr-2">
                      <FontAwesome6 name={MOOD_CONFIG[mood].icon as any} size={13} color={MOOD_CONFIG[mood].color} />
                      <Text className="text-[18px] leading-[20px] text-[#2f2a37] ml-2">
                        {MOOD_CONFIG[mood].label}
                      </Text>
                    </View>
                    <Text className="text-[18px] leading-[20px] font-semibold text-[#7e778d]">
                      {moodDistribution[mood]}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View className="px-4 mb-6">
          <View
            className="rounded-[30px] border border-[#e5e2eb] bg-[#f8f7fa] overflow-hidden px-4 py-4"
            style={CARD_SHADOW}
          >
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push('/tutor')}
              className="rounded-2xl bg-[#ff0a47] px-5 py-4 items-center justify-center"
            >
              <Text className="text-[24px] leading-[26px] text-white font-semibold">Start Learning</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleClearData}
              className="rounded-2xl border border-[#c9bbc2] bg-[#f2eff3] px-5 py-4 items-center justify-center mt-4"
            >
              <Text className="text-[24px] leading-[26px] text-[#352b34] font-medium">Clear Data</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
