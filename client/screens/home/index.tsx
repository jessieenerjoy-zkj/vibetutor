import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';
import Reanimated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { DAILY_DROP_LIMIT } from '@/utils/learning';
import {
  MOOD_CONFIG,
  MOTD_MESSAGES,
  MOOD_PRESCRIPTIONS,
  PERSONA_CONFIG,
  type MoodType,
} from '@/utils/types';
import {
  getTodayDrops,
  getTodayMood,
  getTodayString,
  isMOTDLiked,
  saveCurrentPersona,
  saveMoodRecord,
  toggleMOTDLike,
} from '@/utils/storage';

const BACKEND_BASE_URL = (
  process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://127.0.0.1:9091'
).replace(/\/$/, '');

const FONT = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

const UI = {
  page: '#f3f0f3',
  header: '#ffffff',
  card: '#fbfbfc',
  border: '#ece7eb',
  primary: '#ff0a47',
  primarySoft: '#ffdfe8',
  text: '#2b1f25',
  muted: '#7f6f75',
  author: '#7f615a',
  inactiveBubble: '#e9e7eb',
  inactiveIcon: '#d7d1d6',
  filledDrop: '#7f9ff5',
  emptyDrop: '#ece9ee',
  insight: '#f1eefb',
  insightBorder: '#e2dcfb',
  insightAccent: '#5c40e6',
  tabBackground: '#faf7f8',
  tabBorder: '#efe9ec',
  tabInactive: '#95a0b4',
};

const MOOD_ORDER: MoodType[] = ['Crushed', 'Stuck', 'Calm', 'Engaged', 'Hyper'];

const MOOD_UI_META: Record<MoodType, { color: string; icon: string }> = {
  Crushed: { color: '#ef5350', icon: MOOD_CONFIG.Crushed.icon },
  Stuck: { color: '#e4b216', icon: MOOD_CONFIG.Stuck.icon },
  Calm: { color: '#3778e5', icon: MOOD_CONFIG.Calm.icon },
  Engaged: { color: '#22c55e', icon: MOOD_CONFIG.Engaged.icon },
  Hyper: { color: '#e4b216', icon: 'bolt' },
};

const splitQuoteAndAuthor = (message: string) => {
  const parts = message.split(/\s+-\s+/);
  if (parts.length < 2) {
    return {
      quote: message,
      author: 'Daily inspiration',
    };
  }

  const author = parts.pop() || 'Daily inspiration';
  return {
    quote: parts.join(' - '),
    author,
  };
};

const getDefaultInsight = (mood: MoodType, drops: number): string => {
  const insights: Record<MoodType, string[]> = {
    Crushed: [
      `One drop at a time. ${drops}/${DAILY_DROP_LIMIT} is already progress.`,
      'Hard days still count. Let today be small, clear, and kind.',
    ],
    Stuck: [
      'Being stuck usually means you are one idea away from momentum.',
      'Pause, breathe, and ask the next smallest question.',
    ],
    Calm: [
      'You are in a focused rhythm. Keep the session clean and steady.',
      'Calm days are great for building reliable habits.',
    ],
    Engaged: [
      'Nice pace. Turn that focus into a clean finish today.',
      'You have energy and direction today. Use both.',
    ],
    Hyper: [
      'Big energy is useful when you aim it. One question at a time.',
      'You are charged up. Let’s turn it into a sharp learning streak.',
    ],
  };

  const options = insights[mood];
  return options[Math.floor(Math.random() * options.length)];
};

const withOpacity = (hex: string, opacity: number) => {
  const normalized = hex.replace('#', '');
  const fullHex = normalized.length === 3
    ? normalized
        .split('')
        .map((value) => `${value}${value}`)
        .join('')
    : normalized;

  const numeric = Number.parseInt(fullHex, 16);
  const red = (numeric >> 16) & 255;
  const green = (numeric >> 8) & 255;
  const blue = numeric & 255;

  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
};

export default function HomeScreen() {
  const router = useSafeRouter();
  const insets = useSafeAreaInsets();
  const [todayMood, setTodayMood] = useState<MoodType | null>(null);
  const [todayDrops, setTodayDrops] = useState(0);
  const [motdIndex, setMotdIndex] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [aiInsight, setAiInsight] = useState('');
  const [isLoadingInsight, setIsLoadingInsight] = useState(false);

  useEffect(() => {
    const today = new Date();
    const dayOfYear = Math.floor(
      (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    setMotdIndex(dayOfYear % MOTD_MESSAGES.length);
  }, []);

  const loadData = useCallback(async () => {
    const [mood, drops, liked] = await Promise.all([
      getTodayMood(),
      getTodayDrops(),
      isMOTDLiked(getTodayString()),
    ]);

    setTodayMood(mood);
    setTodayDrops(drops);
    setIsLiked(liked);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  const fetchAIInsight = useCallback(async () => {
    if (!todayMood) {
      setAiInsight('Choose your mood to unlock a personalized next step for today.');
      return;
    }

    setIsLoadingInsight(true);
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/v1/insight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood: todayMood,
          drops: todayDrops,
          minutes: 0,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAiInsight(data.content || getDefaultInsight(todayMood, todayDrops));
      } else {
        setAiInsight(getDefaultInsight(todayMood, todayDrops));
      }
    } catch {
      setAiInsight(getDefaultInsight(todayMood, todayDrops));
    } finally {
      setIsLoadingInsight(false);
    }
  }, [todayMood, todayDrops]);

  useEffect(() => {
    void fetchAIInsight();
  }, [fetchAIInsight]);

  const applyMoodSelection = async (mood: MoodType) => {
    await saveMoodRecord(mood);
    setTodayMood(mood);
    await saveCurrentPersona(MOOD_PRESCRIPTIONS[mood].persona);
  };

  const confirmMoodReplacement = async () => {
    if (Platform.OS === 'web') {
      return globalThis.confirm("Changing your mood will overwrite today's record. Continue?");
    }

    return await new Promise<boolean>((resolve) => {
      Alert.alert('Change Mood', "Changing your mood will overwrite today's record. Continue?", [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Confirm', onPress: () => resolve(true) },
      ]);
    });
  };

  const handleMoodSelect = async (mood: MoodType) => {
    if (todayMood === mood) {
      return;
    }

    if (todayMood) {
      const confirmed = await confirmMoodReplacement();
      if (!confirmed) {
        return;
      }
    }

    await applyMoodSelection(mood);
  };

  const handlePrescriptionPress = async () => {
    if (!todayMood) return;

    const prescription = MOOD_PRESCRIPTIONS[todayMood];
    await saveCurrentPersona(prescription.persona);
    router.push('/tutor', {
      entrySource: 'home_match',
      persona: prescription.persona,
      mood: todayMood,
      autoGreeting: true,
      launchToken: Date.now(),
    });
  };

  const handlePrimaryTutorPress = () => {
    if (todayMood) {
      void handlePrescriptionPress();
      return;
    }

    router.push('/tutor');
  };

  const handleLikeMOTD = async () => {
    const nextState = await toggleMOTDLike(getTodayString());
    setIsLiked(nextState);
  };

  const handleShareMOTD = async () => {
    const message = MOTD_MESSAGES[motdIndex];
    try {
      if (Platform.OS === 'web') {
        await Clipboard.setStringAsync(message);
        Alert.alert('Copied', 'Quote copied to clipboard.');
      } else {
        await Share.share({ message });
      }
    } catch {
      await Clipboard.setStringAsync(message);
      Alert.alert('Copied', 'Quote copied to clipboard.');
    }
  };

  const quoteMessage = MOTD_MESSAGES[motdIndex] || MOTD_MESSAGES[0] || '';
  const { quote, author } = useMemo(() => splitQuoteAndAuthor(quoteMessage), [quoteMessage]);
  const reservoirPoints = Math.max(
    0,
    Math.min(10, Math.round((todayDrops / DAILY_DROP_LIMIT) * 10))
  );
  const insightBody = isLoadingInsight
    ? 'Preparing a personalized next step for your current study vibe...'
    : aiInsight;
  const activePrescription = todayMood ? MOOD_PRESCRIPTIONS[todayMood] : null;
  const prescriptionPersona = activePrescription
    ? PERSONA_CONFIG[activePrescription.persona]
    : null;
  const prescriptionAccent = activePrescription?.accentColor || UI.primary;
  const prescriptionTint = withOpacity(prescriptionAccent, 0.12);
  const prescriptionLine = withOpacity(prescriptionAccent, 0.22);
  const prescriptionGlow = withOpacity(prescriptionAccent, 0.16);

  return (
    <Screen
      safeAreaEdges={['left', 'right', 'bottom']}
      backgroundColor={UI.page}
      statusBarStyle="dark"
    >
      <View style={styles.page}>
        <View style={[styles.header, { paddingTop: insets.top + 18 }]}> 
          <View style={styles.headerRow}>
            <Text style={styles.brand}>VibeTutor</Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/profile')}
              style={styles.headerButton}
            >
              <FontAwesome6 name="bell" solid size={18} color={UI.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 112 }}
        >
          <View style={styles.content}>
            <Reanimated.View entering={FadeInDown.duration(280)} style={[styles.card, styles.section]}>
              <Text style={styles.quoteText}>&quot;{quote}&quot;</Text>
              <View style={styles.quoteFooter}>
                <Text style={styles.quoteAuthor}>- {author.toUpperCase()}</Text>
                <View style={styles.quoteActions}>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => void handleLikeMOTD()}
                    style={styles.iconButton}
                  >
                    <FontAwesome6
                      name="heart"
                      solid={isLiked}
                      size={20}
                      color={isLiked ? UI.primary : UI.inactiveIcon}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => void handleShareMOTD()}
                    style={styles.iconButton}
                  >
                    <FontAwesome6 name="share-nodes" size={20} color={UI.inactiveIcon} />
                  </TouchableOpacity>
                </View>
              </View>
            </Reanimated.View>

            <Reanimated.View
              entering={FadeInDown.duration(280).delay(60)}
              style={[styles.section, styles.moodSection]}
            >
              <Text style={styles.sectionTitle}>HOW ARE YOU FEELING?</Text>
              <View style={styles.moodRow}>
                {MOOD_ORDER.map((mood) => {
                  const isSelected = todayMood === mood;
                  const moodUI = MOOD_UI_META[mood];

                  return (
                    <TouchableOpacity
                      key={mood}
                      activeOpacity={0.82}
                      onPress={() => void handleMoodSelect(mood)}
                      style={styles.moodItem}
                    >
                      <View style={[styles.moodBubble, isSelected && styles.moodBubbleActive]}>
                        <FontAwesome6
                          name={moodUI.icon as any}
                          size={24}
                          color={moodUI.color}
                        />
                      </View>
                      <Text style={[styles.moodLabel, isSelected && styles.moodLabelActive]}>
                        {mood}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Reanimated.View>

            {activePrescription ? (
              <Reanimated.View
                entering={FadeInDown.duration(300).delay(110)}
                style={[styles.prescriptionCard, styles.section, { borderColor: prescriptionLine }]}
              >
                <View style={[styles.prescriptionGlow, { backgroundColor: prescriptionGlow }]} />
                <View style={styles.prescriptionGlowSecondary} />

                <Reanimated.View
                  key={todayMood}
                  entering={FadeIn.duration(180)}
                  exiting={FadeOut.duration(140)}
                  style={styles.prescriptionContent}
                >
                  <View style={styles.prescriptionHeader}>
                    <View style={[styles.prescriptionBadge, { backgroundColor: prescriptionTint }]}>
                      <FontAwesome6
                        name={activePrescription.badgeIcon as any}
                        size={12}
                        color={prescriptionAccent}
                      />
                      <Text style={[styles.prescriptionBadgeText, { color: prescriptionAccent }]}>
                        {activePrescription.badge.toUpperCase()}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.prescriptionAvatar,
                        { backgroundColor: prescriptionTint, borderColor: prescriptionLine },
                      ]}
                    >
                      <FontAwesome6
                        name={(prescriptionPersona?.icon || 'wand-magic-sparkles') as any}
                        size={18}
                        color={prescriptionAccent}
                      />
                    </View>
                  </View>

                  <Text style={styles.prescriptionEyebrow}>EMOTION PRESCRIPTION</Text>
                  <Text style={styles.prescriptionTitle}>{activePrescription.title}</Text>
                  <Text style={styles.prescriptionCopy}>{activePrescription.copy}</Text>

                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() => void handlePrescriptionPress()}
                    style={[
                      styles.prescriptionButton,
                      { backgroundColor: prescriptionAccent, shadowColor: prescriptionAccent },
                    ]}
                  >
                    <Text style={styles.prescriptionButtonText}>{activePrescription.cta}</Text>
                    <FontAwesome6 name="arrow-right" size={14} color="#ffffff" />
                  </TouchableOpacity>
                </Reanimated.View>
              </Reanimated.View>
            ) : null}

            <Reanimated.View entering={FadeInDown.duration(280).delay(120)} style={[styles.card, styles.section]}>
              <View style={styles.reservoirHeader}>
                <View style={styles.reservoirTitleBlock}>
                  <Text style={styles.cardTitle}>Mastery Reservoir</Text>
                  <Text style={styles.cardSubtitle}>Consistency builds depth.</Text>
                </View>

                <Text style={styles.reservoirCount}>
                  <Text style={styles.reservoirCountAccent}>{reservoirPoints}</Text>
                  <Text style={styles.reservoirCountBase}>/10</Text>
                </Text>
              </View>

              <View style={styles.reservoirGrid}>
                {[0, 1].map((rowIndex) => (
                  <View key={`reservoir-row-${rowIndex}`} style={styles.dropRow}>
                    {Array.from({ length: 5 }).map((_, columnIndex) => {
                      const dropIndex = rowIndex * 5 + columnIndex;
                      const filled = dropIndex < reservoirPoints;

                      return (
                        <View key={`drop-${dropIndex}`} style={styles.dropCell}>
                          <FontAwesome6
                            name="droplet"
                            size={30}
                            color={filled ? UI.filledDrop : UI.emptyDrop}
                          />
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </Reanimated.View>

            <Reanimated.View
              entering={FadeInDown.duration(280).delay(180)}
              style={[styles.insightCard, styles.section]}
            >
              <View style={styles.insightHeader}>
                <View style={styles.insightIconWrap}>
                  <FontAwesome6 name="lightbulb" size={20} color="#ffffff" />
                </View>
                <Text style={styles.insightTitle}>MUSE INSIGHT</Text>
              </View>

              <Text style={styles.insightCopy}>{insightBody}</Text>

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={handlePrimaryTutorPress}
                style={styles.insightButton}
              >
                <Text style={styles.insightButtonText}>START PRACTICE SET</Text>
              </TouchableOpacity>
            </Reanimated.View>
          </View>
        </ScrollView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: UI.page,
  },
  header: {
    backgroundColor: UI.header,
    borderBottomWidth: 1,
    borderBottomColor: UI.tabBorder,
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  brand: {
    color: UI.primary,
    fontFamily: FONT.bold,
    fontSize: 22,
    letterSpacing: -0.6,
  },
  headerButton: {
    marginRight: -6,
    padding: 6,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  section: {
    marginBottom: 30,
  },
  moodSection: {
    marginBottom: 18,
  },
  card: {
    backgroundColor: UI.card,
    borderColor: UI.border,
    borderRadius: 30,
    borderWidth: 1,
    padding: 26,
    shadowColor: '#674f57',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
  quoteText: {
    color: UI.text,
    fontFamily: FONT.medium,
    fontSize: 22,
    letterSpacing: -0.7,
    lineHeight: 40,
  },
  quoteFooter: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 32,
  },
  quoteAuthor: {
    color: UI.author,
    fontFamily: FONT.medium,
    fontSize: 15,
    letterSpacing: 2.3,
    textTransform: 'uppercase',
  },
  quoteActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 18,
  },
  iconButton: {
    paddingLeft: 4,
    paddingVertical: 4,
  },
  sectionTitle: {
    color: UI.primary,
    fontFamily: FONT.bold,
    fontSize: 18,
    letterSpacing: 3.1,
    marginBottom: 24,
  },
  moodRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  moodItem: {
    alignItems: 'center',
    flex: 1,
  },
  moodBubble: {
    alignItems: 'center',
    backgroundColor: UI.inactiveBubble,
    borderRadius: 30,
    height: 60,
    justifyContent: 'center',
    marginBottom: 12,
    width: 60,
  },
  moodBubbleActive: {
    backgroundColor: UI.primarySoft,
    borderColor: UI.primary,
    borderWidth: 3,
    shadowColor: UI.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
  },
  moodLabel: {
    color: UI.text,
    fontFamily: FONT.medium,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  moodLabelActive: {
    color: '#b8133c',
    fontFamily: FONT.bold,
  },
  prescriptionCard: {
    backgroundColor: '#fffdfd',
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 24,
    position: 'relative',
    shadowColor: '#705b66',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  prescriptionGlow: {
    borderRadius: 180,
    height: 180,
    position: 'absolute',
    right: -52,
    top: -68,
    width: 180,
  },
  prescriptionGlowSecondary: {
    backgroundColor: 'rgba(125, 165, 255, 0.12)',
    borderRadius: 120,
    bottom: -68,
    height: 120,
    left: -24,
    position: 'absolute',
    width: 120,
  },
  prescriptionContent: {
    gap: 14,
  },
  prescriptionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  prescriptionBadge: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  prescriptionBadgeText: {
    fontFamily: FONT.bold,
    fontSize: 11,
    letterSpacing: 1.4,
  },
  prescriptionAvatar: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  prescriptionEyebrow: {
    color: UI.muted,
    fontFamily: FONT.bold,
    fontSize: 12,
    letterSpacing: 2.2,
  },
  prescriptionTitle: {
    color: UI.text,
    fontFamily: FONT.bold,
    fontSize: 22,
    letterSpacing: -0.8,
    lineHeight: 30,
  },
  prescriptionCopy: {
    color: UI.text,
    fontFamily: FONT.regular,
    fontSize: 15,
    lineHeight: 26,
  },
  prescriptionButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 4,
  },
  prescriptionButtonText: {
    color: '#ffffff',
    fontFamily: FONT.bold,
    fontSize: 15,
  },
  reservoirHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
  },
  reservoirTitleBlock: {
    flex: 1,
  },
  cardTitle: {
    color: UI.text,
    fontFamily: FONT.bold,
    fontSize: 19,
    letterSpacing: -0.6,
  },
  cardSubtitle: {
    color: UI.muted,
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
  },
  reservoirCount: {
    paddingTop: 2,
  },
  reservoirCountAccent: {
    color: UI.primary,
    fontFamily: FONT.medium,
    fontSize: 20,
  },
  reservoirCountBase: {
    color: UI.text,
    fontFamily: FONT.regular,
    fontSize: 20,
  },
  reservoirGrid: {
    gap: 22,
    marginTop: 28,
  },
  dropRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dropCell: {
    alignItems: 'center',
    width: 44,
  },
  insightCard: {
    backgroundColor: UI.insight,
    borderColor: UI.insightBorder,
    borderRadius: 30,
    borderWidth: 1,
    padding: 26,
    shadowColor: '#7d71c9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  insightHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    marginBottom: 26,
  },
  insightIconWrap: {
    alignItems: 'center',
    backgroundColor: UI.insightAccent,
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    shadowColor: UI.insightAccent,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    width: 56,
  },
  insightTitle: {
    color: UI.insightAccent,
    fontFamily: FONT.bold,
    fontSize: 17,
    letterSpacing: 2.6,
  },
  insightCopy: {
    color: UI.text,
    fontFamily: FONT.regular,
    fontSize: 16,
    lineHeight: 30,
  },
  insightButton: {
    alignItems: 'center',
    backgroundColor: UI.primary,
    borderRadius: 18,
    justifyContent: 'center',
    marginTop: 32,
    paddingVertical: 18,
    shadowColor: UI.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 4,
  },
  insightButtonText: {
    color: '#ffffff',
    fontFamily: FONT.bold,
    fontSize: 16,
  },
});
