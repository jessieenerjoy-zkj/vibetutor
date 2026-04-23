import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { useFocusEffect } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';
import Reanimated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppProfileIcon } from '@/components/AppProfileIcon';
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

const POSTER_WIDTH = 1080;
const POSTER_SIDE_PADDING = 72;
const POSTER_TEXT_MAX_UNITS = 25;
const POSTER_QR_GRID = 21;

const escapeXml = (value: string) => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const getPosterTextUnits = (value: string) => {
  return Array.from(value).reduce((total, char) => {
    return total + ((char.codePointAt(0) || 0) > 255 ? 2 : 1);
  }, 0);
};

const splitByUnits = (value: string, maxUnits: number) => {
  const chunks: string[] = [];
  let current = '';

  Array.from(value).forEach((char) => {
    const candidate = `${current}${char}`;
    if (getPosterTextUnits(candidate) <= maxUnits) {
      current = candidate;
      return;
    }

    if (current) {
      chunks.push(current);
    }
    current = char;
  });

  if (current) {
    chunks.push(current);
  }

  return chunks;
};

const splitPosterLines = (value: string, maxUnits: number) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return [''];
  }

  const words = normalized.split(' ');
  if (words.length === 1) {
    return splitByUnits(normalized, maxUnits);
  }

  const lines: string[] = [];
  let current = '';

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (getPosterTextUnits(candidate) <= maxUnits) {
      current = candidate;
      return;
    }

    if (current) {
      lines.push(current);
    }

    if (getPosterTextUnits(word) <= maxUnits) {
      current = word;
      return;
    }

    const chunks = splitByUnits(word, maxUnits);
    lines.push(...chunks.slice(0, -1));
    current = chunks[chunks.length - 1] || '';
  });

  if (current) {
    lines.push(current);
  }

  return lines;
};

const isFinderModule = (row: number, col: number, offsetRow: number, offsetCol: number) => {
  const within =
    row >= offsetRow && row < offsetRow + 7 && col >= offsetCol && col < offsetCol + 7;
  if (!within) {
    return false;
  }

  const relativeRow = row - offsetRow;
  const relativeCol = col - offsetCol;
  const isOuter = relativeRow === 0 || relativeRow === 6 || relativeCol === 0 || relativeCol === 6;
  const isInner =
    relativeRow >= 2 && relativeRow <= 4 && relativeCol >= 2 && relativeCol <= 4;

  return isOuter || isInner;
};

const getPosterQrRects = (x: number, y: number, size: number) => {
  const cell = size / POSTER_QR_GRID;
  const rects: string[] = [];

  for (let row = 0; row < POSTER_QR_GRID; row += 1) {
    for (let col = 0; col < POSTER_QR_GRID; col += 1) {
      const inFinder =
        isFinderModule(row, col, 0, 0) ||
        isFinderModule(row, col, 0, POSTER_QR_GRID - 7) ||
        isFinderModule(row, col, POSTER_QR_GRID - 7, 0);

      const isTiming = (row === 6 || col === 6) && !inFinder;
      const isData = !inFinder && !isTiming && (row * 11 + col * 7 + row * col) % 5 <= 1;

      if (!inFinder && !isTiming && !isData) {
        continue;
      }

      const fill = inFinder || isTiming ? '#101014' : '#2d2d34';
      rects.push(
        `<rect x="${(x + col * cell).toFixed(2)}" y="${(y + row * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" fill="${fill}" />`
      );
    }
  }

  return rects.join('');
};

const buildSharePosterSvg = (quote: string, author: string, dateLabel: string) => {
  const normalizedQuote = quote.replace(/^"+|"+$/g, '').trim();
  const quoteLines = splitPosterLines(normalizedQuote, Math.max(16, POSTER_TEXT_MAX_UNITS - 6));
  const dateParts = dateLabel.split('.');
  const shortDateLabel = dateParts.length === 3
    ? `${Number(dateParts[1])}/${Number(dateParts[2])}`
    : dateLabel;

  const cardX = 48;
  const cardY = 48;
  const cardWidth = POSTER_WIDTH - cardX * 2;

  const headerY = 220;
  const quoteMarkY = 356;
  const quoteStartY = 500;
  const quoteLineHeight = 94;
  const quoteFontSize = 70;
  const quoteBlockHeight = quoteLines.length * quoteLineHeight;
  const authorY = quoteStartY + quoteBlockHeight + 96;

  const qrSize = 292;
  const qrWrapSize = 340;
  const qrWrapX = (POSTER_WIDTH - qrWrapSize) / 2;
  const qrWrapY = authorY + 76;
  const qrX = qrWrapX + (qrWrapSize - qrSize) / 2;
  const qrY = qrWrapY + (qrWrapSize - qrSize) / 2;

  const cardBottom = qrWrapY + qrWrapSize + 72;
  const cardHeight = cardBottom - cardY;
  const posterHeight = cardBottom + 52;

  const quoteLinesSvg = quoteLines
    .map((line, index) => {
      const y = quoteStartY + index * quoteLineHeight;
      return `<text x="${cardX + 92}" y="${y}" fill="#20232b" font-family="PlusJakartaSans, Arial, sans-serif" font-size="${quoteFontSize}" font-weight="700">${escapeXml(line)}</text>`;
    })
    .join('');

  const qrRects = getPosterQrRects(qrX, qrY, qrSize);

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_WIDTH}" height="${posterHeight}" viewBox="0 0 ${POSTER_WIDTH} ${posterHeight}">
  <defs>
    <linearGradient id="posterBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f9e8ef" />
      <stop offset="100%" stop-color="#e8f0fb" />
    </linearGradient>
    <radialGradient id="posterGlow" cx="50%" cy="96%" r="60%">
      <stop offset="0%" stop-color="#cad8ef" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#cad8ef" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${POSTER_WIDTH}" height="${posterHeight}" fill="url(#posterBg)" />
  <ellipse cx="${POSTER_WIDTH / 2}" cy="${posterHeight - 70}" rx="370" ry="95" fill="url(#posterGlow)" />

  <rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="64" fill="#f8f8fb" stroke="#ffffff" stroke-opacity="0.82" stroke-width="2" />

  <text x="${cardX + 92}" y="${headerY}" fill="#1f232a" font-family="PlusJakartaSans, Arial, sans-serif" font-size="68" font-weight="700">Daily Quote</text>
  <text x="${cardX + cardWidth - 76}" y="${headerY}" text-anchor="end" fill="#5c40e6" font-family="PlusJakartaSans, Arial, sans-serif" font-size="68" font-weight="700">${escapeXml(shortDateLabel)}</text>

  <text x="${cardX + 84}" y="${quoteMarkY}" fill="#f18cab" font-family="PlusJakartaSans, Arial, sans-serif" font-size="104" font-weight="700">”</text>
  ${quoteLinesSvg}

  <rect x="${cardX + 92}" y="${authorY - 20}" width="74" height="5" rx="2.5" fill="#ff0a47" />
  <text x="${cardX + 186}" y="${authorY}" fill="#333841" font-family="PlusJakartaSans, Arial, sans-serif" font-size="52" font-weight="500">${escapeXml(author)}</text>

  <rect x="${qrWrapX}" y="${qrWrapY}" width="${qrWrapSize}" height="${qrWrapSize}" rx="18" fill="#ffffff" />
  ${qrRects}
</svg>
`.trim();

  return {
    svg,
    height: posterHeight,
  };
};

export default function HomeScreen() {
  const router = useSafeRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && screenWidth >= 980;
  const [todayMood, setTodayMood] = useState<MoodType | null>(null);
  const [todayDrops, setTodayDrops] = useState(0);
  const [motdIndex, setMotdIndex] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [aiInsight, setAiInsight] = useState('');
  const [isLoadingInsight, setIsLoadingInsight] = useState(false);
  const [showSharePoster, setShowSharePoster] = useState(false);
  const [isSavingPoster, setIsSavingPoster] = useState(false);
  const posterCaptureRef = useRef<View | null>(null);

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

  const quoteMessage = MOTD_MESSAGES[motdIndex] || MOTD_MESSAGES[0] || '';
  const { quote, author } = useMemo(() => splitQuoteAndAuthor(quoteMessage), [quoteMessage]);

  const handleShareMOTD = async () => {
    const message = MOTD_MESSAGES[motdIndex];
    try {
      await Clipboard.setStringAsync(message);
      setShowSharePoster(true);
    } catch {
      setShowSharePoster(true);
    }
  };

  const sharePosterText = useMemo(
    () => `"${quote}"\n\n- ${author.toUpperCase()}\n\n#VibeTutor #DailyMotivation`,
    [author, quote]
  );

  const todayLabel = useMemo(() => {
    const today = new Date();
    return `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
  }, []);

  const posterPayload = useMemo(
    () => buildSharePosterSvg(quote, author, todayLabel),
    [author, quote, todayLabel]
  );

  const handleDownloadPoster = useCallback(async () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([posterPayload.svg], { type: 'image/svg+xml;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `vibetutor-daily-quote-${todayLabel}.svg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      Alert.alert('Downloaded', 'Poster image downloaded.');
      return;
    }

    if (!posterCaptureRef.current || isSavingPoster) {
      return;
    }

    setIsSavingPoster(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow photo access to save the poster.');
        return;
      }

      const captureUri = await captureRef(posterCaptureRef, {
        format: 'png',
        quality: 1,
      });

      const fileName = `vibetutor-daily-quote-${todayLabel.replace(/\./g, '-')}.png`;
      const fileRoot = ((FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory) as string | null;
      if (!fileRoot) {
        throw new Error('No writable file directory available');
      }

      const targetUri = `${fileRoot}${fileName}`;
      await FileSystem.copyAsync({
        from: captureUri,
        to: targetUri,
      });

      await MediaLibrary.saveToLibraryAsync(targetUri);
      Alert.alert('Saved', 'Poster saved to your photo album.');
    } catch (error) {
      console.error('Failed to save poster image:', error);
      Alert.alert('Save failed', 'Unable to save the poster right now. Please try again.');
    } finally {
      setIsSavingPoster(false);
    }
  }, [isSavingPoster, todayLabel]);

  const handleShareToChannel = useCallback(
    async (channel: 'tiktok' | 'instagram') => {
      try {
        if (Platform.OS === 'web') {
          const targetUrl = channel === 'tiktok'
            ? 'https://www.tiktok.com/upload'
            : 'https://www.instagram.com';
          await Linking.openURL(targetUrl);
          return;
        }

        await Share.share({
          message: sharePosterText,
          title: `Share to ${channel === 'tiktok' ? 'TikTok' : 'Instagram'}`,
        });
      } catch {
        await Clipboard.setStringAsync(sharePosterText);
        Alert.alert('Copied', 'Poster text copied. You can paste it into your post.');
      }
    },
    [sharePosterText]
  );

  const learningDropCount = Math.max(0, Math.min(DAILY_DROP_LIMIT, todayDrops));
  const isDailyDropGoalMet = learningDropCount >= DAILY_DROP_LIMIT;
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
              <AppProfileIcon size={18} color={UI.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 74 : insets.bottom + 112 }}
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
                  <Text style={styles.cardTitle}>Learning Drop</Text>
                  <Text style={styles.cardSubtitle}>
                    {isDailyDropGoalMet
                      ? 'Daily goal met. Nice work today.'
                      : 'Each successful tutor reply adds one drop.'}
                  </Text>
                </View>

                <Text style={styles.reservoirCount}>
                  <Text style={styles.reservoirCountAccent}>{learningDropCount}</Text>
                  <Text style={styles.reservoirCountBase}>/{DAILY_DROP_LIMIT}</Text>
                </Text>
              </View>

              <View style={styles.reservoirGrid}>
                <View style={styles.dropRow}>
                  {Array.from({ length: DAILY_DROP_LIMIT }).map((_, dropIndex) => {
                    const filled = dropIndex < learningDropCount;

                    return (
                      <View key={`drop-${dropIndex}`} style={styles.dropCell}>
                        <FontAwesome6
                          name="droplet"
                          size={34}
                          color={filled ? UI.filledDrop : UI.emptyDrop}
                        />
                      </View>
                    );
                  })}
                </View>

                {isDailyDropGoalMet ? (
                  <View style={styles.goalPill}>
                    <FontAwesome6 name="circle-check" size={14} color={UI.primary} />
                    <Text style={styles.goalPillText}>Daily goal met</Text>
                  </View>
                ) : null}
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
                <Text style={styles.insightTitle}>AI Study Insight</Text>
              </View>

              <Text style={styles.insightCopy}>{insightBody}</Text>

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={handlePrimaryTutorPress}
                style={styles.insightButton}
              >
                <Text style={styles.insightButtonText}>Start Learning</Text>
              </TouchableOpacity>
            </Reanimated.View>
          </View>
        </ScrollView>

        <Modal
          visible={showSharePoster}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSharePoster(false)}
        >
          <View style={styles.posterModalWrap}>
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setShowSharePoster(false)}
              style={styles.posterMask}
            />

            <View style={[styles.posterSheet, isDesktopWeb && styles.posterSheetDesktop]}>
              <ScrollView
                style={styles.posterViewport}
                contentContainerStyle={styles.posterViewportContent}
                showsVerticalScrollIndicator={false}
              >
                <View ref={posterCaptureRef} collapsable={false} style={styles.posterCanvasWrap}>
                  <SvgXml
                    xml={posterPayload.svg}
                    width="100%"
                    height={(posterPayload.height * 320) / POSTER_WIDTH}
                  />
                </View>
              </ScrollView>

              <View style={styles.posterActions}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => void handleDownloadPoster()}
                  style={styles.posterActionButton}
                  disabled={isSavingPoster}
                >
                  <FontAwesome6 name="download" size={18} color={UI.text} />
                  <Text style={styles.posterActionText}>{isSavingPoster ? 'Saving...' : 'Download'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => void handleShareToChannel('tiktok')}
                  style={styles.posterActionButton}
                >
                  <FontAwesome6 name="tiktok" size={18} color={UI.text} />
                  <Text style={styles.posterActionText}>TikTok</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => void handleShareToChannel('instagram')}
                  style={styles.posterActionButton}
                >
                  <FontAwesome6 name="instagram" size={18} color={UI.text} />
                  <Text style={styles.posterActionText}>Instagram</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
    alignItems: 'flex-start',
    gap: 20,
    marginTop: 28,
  },
  dropRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  dropCell: {
    alignItems: 'center',
    width: 48,
  },
  goalPill: {
    alignItems: 'center',
    backgroundColor: UI.primarySoft,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  goalPillText: {
    color: '#b8133c',
    fontFamily: FONT.bold,
    fontSize: 12,
    letterSpacing: 0.4,
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
  posterModalWrap: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  posterMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 10, 18, 0.58)',
  },
  posterSheet: {
    backgroundColor: '#f7f4f8',
    borderColor: '#efe5ef',
    borderRadius: 32,
    borderWidth: 1.2,
    maxHeight: '90%',
    overflow: 'hidden',
    width: '100%',
    shadowColor: '#8f8396',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 26,
    elevation: 8,
  },
  posterSheetDesktop: {
    maxWidth: 430,
  },
  posterViewport: {
    maxHeight: 520,
  },
  posterViewportContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
  },
  posterCanvasWrap: {
    borderRadius: 24,
    overflow: 'hidden',
    width: '100%',
  },
  posterActions: {
    borderTopColor: '#ebe2eb',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  posterActionButton: {
    alignItems: 'center',
    backgroundColor: '#fcfbfd',
    borderColor: '#e9e2ea',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginHorizontal: 4,
    minHeight: 50,
  },
  posterActionText: {
    color: UI.text,
    fontFamily: FONT.semibold,
    fontSize: 13,
  },
});
