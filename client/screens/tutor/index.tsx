import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Keyboard,
  Platform,
  Image,
  Alert,
  ActivityIndicator,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  useWindowDimensions,
  Share,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Screen } from '@/components/Screen';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { FontAwesome6 } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Base64 } from 'js-base64';
import { buildApiUrl } from '@/utils/api';
import {
  TutorPersona,
  TtsVoice,
  PERSONA_CONFIG,
  TUTOR_PERSONAS,
  ChatMessage,
} from '@/utils/types';
import { DAILY_DROP_LIMIT } from '@/utils/learning';
import {
  getCurrentPersona,
  getPersonaVoicePreferences,
  saveCurrentPersona,
  getChatHistory,
  saveChatHistory,
  addDrop,
  getTodayDrops,
  clearChatHistory,
  subscribeToDataReset,
  trackLocalEvent,
  extractSubjectTag,
  recordTutorSolvedSubject,
  getTodayStudyReportData,
  recordTutorFocusDuration,
  type SubjectBreakdown,
  type TodayStudyReportData,
} from '@/utils/storage';

// 动态加载动画组件 - 三个点依次闪烁
const AnimatedDots = () => {
  const opacity1 = useSharedValue(0.3);
  const opacity2 = useSharedValue(0.3);
  const opacity3 = useSharedValue(0.3);

  opacity1.value = withRepeat(
    withSequence(
      withDelay(0, withTiming(1, { duration: 400 })),
      withTiming(0.3, { duration: 400 })
    ),
    -1,
    false
  );

  opacity2.value = withRepeat(
    withSequence(
      withDelay(150, withTiming(1, { duration: 400 })),
      withTiming(0.3, { duration: 400 })
    ),
    -1,
    false
  );

  opacity3.value = withRepeat(
    withSequence(
      withDelay(300, withTiming(1, { duration: 400 })),
      withTiming(0.3, { duration: 400 })
    ),
    -1,
    false
  );

  const style1 = useAnimatedStyle(() => ({ opacity: opacity1.value }));
  const style2 = useAnimatedStyle(() => ({ opacity: opacity2.value }));
  const style3 = useAnimatedStyle(() => ({ opacity: opacity3.value }));

  return (
    <View className="flex-row items-center gap-1.5">
      <Animated.View
        className="w-1.5 h-1.5 rounded-full bg-[var(--color-muted)]"
        style={style1}
      />
      <Animated.View
        className="w-1.5 h-1.5 rounded-full bg-[var(--color-muted)]"
        style={style2}
      />
      <Animated.View
        className="w-1.5 h-1.5 rounded-full bg-[var(--color-muted)]"
        style={style3}
      />
    </View>
  );
};

const getWelcomeMessage = (persona: TutorPersona): ChatMessage => {
  const welcomes: Record<TutorPersona, string> = {
    Oprah: 'Welcome, my friend. If you are overwhelmed, tired, or doubting yourself, that is okay. We will take this one gentle step at a time and build your confidence as we go.',
    Einstein: 'Welcome. Let us slow the noise, return to first principles, and understand the deep structure of the problem so the answer becomes inevitable.',
    Trump: 'Welcome, champion. You came to the right place, believe me. We are going to attack this problem with tremendous energy, brilliant strategy, and a winning style that feels absolutely fantastic.',
    Elon: 'Problem-solving mode activated. Send the goal, the constraint, or the bottleneck. We will cut the noise, isolate the critical path, and get to the result fast.',
    Sherlock: 'Welcome. Every difficult problem leaves traces. Bring me the facts, the pattern, and the point of confusion, and we shall uncover the decisive clue together.',
  };
  return {
    id: Date.now().toString(),
    role: 'assistant',
    content: welcomes[persona],
    timestamp: new Date(),
  };
};

const SESSION_DIVIDER_PREFIX = '__session_divider__:';

const createSessionDividerMessage = (label: string): ChatMessage => ({
  id: `${Date.now()}-divider-${Math.random().toString(36).slice(2, 8)}`,
  role: 'system',
  content: `${SESSION_DIVIDER_PREFIX}${label}`,
  timestamp: new Date(),
});

const isSessionDividerMessage = (message: ChatMessage): boolean =>
  message.role === 'system' && message.content.startsWith(SESSION_DIVIDER_PREFIX);

const getSessionDividerLabel = (message: ChatMessage): string =>
  isSessionDividerMessage(message)
    ? message.content.slice(SESSION_DIVIDER_PREFIX.length)
    : '';

const normalizeStyleCommand = (value: string): string => {
  return value.replace(/[\s【】!！?？,，.。~～、:：;；'"“”‘’（）()\-]/g, '');
};

const PERSONA_SPEECH_RATE: Record<TutorPersona, number> = {
  Oprah: 0.9,
  Einstein: 0.8,
  Trump: 1.16,
  Elon: 1.25,
  Sherlock: 1.05,
};

const PERSONA_AVATARS: Record<TutorPersona, number> = {
  Oprah: require('@/assets/images/personas/oprah.png'),
  Einstein: require('@/assets/images/personas/einstein.png'),
  Trump: require('@/assets/images/personas/trump.png'),
  Elon: require('@/assets/images/personas/elon.png'),
  Sherlock: require('@/assets/images/personas/sherlock.png'),
};

const FINISH_LEARNING_EMPTY_TOAST = "You haven't solved any problems yet today. Let's get started!";
const FOCUS_TICK_SECONDS = 10;

const REPORT_SUBJECT_LABELS: Array<{ key: keyof SubjectBreakdown; label: string }> = [
  { key: 'Math', label: 'Math' },
  { key: 'Physics', label: 'Physics' },
  { key: 'Chemistry', label: 'Chemistry' },
  { key: 'History', label: 'History' },
  { key: 'Other', label: 'Other' },
];

const REPORT_SUBJECT_COLORS: Record<keyof SubjectBreakdown, string> = {
  Math: '#FF0040',
  Physics: '#7C3AED',
  Chemistry: '#F59E0B',
  History: '#16A4E0',
  Other: '#94A3B8',
};

const REPORT_DONUT_SIZE = 184;
const REPORT_DONUT_STROKE_WIDTH = 24;
const REPORT_DONUT_RADIUS = (REPORT_DONUT_SIZE - REPORT_DONUT_STROKE_WIDTH) / 2;
const REPORT_DONUT_CIRCUMFERENCE = 2 * Math.PI * REPORT_DONUT_RADIUS;

export default function TutorScreen() {
  const router = useSafeRouter();
  const params = useSafeSearchParams<{
    openReport?: boolean;
    reportLaunchToken?: number;
  }>();
  const scrollViewRef = useRef<ScrollView>(null);
  const styleListRef = useRef<FlatList<TutorPersona>>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const webAudioUrlRef = useRef<string | null>(null);
  const reportLaunchHandledRef = useRef<string | null>(null);
  const focusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [currentPersona, setCurrentPersona] = useState<TutorPersona>('Einstein');
  const [selectedStylePersona, setSelectedStylePersona] = useState<TutorPersona>('Einstein');
  const [isStylePickerVisible, setIsStylePickerVisible] = useState(false);
  const [isProfileExpanded, setIsProfileExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [recognizedText, setRecognizedText] = useState<string | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [todayDrops, setTodayDrops] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [personaVoicePreferences, setPersonaVoicePreferences] = useState<Partial<Record<TutorPersona, TtsVoice>>>({});
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showReportCard, setShowReportCard] = useState(false);
  const [reportData, setReportData] = useState<TodayStudyReportData | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const latestAssistantMessageIdRef = useRef<string | null>(null);
  const lastAutoWelcomedKeyRef = useRef<string | null>(null);
  const previewPersona = PERSONA_CONFIG[selectedStylePersona];
  const persona = PERSONA_CONFIG[currentPersona];
  const isDesktopWeb = Platform.OS === 'web' && screenWidth >= 980;
  const webModalWidth = Math.min(430, Math.max(320, screenWidth - 24));
  const webModalHeight = Math.max(560, Math.min(920, screenHeight - 24));
  const stylePickerSheetWidth = isDesktopWeb ? webModalWidth : screenWidth;
  const stylePickerListWidth = Math.max(280, stylePickerSheetWidth - 40);
  const styleCardWidth = Math.max(260, stylePickerListWidth - 24);

  // 监听键盘事件
  useEffect(() => {
    const showListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        // 键盘弹出时自动滚动到底部
        setTimeout(() => scrollToBottom(), 100);
      }
    );
    const hideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  // 加载数据
  const loadData = useCallback(async () => {
    const persona = await getCurrentPersona();
    const history = await getChatHistory();
    const drops = await getTodayDrops();
    const voicePreferences = await getPersonaVoicePreferences();
    setCurrentPersona(persona);
    setMessages(history);
    setTodayDrops(drops);
    setPersonaVoicePreferences(voicePreferences);
    
    if (history.length === 0) {
      const welcomeMsg = getWelcomeMessage(persona);
      const sessionDivider = createSessionDividerMessage('New Conversation');
      const initialMessages = [sessionDivider, welcomeMsg];
      setMessages(initialMessages);
      await saveChatHistory(initialMessages);
    }
  }, []);

  useEffect(() => {
    return subscribeToDataReset(() => {
      void loadData();
    });
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useFocusEffect(
    useCallback(() => {
      const appStateSubscription = AppState.addEventListener('change', (state) => {
        const canStartOnWeb =
          Platform.OS !== 'web' || typeof document === 'undefined' || document.visibilityState === 'visible';

        if (state === 'active' && canStartOnWeb) {
          if (!focusIntervalRef.current) {
            focusIntervalRef.current = setInterval(() => {
              void recordTutorFocusDuration(FOCUS_TICK_SECONDS);
            }, FOCUS_TICK_SECONDS * 1000);
          }
        } else if (focusIntervalRef.current) {
          clearInterval(focusIntervalRef.current);
          focusIntervalRef.current = null;
        }
      });

      const canStartImmediately =
        AppState.currentState === 'active' &&
        (Platform.OS !== 'web' || typeof document === 'undefined' || document.visibilityState === 'visible');

      if (canStartImmediately && !focusIntervalRef.current) {
        focusIntervalRef.current = setInterval(() => {
          void recordTutorFocusDuration(FOCUS_TICK_SECONDS);
        }, FOCUS_TICK_SECONDS * 1000);
      }

      const visibilityCleanup =
        Platform.OS === 'web' && typeof document !== 'undefined'
          ? (() => {
              const onVisibilityChange = () => {
                if (document.visibilityState === 'visible') {
                  if (!focusIntervalRef.current) {
                    focusIntervalRef.current = setInterval(() => {
                      void recordTutorFocusDuration(FOCUS_TICK_SECONDS);
                    }, FOCUS_TICK_SECONDS * 1000);
                  }
                } else if (focusIntervalRef.current) {
                  clearInterval(focusIntervalRef.current);
                  focusIntervalRef.current = null;
                }
              };

              document.addEventListener('visibilitychange', onVisibilityChange);
              onVisibilityChange();

              return () => {
                document.removeEventListener('visibilitychange', onVisibilityChange);
              };
            })()
          : null;

      return () => {
        appStateSubscription.remove();
        if (visibilityCleanup) {
          visibilityCleanup();
        }
        if (focusIntervalRef.current) {
          clearInterval(focusIntervalRef.current);
          focusIntervalRef.current = null;
        }
      };
    }, [])
  );

  useEffect(() => {
    if (!isStylePickerVisible) {
      return;
    }

    const selectedIndex = TUTOR_PERSONAS.indexOf(selectedStylePersona);
    const timer = setTimeout(() => {
      styleListRef.current?.scrollToIndex({
        index: Math.max(selectedIndex, 0),
        animated: false,
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [isStylePickerVisible, selectedStylePersona]);

  const stopPlayback = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }

    if (webAudioUrlRef.current) {
      URL.revokeObjectURL(webAudioUrlRef.current);
      webAudioUrlRef.current = null;
    }

    setPlayingMessageId(null);
  }, []);

  useEffect(() => {
    return () => {
      void stopPlayback();
    };
  }, [stopPlayback]);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const readImageAsBase64 = useCallback(async (imageUri: string): Promise<string> => {
    const dataUriMatch = imageUri.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
    if (dataUriMatch?.[1]) {
      return dataUriMatch[1].replace(/\s+/g, '');
    }

    if (Platform.OS === 'web') {
      const response = await fetch(imageUri);
      if (!response.ok) {
        throw new Error(`Failed to load image: ${response.status}`);
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      return Base64.fromUint8Array(bytes);
    }

    return await (FileSystem as any).readAsStringAsync(imageUri, {
      encoding: 'base64',
    });
  }, []);

  const openStylePicker = useCallback(() => {
    setSelectedStylePersona(currentPersona);
    setIsStylePickerVisible(true);
  }, [currentPersona]);

  const updateStyleByOffset = useCallback((offsetX: number) => {
    if (!Number.isFinite(offsetX) || stylePickerListWidth <= 0) {
      return;
    }

    const nextIndex = Math.round(offsetX / stylePickerListWidth);
    const clampedIndex = Math.max(0, Math.min(TUTOR_PERSONAS.length - 1, nextIndex));
    const nextPersona = TUTOR_PERSONAS[clampedIndex];

    if (nextPersona && nextPersona !== selectedStylePersona) {
      setSelectedStylePersona(nextPersona);
    }
  }, [selectedStylePersona, stylePickerListWidth]);

  const handleStyleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      updateStyleByOffset(event.nativeEvent.contentOffset.x);
    },
    [updateStyleByOffset]
  );

  const handleClearConversation = useCallback(() => {
    Alert.alert(
      '清空当前对话',
      '会清除 AI Tutor 的历史消息，并恢复到默认开场白。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清空',
          style: 'destructive',
          onPress: async () => {
            await clearChatHistory();
            await loadData();
          },
        },
      ]
    );
  }, [loadData]);

  const createAudioUriFromResponse = useCallback(async (response: Response) => {
    if (Platform.OS === 'web') {
      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      webAudioUrlRef.current = audioUrl;
      return audioUrl;
    }

    const cacheDirectory = (FileSystem as any).cacheDirectory;
    if (!cacheDirectory) {
      throw new Error('No cache directory available');
    }

    const audioBase64 = Base64.fromUint8Array(new Uint8Array(await response.arrayBuffer()));
    const audioUri = `${cacheDirectory}tts-${Date.now()}.wav`;
    await (FileSystem as any).writeAsStringAsync(audioUri, audioBase64, {
      encoding: 'base64',
    });
    return audioUri;
  }, []);

  const getTtsErrorMessage = useCallback((rawError: string) => {
    const normalized = rawError.trim();

    if (!normalized) {
      return '未收到后端错误详情，请检查 server 日志。';
    }

    try {
      const parsed = JSON.parse(normalized);
      const detail = parsed?.detail;
      const error = parsed?.error;

      if (typeof detail === 'string' && detail.trim()) {
        return detail.trim().slice(0, 180);
      }

      if (typeof error === 'string' && error.trim()) {
        return error.trim().slice(0, 180);
      }
    } catch {
      // Fall through to string heuristics.
    }

    if (normalized.includes('Missing OPENROUTER_API_KEY')) {
      return '服务端缺少 OPENROUTER_API_KEY。';
    }

    if (normalized.includes('No audio data returned')) {
      return 'OpenRouter 已返回成功，但没有生成音频数据。';
    }

    if (normalized.includes('fetch failed') || normalized.includes('timeout')) {
      return '连接 OpenRouter TTS 超时，请稍后重试。';
    }

    return normalized.slice(0, 180);
  }, []);

  const handlePlayMessage = useCallback(async (message: ChatMessage, options?: { isAuto?: boolean; persona?: TutorPersona }) => {
    const isAuto = options?.isAuto ?? false;
    const targetPersona = options?.persona ?? currentPersona;

    if (message.role !== 'assistant') {
      return;
    }

    if (isAuto && latestAssistantMessageIdRef.current !== message.id) {
      return;
    }

    if (playingMessageId === message.id) {
      await stopPlayback();
      return;
    }

    try {
      await stopPlayback();
      setPlayingMessageId(message.id);

      const response = await fetch(
        buildApiUrl('/api/v1/tts'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: message.content,
            persona: targetPersona,
            voice: personaVoicePreferences[targetPersona] ?? null,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(getTtsErrorMessage(errorText));
      }

      if (isAuto && latestAssistantMessageIdRef.current !== message.id) {
        await stopPlayback();
        return;
      }

      const audioUri = await createAudioUriFromResponse(response);
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        {
          shouldPlay: true,
          rate: PERSONA_SPEECH_RATE[targetPersona],
          shouldCorrectPitch: true,
        }
      );

      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          void stopPlayback();
        }
      });
    } catch (error) {
      console.error('TTS playback error:', error);
      await stopPlayback();
      const detail = error instanceof Error ? error.message : '未知错误';
      Alert.alert('语音播放失败', detail);
    }
  }, [createAudioUriFromResponse, currentPersona, getTtsErrorMessage, personaVoicePreferences, playingMessageId, stopPlayback]);

  useEffect(() => {
    if (!isVoiceEnabled) {
      void stopPlayback();
    }
  }, [isVoiceEnabled, stopPlayback]);

  useEffect(() => {
    if (!isVoiceEnabled || messages.length === 0) {
      return;
    }

    const latestMessage = messages[messages.length - 1];
    const expectedWelcome = getWelcomeMessage(currentPersona).content;
    const isPersonaWelcome =
      latestMessage.role === 'assistant' && latestMessage.content === expectedWelcome;

    if (!isPersonaWelcome) {
      return;
    }

    const welcomeKey = `${currentPersona}:${latestMessage.id}`;
    if (lastAutoWelcomedKeyRef.current === welcomeKey) {
      return;
    }

    lastAutoWelcomedKeyRef.current = welcomeKey;
    latestAssistantMessageIdRef.current = latestMessage.id;
    void handlePlayMessage(latestMessage, { isAuto: true, persona: currentPersona });
  }, [currentPersona, handlePlayMessage, isVoiceEnabled, messages]);

  const handleApplyStyle = useCallback(async () => {
    const nextPersona = selectedStylePersona;
    const nextWelcome = getWelcomeMessage(nextPersona);
    const welcomeMessageSet = new Set(
      TUTOR_PERSONAS.map((personaKey) => getWelcomeMessage(personaKey).content)
    );

    setCurrentPersona(nextPersona);
    setIsProfileExpanded(false);
    setIsStylePickerVisible(false);
    await saveCurrentPersona(nextPersona);

    setMessages((prev) => {
      const filteredMessages = prev.filter(
        (message) => !(message.role === 'assistant' && welcomeMessageSet.has(message.content))
      );
      const sessionDivider = createSessionDividerMessage(`Switched to ${PERSONA_CONFIG[nextPersona].label}`);
      const newMessages = [...filteredMessages, sessionDivider, nextWelcome];
      void saveChatHistory(newMessages);
      return newMessages;
    });

    scrollToBottom();
  }, [selectedStylePersona]);

  const handleOpenFinishLearning = useCallback(async () => {
    const todaySolved = await getTodayDrops();

    await trackLocalEvent('click_finish_learning', {
      today_solved: todaySolved,
    });

    if (todaySolved <= 0) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(FINISH_LEARNING_EMPTY_TOAST);
      } else {
        Alert.alert('No progress yet', FINISH_LEARNING_EMPTY_TOAST);
      }
      return;
    }

    setShowFinishModal(true);
  }, []);

  const handleGenerateReport = useCallback(async () => {
    setShowFinishModal(false);
    setIsGeneratingReport(true);

    try {
      const report = await getTodayStudyReportData();
      setReportData(report);

      await trackLocalEvent('generate_report_card', {
        total_mins: report.totalMins,
        total_solved: report.totalSolved,
      });

      setShowReportCard(true);
    } catch (error) {
      console.error('Failed to generate report card:', error);
      Alert.alert('Failed to generate report', 'Please try again in a moment.');
    } finally {
      setIsGeneratingReport(false);
    }
  }, []);

  useEffect(() => {
    if (!params.openReport) {
      return;
    }

    const reportLaunchKey = String(params.reportLaunchToken || 'default');
    if (reportLaunchHandledRef.current === reportLaunchKey) {
      return;
    }

    if (showReportCard || isGeneratingReport) {
      return;
    }

    reportLaunchHandledRef.current = reportLaunchKey;
    void handleGenerateReport();
  }, [handleGenerateReport, isGeneratingReport, params.openReport, params.reportLaunchToken, showReportCard]);

  const handleShareReport = useCallback(async () => {
    if (!reportData) {
      return;
    }

    const breakdownText = REPORT_SUBJECT_LABELS
      .map(({ key, label }) => `${label}: ${reportData.subjectBreakdown[key]}`)
      .join(' · ');

    const message = [
      'Gauth Study Report Card',
      `Today’s Focus Time: ${reportData.totalMins} min`,
      `Problems Solved: ${reportData.totalSolved}`,
      `Subject Breakdown: ${breakdownText}`,
    ].join('\n');

    let shareTarget = 'copy';

    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({
          title: 'Gauth Study Report Card',
          text: message,
        });
        shareTarget = 'ig';
      } else {
        await Share.share({ message, title: 'Gauth Study Report Card' });
        shareTarget = 'tiktok';
      }
    } catch (error) {
      if (String(error).toLowerCase().includes('abort')) {
        return;
      }
      shareTarget = 'copy';
      console.error('Share report failed:', error);
      Alert.alert('Share failed', 'Please try again.');
    } finally {
      await trackLocalEvent('share_report_card', {
        share_target: shareTarget,
      });
    }
  }, [reportData]);

  const reportBreakdownRows = useMemo(() => {
    const breakdown = reportData?.subjectBreakdown;
    const total = breakdown ? Object.values(breakdown).reduce((sum, count) => sum + count, 0) : 0;

    return REPORT_SUBJECT_LABELS.map(({ key, label }) => {
      const value = breakdown?.[key] ?? 0;

      return {
        key,
        label,
        value,
        color: REPORT_SUBJECT_COLORS[key],
        percent: total > 0 ? Math.round((value / total) * 100) : 0,
      };
    });
  }, [reportData]);

  const totalSubjectsSolved = useMemo(() => {
    return reportBreakdownRows.reduce((sum, item) => sum + item.value, 0);
  }, [reportBreakdownRows]);

  const reportDisplayRows = useMemo(() => {
    return reportBreakdownRows.filter((item) => item.key !== 'Other' || item.value > 0);
  }, [reportBreakdownRows]);

  const reportDonutSegments = useMemo(() => {
    const chartRows = reportDisplayRows.length > 0 ? reportDisplayRows : reportBreakdownRows;
    const rowsWithValue = chartRows.some((item) => item.value > 0)
      ? chartRows
      : chartRows.map((item) => ({
          ...item,
          value: 1,
        }));
    const total = rowsWithValue.reduce((sum, item) => sum + item.value, 0);

    let accumulatedRatio = 0;

    return rowsWithValue.map((item) => {
      const ratio = total > 0 ? item.value / total : 0;
      const dashLength = ratio * REPORT_DONUT_CIRCUMFERENCE;
      const segment = {
        key: item.key,
        color: item.color,
        strokeDasharray: `${dashLength} ${REPORT_DONUT_CIRCUMFERENCE}`,
        strokeDashoffset: -accumulatedRatio * REPORT_DONUT_CIRCUMFERENCE,
      };

      accumulatedRatio += ratio;
      return segment;
    });
  }, [reportBreakdownRows, reportDisplayRows]);

  // OCR识别图片文字
  const recognizeImageText = async (imageUri: string): Promise<string | null> => {
    setIsRecognizing(true);
    try {
      const base64 = await readImageAsBase64(imageUri);

      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/ocr
       * Body 参数：imageBase64: string
       */
      const response = await fetch(
        buildApiUrl('/api/v1/ocr'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64 }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.text && data.text !== '未识别到文字') {
          return data.text;
        }
      }
      return null;
    } catch (error) {
      console.log('OCR error:', error);
      return null;
    } finally {
      setIsRecognizing(false);
    }
  };

  // 图片选择
  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.6,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setSelectedImage(uri);
      setRecognizedText(null);
      setInputText('');

      const text = await recognizeImageText(uri);
      if (text) {
        setRecognizedText(text);
        // 不自动填入输入框，识别结果静默发送给后端
      }
    }
  };

  // 拍照
  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('权限不足', '需要相机权限才能拍照');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.6,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setSelectedImage(uri);
      setRecognizedText(null);
      setInputText('');

      const text = await recognizeImageText(uri);
      if (text) {
        setRecognizedText(text);
        // 不自动填入输入框，识别结果静默发送给后端
      }
    }
  };

  // 发送消息
  const handleSend = useCallback(async () => {
    const imageToSend = selectedImage;
    const trimmedInput = inputText.trim();
    const normalizedEasterEggInput = normalizeStyleCommand(trimmedInput);

    if (!imageToSend && normalizedEasterEggInput === '换个风格') {
      setInputText('');
      openStylePicker();
      return;
    }

    // 构建发送给后端的消息（包含识别结果和用户输入）
    const messageToBackend = recognizedText 
      ? `${recognizedText}\n\n${trimmedInput}`
      : trimmedInput;
    // 用户消息气泡显示：有图片时显示"[图片]"前缀
    const messageToDisplay = imageToSend
      ? `[图片]${trimmedInput ? '\n' + trimmedInput : ''}`
      : trimmedInput;

    if (!messageToBackend.trim() && !imageToSend) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: messageToDisplay,
      imageUri: imageToSend || undefined,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setSelectedImage(null);
    setRecognizedText(null);
    setIsTyping(true);
    scrollToBottom();

    try {
      const history = messages
        .filter((msg) => msg.role !== 'system')
        .slice(-10)
        .map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      let imageBase64 = '';
      if (imageToSend) {
        try {
          imageBase64 = await readImageAsBase64(imageToSend);
        } catch (e) {
          console.log('Failed to read image:', e);
          Alert.alert('图片读取失败', '当前图片读取失败，请重新选择图片后再试。');
          return;
        }
      }

      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/tutor
       * Body 参数：message: string, persona: string, history: Array<{role: string, content: string}>, imageBase64?: string
       */
      const response = await fetch(
        buildApiUrl('/api/v1/tutor'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: messageToBackend,
            persona: currentPersona,
            history,
            imageBase64: imageBase64 || null,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const parsedReply = extractSubjectTag(data.content);
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: parsedReply.content,
          timestamp: new Date(),
        };

        const newMessages = [...messages, userMessage, assistantMessage];
        setMessages(newMessages);
        await saveChatHistory(newMessages);

        if (isVoiceEnabled) {
          latestAssistantMessageIdRef.current = assistantMessage.id;
          await handlePlayMessage(assistantMessage, { isAuto: true });
        }

        const newDrops = await addDrop();
        setTodayDrops(newDrops);

        await recordTutorSolvedSubject(parsedReply.subject);

        if (newDrops >= DAILY_DROP_LIMIT) {
          Alert.alert('满杯达成!', '恭喜你完成了今日学习目标!');
        }
      } else {
        throw new Error('API error');
      }
    } catch {
      const fallbackMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '让我想想... 你能再描述一下你的问题吗?',
        timestamp: new Date(),
      };
      const newMessages = [...messages, userMessage, fallbackMsg];
      setMessages(newMessages);
      await saveChatHistory(newMessages);
    } finally {
      setIsTyping(false);
      scrollToBottom();
    }
  }, [currentPersona, handlePlayMessage, inputText, isVoiceEnabled, messages, openStylePicker, readImageAsBase64, recognizedText, selectedImage]);

  return (
    <Screen safeAreaEdges={['left', 'right', 'bottom']}>
      <View className="flex-1 relative">
        <View className="absolute top-0 left-0 right-0 z-20">
          <View
            className="absolute right-5 flex-row items-center justify-end gap-3"
            style={{
              top: insets.top + 10,
              zIndex: 30,
            }}
          >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  void handleOpenFinishLearning();
                }}
                className="flex-row items-center rounded-full border border-[#F2E6EA] bg-[#FFF7F9] px-3 py-1.5"
              >
                <FontAwesome6 name="flag-checkered" size={11} color="#D93A6A" />
                <Text className="ml-1.5 text-xs font-semibold text-[#D93A6A]">Finish Learning</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  router.push('/');
                }}
                className="h-9 w-9 items-center justify-center rounded-full bg-white/90"
              >
                <FontAwesome6 name="house" size={16} color="var(--color-muted)" />
              </TouchableOpacity>
          </View>

          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => setIsProfileExpanded((prev) => !prev)}
          >
            <View
              className="px-5 pb-3"
              style={{
                paddingTop: insets.top + 56,
                backgroundColor: isProfileExpanded ? persona.color : 'var(--color-surface)',
                borderBottomLeftRadius: 32,
                borderBottomRightRadius: 32,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 8,
                elevation: 1,
              }}
            >
              <View className="px-4 pt-3 pb-2 rounded-[28px]">
              <View className="flex-row items-start justify-between">
                <View className="flex-row items-center flex-1">
                  <View className="relative">
                    <View
                      className="w-16 h-16 rounded-2xl items-center justify-center"
                      style={{
                        backgroundColor: isProfileExpanded ? 'rgba(255,255,255,0.2)' : persona.color,
                        width: 64,
                        height: 64,
                        borderRadius: 16,
                        overflow: 'hidden',
                      }}
                    >
                      <Image
                        source={PERSONA_AVATARS[currentPersona]}
                        style={{ width: 56, height: 56, borderRadius: 12 }}
                        resizeMode="cover"
                      />
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={(event) => {
                        event.stopPropagation();
                        setIsVoiceEnabled((prev) => !prev);
                      }}
                      className="absolute -right-1 -bottom-1 w-6 h-6 rounded-full items-center justify-center border border-white"
                      style={{ backgroundColor: isVoiceEnabled ? '#22C55E' : '#111827' }}
                    >
                      <FontAwesome6
                        name={isVoiceEnabled ? 'volume-high' : 'volume-xmark'}
                        size={10}
                        color="#fff"
                      />
                    </TouchableOpacity>
                  </View>
                  <View className="ml-4 flex-1">
                    <View className="flex-row items-center">
                      <Text className={`text-xl font-bold tracking-tight ${
                        isProfileExpanded ? 'text-white' : 'text-[var(--color-foreground)]'
                      }`}>
                        {persona.label}
                      </Text>
                      <View className="ml-2 px-2 py-0.5 bg-[#F5F5F7] rounded-full">
                        <Text className="text-xs text-[var(--color-muted)]">
                          {todayDrops}/{DAILY_DROP_LIMIT}
                        </Text>
                      </View>
                    </View>
                    <View className="flex-row flex-wrap gap-2 mt-2">
                      {persona.traits.map((trait) => (
                        <View
                          key={trait}
                          className={`px-2.5 py-1 rounded-full ${
                            isProfileExpanded ? 'bg-white/16 border border-white/20' : 'bg-[#F5F5F7]'
                          }`}
                        >
                          <Text className={`text-xs font-semibold ${
                            isProfileExpanded ? 'text-white' : 'text-[var(--color-muted)]'
                          }`}>
                            {trait}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
                <View
                  className="w-7 h-7 rounded-full items-center justify-center"
                  style={{ backgroundColor: isProfileExpanded ? 'rgba(255,255,255,0.16)' : '#F5F5F7' }}
                >
                  <FontAwesome6
                    name={isProfileExpanded ? 'chevron-up' : 'chevron-down'}
                    size={12}
                    color={isProfileExpanded ? '#fff' : 'var(--color-muted)'}
                  />
                </View>
              </View>

              {isProfileExpanded && (
                <View className="mt-5">
                  <Text className="text-[22px] font-bold text-white leading-[34px] mt-1">
                    {persona.typicalLanguage}
                  </Text>

                  <View className="h-px bg-white/25 my-5" />

                  <Text className="text-[16px] font-bold text-white leading-6">
                    {persona.solvingStyleTitle}
                  </Text>
                  <Text className="text-[13px] text-white/92 leading-6 mt-2.5">
                    {persona.solvingStyleDescription}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </View>

        {/* Messages */}
        <View className="flex-1">
          <LinearGradient
            pointerEvents="none"
            colors={['#F4F2F5', '#F2F1F6', '#F5F3F4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
            }}
          />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(160, 143, 255, 0.16)', 'rgba(255, 180, 198, 0.08)', 'rgba(255,255,255,0)']}
            locations={[0, 0.58, 1]}
            start={{ x: 0, y: 0.2 }}
            end={{ x: 1, y: 0.9 }}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: isProfileExpanded ? insets.top + 254 : insets.top + 146,
              bottom: 0,
            }}
          />
        <ScrollView
          ref={scrollViewRef}
          className="flex-1 px-5"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: isProfileExpanded ? insets.top + 414 : insets.top + 176,
            paddingBottom: keyboardHeight > 0 ? 16 : 8,
          }}
        >
          {messages.map((message) => {
            if (isSessionDividerMessage(message)) {
              return (
                <View key={message.id} className="mb-4 px-1">
                  <View className="flex-row items-center">
                    <View className="h-px flex-1 bg-[#D8DCE4]" />
                    <Text className="mx-3 text-[11px] font-semibold tracking-[0.2px] text-[var(--color-muted)]">
                      {getSessionDividerLabel(message)}
                    </Text>
                    <View className="h-px flex-1 bg-[#D8DCE4]" />
                  </View>
                </View>
              );
            }

            return (
            <View
              key={message.id}
              className={`flex-row mb-4 ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <View
                className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                  message.role === 'user'
                    ? 'bg-[var(--color-foreground)] rounded-tr-md'
                    : 'bg-[var(--color-surface)] rounded-tl-md'
                }`}
                style={{
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.03,
                  shadowRadius: 4,
                  elevation: 1,
                }}
              >
                {message.imageUri && (
                  <Image
                    source={{ uri: message.imageUri }}
                    style={{ width: 160, height: 160, borderRadius: 12, marginBottom: 8 }}
                    resizeMode="cover"
                  />
                )}
                <Text
                  className={`text-sm leading-relaxed ${
                    message.role === 'user'
                      ? 'text-white'
                      : 'text-[var(--color-foreground)]'
                  }`}
                >
                  {message.content}
                </Text>
              </View>
            </View>
            );
          })}

          {isTyping && (
            <View className="flex-row mb-4 justify-start">
              <View className="bg-[var(--color-surface)] px-4 py-3 rounded-2xl rounded-tl-md" style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.03,
                shadowRadius: 4,
                elevation: 1,
              }}>
                <View className="flex-row items-center">
                  <Text className="text-xs text-[var(--color-muted)] mr-2">
                    {persona.label} is thinking
                  </Text>
                  <AnimatedDots />
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        </View>

        {/* Selected Image Preview */}
        {selectedImage && (
          <View className="px-5 pb-3">
            <View className="flex-row items-center bg-[var(--color-surface)] rounded-2xl p-3"
              style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 8,
                elevation: 1,
              }}
            >
              <View className="relative">
                <Image
                  source={{ uri: selectedImage }}
                  style={{ width: 56, height: 56, borderRadius: 12 }}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#FF3B30] rounded-full items-center justify-center"
                  onPress={() => {
                    setSelectedImage(null);
                    setRecognizedText(null);
                    setInputText('');
                  }}
                >
                  <FontAwesome6 name="xmark" size={10} color="#fff" />
                </TouchableOpacity>
              </View>
              <View className="flex-1 ml-3">
                {isRecognizing ? (
                  <View className="flex-row items-center">
                    <ActivityIndicator size="small" color="var(--color-muted)" />
                    <Text className="text-xs text-[var(--color-muted)] ml-2">
                      识别中...
                    </Text>
                  </View>
                ) : recognizedText ? (
                  <Text className="text-xs text-[var(--color-muted)]" numberOfLines={2}>
                    已识别文字
                  </Text>
                ) : (
                  <Text className="text-xs text-[var(--color-muted)]">
                    可编辑识别结果
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Clean Input Area */}
        <View className={`px-5 ${Platform.OS === 'ios' ? '' : 'pb-5'} pt-2`} style={{ paddingBottom: Platform.OS === 'ios' ? Math.max(keyboardHeight - 34, 20) : 20 }}>
          <View className="flex-row items-end bg-[var(--color-surface)] rounded-2xl px-4 py-3"
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.04,
              shadowRadius: 8,
              elevation: 1,
            }}
          >
            <View className="flex-row gap-2 mr-3">
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handlePickImage}
                className="w-10 h-10 rounded-full bg-[#F5F5F7] items-center justify-center"
              >
                <FontAwesome6 name="image" size={16} color="var(--color-muted)" />
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleTakePhoto}
                className="w-10 h-10 rounded-full bg-[#F5F5F7] items-center justify-center"
              >
                <FontAwesome6 name="camera" size={16} color="var(--color-muted)" />
              </TouchableOpacity>
            </View>
            <TextInput
              className="flex-1 text-sm text-[var(--color-foreground)] max-h-24"
              placeholder={isRecognizing ? "识别中..." : "输入问题..."}
              placeholderTextColor="var(--color-muted)"
              value={inputText}
              onChangeText={setInputText}
              multiline
              textAlignVertical="center"
              editable={!isRecognizing}
            />
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleSend}
              disabled={(!inputText.trim() && !selectedImage) || isRecognizing}
              className={`w-10 h-10 rounded-full items-center justify-center ml-3 ${
                (inputText.trim() || selectedImage) && !isRecognizing
                  ? 'bg-[var(--color-foreground)]'
                  : 'bg-[#E5E5EA]'
              }`}
            >
              <FontAwesome6
                name="paper-plane"
                size={14}
                color={
                  (inputText.trim() || selectedImage) && !isRecognizing
                    ? '#fff'
                    : 'var(--color-muted)'
                }
              />
            </TouchableOpacity>
          </View>
        </View>

        <Modal
          visible={showFinishModal}
          animationType="fade"
          transparent
          onRequestClose={() => setShowFinishModal(false)}
        >
          <View className="flex-1 items-center justify-center px-5">
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setShowFinishModal(false)}
              className="absolute inset-0 bg-black/45"
            />
            <View
              className="w-full rounded-[40px] bg-white px-6 py-7"
              style={{
                width: '100%',
                maxWidth: isDesktopWeb ? webModalWidth : 760,
                shadowColor: '#120811',
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.16,
                shadowRadius: 24,
                elevation: 8,
              }}
            >
              <Text allowFontScaling={false} className="text-center text-[40px] font-black tracking-[-0.8px] text-[#140B16]">
                Wrap up for today?
              </Text>
              <Text allowFontScaling={false} className="mt-4 text-center text-[18px] leading-[27px] text-[#5A667A]">
                You can keep going or generate your study report card now.
              </Text>
              <View className="mt-8 flex-row gap-4">
                <TouchableOpacity
                  className="h-[72px] flex-1 items-center justify-center rounded-[24px] border-[2px] border-[#FF0B4F] bg-white"
                  activeOpacity={0.85}
                  onPress={() => setShowFinishModal(false)}
                >
                  <Text allowFontScaling={false} className="text-[16px] font-bold text-[#09070D]">
                    Keep Learning
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="h-[72px] flex-1 items-center justify-center rounded-[24px] bg-[#FF0040] px-3"
                  activeOpacity={0.85}
                  onPress={() => {
                    void handleGenerateReport();
                  }}
                >
                  <Text allowFontScaling={false} className="text-center text-[16px] font-bold leading-[22px] text-white">
                    Generate Report
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showReportCard}
          animationType={isDesktopWeb ? 'fade' : 'slide'}
          transparent={isDesktopWeb}
          onRequestClose={() => setShowReportCard(false)}
        >
          <View
            className={isDesktopWeb ? 'flex-1 items-center justify-center px-3 py-3 bg-black/45' : 'flex-1'}
          >
            <View
              className="w-full flex-1 bg-[#F9F2F7]"
              style={
                isDesktopWeb
                  ? {
                      maxWidth: webModalWidth,
                      maxHeight: webModalHeight,
                      borderRadius: 30,
                      overflow: 'hidden',
                      shadowColor: '#120811',
                      shadowOffset: { width: 0, height: 12 },
                      shadowOpacity: 0.2,
                      shadowRadius: 24,
                      elevation: 10,
                    }
                  : undefined
              }
            >
              <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 40, paddingBottom: 26 }}
                showsVerticalScrollIndicator={false}
              >
              <Text className="mt-2 text-center text-[20px] font-bold tracking-[-0.2px] text-[#221A22]">
                Daily Learning Report
              </Text>
              <Text className="mt-2 text-center text-[12px] leading-[18px] text-[#5F4A56]">
                You have completed today&apos;s learning tasks
              </Text>

              <View className="mt-6 flex-row gap-4">
                <View
                  className="flex-1 rounded-[18px] border border-[#E5DFE3] bg-[#FAF9FA] px-4 py-4"
                  style={{
                    shadowColor: '#2B1D24',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.05,
                    shadowRadius: 10,
                    elevation: 2,
                  }}
                >
                  <Text className="text-[14px] leading-[19px] text-[#4D3843]">Problem Solved</Text>
                  <Text className="mt-3 text-[22px] font-bold text-[#FF184F]">
                    {reportData?.totalSolved ?? 0} Questions
                  </Text>
                </View>

                <View
                  className="flex-1 rounded-[18px] border border-[#E5DFE3] bg-[#FAF9FA] px-4 py-4"
                  style={{
                    shadowColor: '#2B1D24',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.05,
                    shadowRadius: 10,
                    elevation: 2,
                  }}
                >
                  <Text className="text-center text-[14px] leading-[19px] text-[#4D3843]">Time Spent</Text>
                  <View className="mt-3 flex-row items-center justify-center">
                    <View className="mr-2 h-5 w-5 items-center justify-center rounded-full bg-[#FF184F]">
                      <FontAwesome6 name="clock" size={9} color="#fff" />
                    </View>
                    <Text className="text-[22px] font-bold text-[#FF184F]">
                      {reportData?.totalMins ?? 0} Minute
                    </Text>
                  </View>
                </View>
              </View>

              <View className="mt-5 rounded-[24px] border border-[#E5E6EA] bg-[#F8F8FA] px-4 py-5">
                <Text className="text-[15px] font-semibold text-[#151318]">Subject Distribution</Text>

                <View className="mt-4 items-center justify-center">
                  <View className="h-[184px] w-[184px] items-center justify-center">
                    <Svg
                      width={REPORT_DONUT_SIZE}
                      height={REPORT_DONUT_SIZE}
                      style={{ transform: [{ rotate: '-90deg' }] }}
                    >
                      <Circle
                        cx={REPORT_DONUT_SIZE / 2}
                        cy={REPORT_DONUT_SIZE / 2}
                        r={REPORT_DONUT_RADIUS}
                        fill="none"
                        stroke="#E3E5E8"
                        strokeWidth={REPORT_DONUT_STROKE_WIDTH}
                      />
                      {reportDonutSegments.map((segment) => (
                        <Circle
                          key={segment.key}
                          cx={REPORT_DONUT_SIZE / 2}
                          cy={REPORT_DONUT_SIZE / 2}
                          r={REPORT_DONUT_RADIUS}
                          fill="none"
                          stroke={segment.color}
                          strokeWidth={REPORT_DONUT_STROKE_WIDTH}
                          strokeLinecap="round"
                          strokeDasharray={segment.strokeDasharray}
                          strokeDashoffset={segment.strokeDashoffset}
                        />
                      ))}
                    </Svg>
                    <View className="absolute items-center justify-center">
                      <Text className="text-[16px] font-medium text-[#201B21]">Total</Text>
                      <Text className="text-[40px] leading-[44px] font-semibold text-[#201B21]">{totalSubjectsSolved}</Text>
                    </View>
                  </View>
                </View>

                <View className="mt-4 gap-4">
                  {reportDisplayRows.map((item) => (
                    <View key={item.key}>
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center">
                          <View
                            className="mr-2 h-[12px] w-[12px] rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <Text className="text-[14px] text-[#1F1A20]">{item.label}</Text>
                        </View>
                        <View className="flex-row items-center gap-3">
                          <Text className="text-[14px] font-medium text-[#1F1A20]">{item.value} Questions</Text>
                          <Text className="w-8 text-right text-[14px] text-[#3F2F37]">{item.percent}%</Text>
                        </View>
                      </View>
                      <View className="mt-3 h-[6px] rounded-full bg-[#E0E2E6]">
                        <View
                          className="h-[6px] rounded-full"
                          style={{
                            width: `${item.percent}%`,
                            backgroundColor: item.color,
                          }}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              <View className="mt-5 gap-3">
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => {
                    void handleShareReport();
                  }}
                  className="items-center justify-center rounded-2xl bg-[#FF0040] px-4 py-4"
                >
                  <Text className="text-base font-semibold text-white">Share to IG/TikTok</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => {
                    setShowReportCard(false);
                    router.push('/');
                  }}
                  className="items-center justify-center rounded-2xl border border-[#E7D4DC] bg-white px-4 py-4"
                >
                  <Text className="text-base font-semibold text-[#6D5A63]">Back to Home</Text>
                </TouchableOpacity>
              </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isStylePickerVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setIsStylePickerVisible(false)}
        >
          <View
            className={isDesktopWeb ? 'flex-1 bg-black/45 items-center justify-center px-3 py-3' : 'flex-1 bg-black/45 justify-end'}
          >
            <View
              className="bg-[var(--color-background)] px-5 pt-5 pb-8"
              style={
                isDesktopWeb
                  ? {
                      width: '100%',
                      maxWidth: webModalWidth,
                      maxHeight: webModalHeight,
                      borderRadius: 30,
                      shadowColor: '#120811',
                      shadowOffset: { width: 0, height: 12 },
                      shadowOpacity: 0.2,
                      shadowRadius: 24,
                      elevation: 10,
                    }
                  : {
                      borderTopLeftRadius: 32,
                      borderTopRightRadius: 32,
                    }
              }
            >
              <View className="flex-row items-center justify-between mb-4">
                <View>
                  <Text className="text-xl font-bold text-[var(--color-foreground)]">
                    换个风格
                  </Text>
                  <Text className="text-sm text-[var(--color-muted)] mt-1">
                    左右滑动，挑一个最适合现在状态的 tutor。
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setIsStylePickerVisible(false)}
                  className="w-10 h-10 rounded-full bg-[var(--color-surface)] items-center justify-center"
                >
                  <FontAwesome6 name="xmark" size={16} color="var(--color-muted)" />
                </TouchableOpacity>
              </View>

              <FlatList
                ref={styleListRef}
                data={TUTOR_PERSONAS}
                keyExtractor={(item) => item}
                horizontal
                pagingEnabled
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                style={{ width: stylePickerListWidth, alignSelf: 'center' }}
                onScroll={(event) => updateStyleByOffset(event.nativeEvent.contentOffset.x)}
                scrollEventThrottle={16}
                onScrollEndDrag={handleStyleScrollEnd}
                onMomentumScrollEnd={handleStyleScrollEnd}
                getItemLayout={(_, index) => ({
                  length: stylePickerListWidth,
                  offset: stylePickerListWidth * index,
                  index,
                })}
                renderItem={({ item }) => {
                  const itemPersona = PERSONA_CONFIG[item];
                  const isSelected = item === selectedStylePersona;

                  return (
                    <View style={{ width: stylePickerListWidth }} className="items-center">
                      <TouchableOpacity
                        activeOpacity={0.92}
                        onPress={() => {
                          setSelectedStylePersona(item);
                          styleListRef.current?.scrollToIndex({
                            index: TUTOR_PERSONAS.indexOf(item),
                            animated: true,
                          });
                        }}
                        style={{ width: styleCardWidth }}
                      >
                        <View
                          className="rounded-[28px] p-5"
                          style={{
                            backgroundColor: itemPersona.color,
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 8 },
                            shadowOpacity: isSelected ? 0.12 : 0.06,
                            shadowRadius: 18,
                            elevation: isSelected ? 5 : 2,
                            transform: [{ scale: isSelected ? 1 : 0.98 }],
                          }}
                        >
                          <View className="flex-row items-start justify-between">
                            <View className="flex-row items-center flex-1">
                              <View
                                className="w-16 h-16 rounded-2xl items-center justify-center"
                                style={{
                                  backgroundColor: 'rgba(255,255,255,0.2)',
                                  width: 64,
                                  height: 64,
                                  borderRadius: 16,
                                  overflow: 'hidden',
                                }}
                              >
                                <Image
                                  source={PERSONA_AVATARS[item]}
                                  style={{ width: 56, height: 56, borderRadius: 12 }}
                                  resizeMode="cover"
                                />
                              </View>
                              <View className="ml-4 flex-1">
                                <View className="flex-row items-center flex-wrap">
                                  <Text className="text-xl font-bold tracking-tight text-white">
                                    {itemPersona.label}
                                  </Text>
                                  <View className="ml-2 px-2 py-0.5 bg-[#F5F5F7] rounded-full">
                                    <Text className="text-xs text-[var(--color-muted)]">
                                      {todayDrops}/{DAILY_DROP_LIMIT}
                                    </Text>
                                  </View>
                                </View>
                                <Text className="text-sm mt-1 text-white/85">
                                  {itemPersona.subtitle}
                                </Text>
                              </View>
                            </View>
                            {isSelected && (
                              <View className="w-7 h-7 rounded-full bg-white/18 items-center justify-center">
                                <FontAwesome6 name="check" size={12} color="#fff" />
                              </View>
                            )}
                          </View>

                          <View className="mt-5 flex-row flex-wrap gap-2">
                            {itemPersona.traits.map((trait) => (
                              <View
                                key={trait}
                                className="px-3 py-1.5 rounded-full bg-white/90 border border-white/40"
                              >
                                <Text className="text-sm font-medium" style={{ color: itemPersona.color }}>
                                  {trait}
                                </Text>
                              </View>
                            ))}
                          </View>

                          <Text className="text-[20px] font-bold text-white leading-8 mt-5">
                            {itemPersona.typicalLanguage}
                          </Text>

                          <View className="h-px bg-white/25 my-5" />

                          <Text className="text-[16px] font-bold text-white leading-6">
                            {itemPersona.solvingStyleTitle}
                          </Text>
                          <Text className="text-[13px] text-white/92 leading-6 mt-2.5">
                            {itemPersona.solvingStyleDescription}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />

              <View className="flex-row justify-center gap-2 mt-5 mb-6">
                {TUTOR_PERSONAS.map((item) => (
                  <View
                    key={item}
                    className={`h-2 rounded-full ${item === selectedStylePersona ? 'w-6' : 'w-2'}`}
                    style={{ backgroundColor: item === selectedStylePersona ? previewPersona.color : '#D1D5DB' }}
                  />
                ))}
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={handleApplyStyle}
                className="rounded-2xl py-4 items-center"
                style={{ backgroundColor: previewPersona.color }}
              >
                <Text className="text-white text-base font-bold">gauth it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </Screen>
  );
}
