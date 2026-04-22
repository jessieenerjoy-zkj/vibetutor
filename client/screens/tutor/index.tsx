import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Keyboard,
  Platform,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  Share,
  AppState,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Toast from 'react-native-toast-message';
import { Screen } from '@/components/Screen';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { FontAwesome6 } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ConfettiCelebration } from '@/components/ConfettiCelebration';
import {
  TutorPersona,
  PERSONA_CONFIG,
  ChatMessage,
  MoodType,
} from '@/utils/types';
import { DAILY_DROP_LIMIT } from '@/utils/learning';
import {
  getCurrentPersona,
  saveCurrentPersona,
  getChatHistory,
  saveChatHistory,
  addDrop,
  getTodayDrops,
  getTodayMood,
  shouldTutorAutoGreet,
  saveTutorGreetingState,
  trackLocalEvent,
  extractSubjectTag,
  recordTutorSolvedSubject,
  getTodayStudyReportData,
  recordTutorFocusDuration,
  type DropUpdateResult,
  type SubjectBreakdown,
  type TodayStudyReportData,
} from '@/utils/storage';

const PERSONAS: TutorPersona[] = ['Gentle', 'Gordon', 'Trump', 'WiseElder', 'Neutral'];
const resolveBackendBaseUrl = () => {
  const configured = process.env.EXPO_PUBLIC_BACKEND_BASE_URL?.replace(/\/$/, '');

  if (configured) {
    return configured;
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:9091`;
  }

  return 'http://127.0.0.1:9091';
};

const BACKEND_BASE_URL = resolveBackendBaseUrl();

const MIN_IMAGE_BASE64_LENGTH = 1000;

const FINISH_LEARNING_EMPTY_TOAST = "You haven't solved any problems yet today. Let's get started!";
const FOCUS_TICK_SECONDS = 10;

const REPORT_SUBJECT_LABELS: Array<{ key: keyof SubjectBreakdown; label: string }> = [
  { key: 'Math', label: 'Math' },
  { key: 'Physics', label: 'Physics' },
  { key: 'Chemistry', label: 'Chemistry' },
  { key: 'History', label: 'History' },
  { key: 'Other', label: 'Other' },
];

const PERSONA_MOOD_GREETINGS: Record<MoodType, Record<TutorPersona, string>> = {
  Crushed: {
    Gordon: "*Sigh.* You look like you've been through it. Fine, I'll go easy... for now. Show me the problem.",
    Gentle: "Hey, it's okay. You don't have to be perfect. Let's just take one small step together. What's on your mind?",
    Trump: "A bad day? Believe me, I've seen worse. But we're going to turn it around - hugely. Give me your toughest problem!",
    WiseElder: 'Ah, my child. When the heart is heavy, even a simple question feels like a mountain. Sit with me. Tell me where it hurts.',
    Neutral: "I notice you're feeling overwhelmed. That's okay. Please share the problem you're working on, and we'll go step by step.",
  },
  Stuck: {
    Gordon: "Stuck? Seriously? Okay, let's unstick you. Show me where you froze - and don't give me that blank look.",
    Gentle: "Being stuck just means you're about to learn something new. Let's look at it together. Where did you get lost?",
    Trump: "Stuck? That's unacceptable - we're going to fix it fast. Nobody gets unstuck like me. What's the problem?",
    WiseElder: "Ah, stuck. That's a good place. It means you've tried. Let me tell you a short story about a key and a lock... then we'll look at your problem.",
    Neutral: "You're stuck on a problem. That's common. Please paste or describe the problem, and I'll help you identify the first point of confusion.",
  },
  Calm: {
    Gordon: "Calm, huh? Good. Let's keep you on your toes. Throw me a problem - I'll make sure you don't fall asleep.",
    Gentle: "A calm mind learns best. I'm glad you're here. What would you like to work on today?",
    Trump: "Calm is nice, but winning is better. I'll give you the best explanations, believe me. Send your problem.",
    WiseElder: "Peaceful. That's when the mind listens. What question shall we gently unfold today, child?",
    Neutral: "You're in a stable state. Let's proceed efficiently. Please share the problem you want to solve.",
  },
  Engaged: {
    Gordon: "Finally, someone with focus! Let's go. Give me a problem - I won't go easy on you. Ready?",
    Gentle: "Love your energy! You're really focused. Let's channel that into solving something great. What's the challenge?",
    Trump: "Engaged? Tremendous. That's the spirit of a winner. I will give you the best tutoring you've ever had. Ask me anything.",
    WiseElder: 'Ah, the fire of focus. I see it in your eyes. Then let us not waste it. Present your question, and we shall reason together.',
    Neutral: "You appear highly focused. That's optimal for learning. Please provide the problem, and I will give a structured solution.",
  },
  Hyper: {
    Gordon: "Whoa, too much caffeine? Calm down a notch. But since you're hyped, let's burn that energy on a hard problem. Go!",
    Gentle: "You're full of energy today! That's great, but let's take a deep breath and focus it. Show me a problem - we'll solve it fast.",
    Trump: "Hyper energy? I love it. That's winning energy. But let's make it smart energy. Give me a problem - we'll crush it. Huge.",
    WiseElder: "Eager, aren't we? Slow down just a little, my child. A racing horse stumbles. Breathe, then tell me what you want to learn.",
    Neutral: "High energy detected. That's fine. Let's focus it on problem-solving. Please present your question, and I'll respond clearly and directly.",
  },
};

const AnimatedDots = () => {
  const opacity1 = useSharedValue(0.3);
  const opacity2 = useSharedValue(0.3);
  const opacity3 = useSharedValue(0.3);

  opacity1.value = withRepeat(
    withSequence(withDelay(0, withTiming(1, { duration: 400 })), withTiming(0.3, { duration: 400 })),
    -1,
    false
  );

  opacity2.value = withRepeat(
    withSequence(withDelay(150, withTiming(1, { duration: 400 })), withTiming(0.3, { duration: 400 })),
    -1,
    false
  );

  opacity3.value = withRepeat(
    withSequence(withDelay(300, withTiming(1, { duration: 400 })), withTiming(0.3, { duration: 400 })),
    -1,
    false
  );

  const style1 = useAnimatedStyle(() => ({ opacity: opacity1.value }));
  const style2 = useAnimatedStyle(() => ({ opacity: opacity2.value }));
  const style3 = useAnimatedStyle(() => ({ opacity: opacity3.value }));

  return (
    <View className="flex-row items-center gap-1.5">
      <Animated.View className="w-1.5 h-1.5 rounded-full bg-[var(--color-muted)]" style={style1} />
      <Animated.View className="w-1.5 h-1.5 rounded-full bg-[var(--color-muted)]" style={style2} />
      <Animated.View className="w-1.5 h-1.5 rounded-full bg-[var(--color-muted)]" style={style3} />
    </View>
  );
};

const getWelcomeMessage = (persona: TutorPersona, mood: MoodType): ChatMessage => ({
  id: Date.now().toString(),
  role: 'assistant',
  content: PERSONA_MOOD_GREETINGS[mood][persona],
  persona,
  timestamp: new Date(),
});

export default function TutorScreen() {
  const router = useSafeRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const personaScrollRef = useRef<ScrollView>(null);
  const launchHandledRef = useRef<string | null>(null);
  const params = useSafeSearchParams<{
    entrySource?: string;
    persona?: TutorPersona;
    mood?: MoodType;
    autoGreeting?: boolean;
    launchToken?: number;
  }>();
  const [currentPersona, setCurrentPersona] = useState<TutorPersona>('Neutral');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageBase64, setSelectedImageBase64] = useState<string | null>(null);
  const [recognizedText, setRecognizedText] = useState<string | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [todayDrops, setTodayDrops] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [todayMood, setTodayMood] = useState<MoodType>('Calm');
  const [celebration, setCelebration] = useState<DropUpdateResult['unlockedStamp']>(null);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showReportCard, setShowReportCard] = useState(false);
  const [reportData, setReportData] = useState<TodayStudyReportData | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const legacyGreetingTexts = useRef(['嘿，亲爱的。今天感觉怎么样?我在这里陪着你，慢慢来，不着急哦~']);
  const focusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const pushGreetingMessage = useCallback(
    async (persona: TutorPersona, mood: MoodType, baseMessages: ChatMessage[]) => {
      const nextMessages = [
        ...baseMessages,
        {
          id: `${Date.now()}-divider-${persona}`,
          role: 'system' as const,
          content: `Switched to ${PERSONA_CONFIG[persona].label}`,
          persona,
          timestamp: new Date(),
        },
        {
          ...getWelcomeMessage(persona, mood),
          id: `${Date.now()}-${persona}`,
        },
      ];

      setMessages(nextMessages);
      await saveChatHistory(nextMessages);
      await saveTutorGreetingState(persona);
      scrollToBottom();
    },
    []
  );

  useEffect(() => {
    const showListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => {
        setKeyboardHeight(event.endCoordinates.height);
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

  const loadData = useCallback(async () => {
    const [persona, mood, history, drops] = await Promise.all([
      getCurrentPersona(),
      getTodayMood(),
      getChatHistory(),
      getTodayDrops(),
    ]);
    const sanitizedHistory = history.filter(
      (message) => !legacyGreetingTexts.current.includes(message.content)
    );

    setCurrentPersona(persona);
    setTodayMood(mood || 'Calm');
    setMessages(sanitizedHistory);
    setTodayDrops(drops);
    if (sanitizedHistory.length !== history.length) {
      await saveChatHistory(sanitizedHistory);
    }

    if (sanitizedHistory.length === 0) {
      const welcomeMessage = getWelcomeMessage(persona, mood || 'Calm');
      const nextMessages = [welcomeMessage];
      setMessages(nextMessages);
      await saveChatHistory(nextMessages);
      await saveTutorGreetingState(persona);
    }
  }, []);

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
    if (!params.persona || !params.autoGreeting) {
      return;
    }

    const launchKey = `${params.persona}-${params.launchToken || 'default'}`;
    if (launchHandledRef.current === launchKey) {
      return;
    }

    launchHandledRef.current = launchKey;

    const targetPersona = params.persona;
    void (async () => {
      const mood = params.mood || (await getTodayMood()) || 'Calm';
      await saveCurrentPersona(targetPersona);
      setCurrentPersona(targetPersona);
      setTodayMood(mood);

      setTimeout(() => {
        const personaIndex = PERSONAS.indexOf(targetPersona);
        if (personaIndex >= 0) {
          personaScrollRef.current?.scrollTo({
            x: Math.max(0, personaIndex * 110 - 24),
            animated: true,
          });
        }
      }, 80);

      const history = await getChatHistory();
      const shouldGreet = await shouldTutorAutoGreet(targetPersona);
      if (!shouldGreet) {
        setMessages(history);
        return;
      }

      await pushGreetingMessage(targetPersona, mood, history);
    })();
  }, [params.autoGreeting, params.launchToken, params.persona, pushGreetingMessage]);

  const handlePersonaChange = async (persona: TutorPersona) => {
    if (persona === currentPersona) return;

    await saveCurrentPersona(persona);
    setCurrentPersona(persona);

    setTimeout(() => {
      const personaIndex = PERSONAS.indexOf(persona);
      if (personaIndex >= 0) {
        personaScrollRef.current?.scrollTo({
          x: Math.max(0, personaIndex * 110 - 24),
          animated: true,
        });
      }
    }, 80);

    await pushGreetingMessage(persona, todayMood, messages);
  };

  const readImageAsBase64 = async (imageUri: string): Promise<string> => {
    if (Platform.OS === 'web') {
      const response = await fetch(imageUri);
      const blob = await response.blob();

      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result !== 'string') {
            reject(new Error('Web image read failed: invalid FileReader result'));
            return;
          }

          const base64 = reader.result.split(',')[1] || '';
          if (!base64) {
            reject(new Error('Web image read failed: empty base64 payload'));
            return;
          }

          resolve(base64);
        };
        reader.onerror = () => reject(new Error('Web image read failed: FileReader error'));
        reader.readAsDataURL(blob);
      });
    }

    return await (FileSystem as any).readAsStringAsync(imageUri, {
      encoding: 'base64',
    });
  };

  const readWebFileAsBase64 = async (file: File): Promise<string> => {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error('Web file read failed: invalid FileReader result'));
          return;
        }

        const base64 = reader.result.split(',')[1] || '';
        if (!base64) {
          reject(new Error('Web file read failed: empty base64 payload'));
          return;
        }

        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Web file read failed: FileReader error'));
      reader.readAsDataURL(file);
    });
  };

  const getImageBase64FromAsset = async (asset: ImagePicker.ImagePickerAsset): Promise<string> => {
    if (Platform.OS === 'web') {
      const webAsset = asset as ImagePicker.ImagePickerAsset & { file?: File };

      if (webAsset.file) {
        return await readWebFileAsBase64(webAsset.file);
      }

      if (asset.uri.startsWith('data:image/')) {
        const payload = asset.uri.split(',')[1] || '';
        if (payload) return payload;
      }
    }

    if (asset.base64 && asset.base64.length >= MIN_IMAGE_BASE64_LENGTH) {
      return asset.base64;
    }

    return await readImageAsBase64(asset.uri);
  };

  const recognizeImageText = async (imageBase64: string): Promise<string | null> => {
    setIsRecognizing(true);
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/v1/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      });

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

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.6,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const uri = asset.uri;
      let base64 = '';
      try {
        base64 = await getImageBase64FromAsset(asset);
      } catch (error) {
        console.log('Failed to read picked image base64:', error);
      }

      setSelectedImage(uri);
      setSelectedImageBase64(base64 || null);
      setRecognizedText(null);
      setInputText('');

      const text = base64 ? await recognizeImageText(base64) : null;
      if (text) {
        setRecognizedText(text);
      }
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('权限不足', '需要相机权限才能拍照');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.6,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const uri = asset.uri;
      let base64 = '';
      try {
        base64 = await getImageBase64FromAsset(asset);
      } catch (error) {
        console.log('Failed to read captured image base64:', error);
      }

      setSelectedImage(uri);
      setSelectedImageBase64(base64 || null);
      setRecognizedText(null);
      setInputText('');

      const text = base64 ? await recognizeImageText(base64) : null;
      if (text) {
        setRecognizedText(text);
      }
    }
  };

  const buildDropSignature = (
    message: string,
    imageBase64?: string | null,
    imageUri?: string | null
  ): string => {
    const normalizedMessage = message.trim().replace(/\s+/g, ' ').slice(0, 240);
    const imageFingerprint = imageBase64
      ? `${imageBase64.slice(0, 32)}:${imageBase64.length}`
      : imageUri || 'no-image';

    return `${normalizedMessage}::${imageFingerprint}`;
  };

  const handleDropEffects = (result: DropUpdateResult) => {
    if (result.goalReached) {
      Toast.show({
        type: 'success',
        text1: 'Daily goal met!',
        text2: result.unlockedStamp
          ? `You've nurtured ${result.unlockedStamp.label}.`
          : 'Your Learning Drop is full for today.',
      });
    }

    if (result.unlockedStamp) {
      setCelebration(result.unlockedStamp);
      return;
    }

    if (result.duplicate) {
      Toast.show({
        type: 'info',
        text1: 'No extra drop this time',
        text2: 'Repeated questions do not add another drop.',
      });
    }
  };

  const handleOpenFinishLearning = useCallback(async () => {
    const todaySolved = await getTodayDrops();

    await trackLocalEvent('click_finish_learning', {
      today_solved: todaySolved,
    });

    if (todaySolved <= 0) {
      Toast.show({
        type: 'info',
        text1: FINISH_LEARNING_EMPTY_TOAST,
      });
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
      Toast.show({
        type: 'error',
        text1: 'Failed to generate report',
        text2: 'Please try again in a moment.',
      });
    } finally {
      setIsGeneratingReport(false);
    }
  }, []);

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
      Toast.show({
        type: 'info',
        text1: 'Share failed',
        text2: 'Please try again.',
      });
    } finally {
      await trackLocalEvent('share_report_card', {
        share_target: shareTarget,
      });
    }
  }, [reportData]);

  const reportBreakdownRows = useMemo(() => {
    const breakdown = reportData?.subjectBreakdown;
    if (!breakdown) {
      return [];
    }

    return REPORT_SUBJECT_LABELS
      .map(({ key, label }) => ({
        key,
        label,
        value: breakdown[key],
      }))
      .filter((item) => item.value > 0);
  }, [reportData]);

  const totalSubjectsSolved = useMemo(() => {
    if (!reportData) {
      return 0;
    }

    return Object.values(reportData.subjectBreakdown).reduce((sum, count) => sum + count, 0);
  }, [reportData]);

  const handleSend = useCallback(async () => {
    const imageToSend = selectedImage;
    const imageBase64ToSend = selectedImageBase64;
    const messageToBackend = recognizedText ? `${recognizedText}\n\n${inputText.trim()}` : inputText.trim();
    const messageToDisplay = imageToSend
      ? `[图片]${inputText.trim() ? `\n${inputText.trim()}` : ''}`
      : inputText.trim();

    if (!messageToBackend.trim() && !imageToSend && !imageBase64ToSend) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: messageToDisplay,
      imageUri: imageToSend || undefined,
      timestamp: new Date(),
    };

    const optimisticMessages = [...messages, userMessage];
    setMessages(optimisticMessages);
    setInputText('');
    setSelectedImage(null);
    setSelectedImageBase64(null);
    setRecognizedText(null);
    setIsTyping(true);
    scrollToBottom();

    try {
      const history = messages.slice(-10).map((message) => ({
        role: message.role,
        content: message.content,
      }));

      let imageBase64 = imageBase64ToSend || '';
      if (!imageBase64 && imageToSend) {
        try {
          imageBase64 = await readImageAsBase64(imageToSend);
        } catch (error) {
          console.log('Failed to read image:', error);
        }
      }

      const response = await fetch(`${BACKEND_BASE_URL}/api/v1/tutor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageToBackend,
          persona: currentPersona,
          history,
          imageBase64: imageBase64 || null,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const parsedReply = extractSubjectTag(data.content);
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: parsedReply.content,
          timestamp: new Date(),
        };

        const nextMessages = [...messages, userMessage, assistantMessage];
        setMessages(nextMessages);
        await saveChatHistory(nextMessages);

        try {
          const dedupeKey = buildDropSignature(messageToBackend, imageBase64, imageToSend);
          const dropResult = await addDrop({ dedupeKey });
          setTodayDrops(dropResult.drops);

          if (dropResult.added) {
            await recordTutorSolvedSubject(parsedReply.subject);
          }

          handleDropEffects(dropResult);
        } catch (dropError) {
          console.error('Learning Drop update error:', dropError);
        }
      } else {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
      }
    } catch (error) {
      console.error('Tutor API error:', error);
      const fallbackMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Let me think... can you share the problem one more time with a bit more detail?',
        timestamp: new Date(),
      };
      const nextMessages = [...messages, userMessage, fallbackMessage];
      setMessages(nextMessages);
      await saveChatHistory(nextMessages);
    } finally {
      setIsTyping(false);
      scrollToBottom();
    }
  }, [currentPersona, inputText, messages, recognizedText, selectedImage, selectedImageBase64]);

  return (
    <Screen>
      <View className="flex-1">
        <View className="px-5 pt-4 pb-3">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center">
              <Text className="text-xl font-bold text-[var(--color-foreground)] tracking-tight">
                AI Tutor
              </Text>
              <View className="ml-2 px-2 py-0.5 bg-[#F5F5F7] rounded-full">
                <Text className="text-xs text-[var(--color-muted)]">{todayDrops}/{DAILY_DROP_LIMIT}</Text>
              </View>
            </View>
            <View className="flex-row items-center gap-3">
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
              <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/')}>
                <FontAwesome6 name="house" size={18} color="var(--color-muted)" />
              </TouchableOpacity>
            </View>
          </View>

          <View>
            <ScrollView
              ref={personaScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingRight: 20 }}
>
              <View className="flex-row gap-2">
              {PERSONAS.map((persona) => {
                const config = PERSONA_CONFIG[persona];
                const isActive = persona === currentPersona;
                return (
                  <TouchableOpacity
                    key={persona}
                    activeOpacity={0.7}
                    onPress={() => handlePersonaChange(persona)}
                    className={`px-4 py-2 rounded-full ${
                      isActive ? 'bg-[var(--color-foreground)]' : 'bg-[var(--color-surface)]'
                    }`}
                    style={{
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: isActive ? 0 : 0.04,
                      shadowRadius: 4,
                      elevation: isActive ? 0 : 1,
                    }}
                  >
                    <View className="items-center mb-1">
                      <FontAwesome6
                        name={config.icon as any}
                        size={14}
                        color={isActive ? '#fff' : config.iconColor}
                      />
                    </View>
                    <Text className={`text-xs font-medium ${isActive ? 'text-white' : 'text-[var(--color-muted)]'}`}>
                      {config.label}
                    </Text>
                  </TouchableOpacity>
                );
                })}
              </View>
            </ScrollView>
          </View>
        </View>

        <ScrollView
          ref={scrollViewRef}
          className="flex-1 px-5"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 16, paddingBottom: keyboardHeight > 0 ? 16 : 8 }}
        >
          {messages.map((message) =>
            message.role === 'system' ? (
              <View key={message.id} className="items-center mb-4">
                <View className="px-3 py-1.5 rounded-full bg-[var(--color-surface)]">
                  <Text className="text-xs text-[var(--color-muted)] font-medium">{message.content}</Text>
                </View>
              </View>
            ) : (
              <View
                key={message.id}
                className={`flex-row mb-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
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
                  {message.imageUri ? (
                    <Image source={{ uri: message.imageUri }} className="w-40 h-40 rounded-xl mb-2" resizeMode="cover" />
                  ) : null}
                  <Text
                    className={`text-sm leading-relaxed ${
                      message.role === 'user' ? 'text-white' : 'text-[var(--color-foreground)]'
                    }`}
                  >
                    {message.content}
                  </Text>
                </View>
              </View>
            )
          )}

          {isTyping ? (
            <View className="flex-row mb-4 justify-start">
              <View
                className="bg-[var(--color-surface)] px-4 py-3 rounded-2xl rounded-tl-md"
                style={{
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.03,
                  shadowRadius: 4,
                  elevation: 1,
                }}
              >
                <View className="flex-row items-center">
                  <Text className="text-xs text-[var(--color-muted)] mr-2">
                    {PERSONA_CONFIG[currentPersona].label} is thinking
                  </Text>
                  <AnimatedDots />
                </View>
              </View>
            </View>
          ) : null}
        </ScrollView>

        {selectedImage ? (
          <View className="px-5 pt-3">
            <View className="bg-[var(--color-surface)] rounded-2xl p-3 flex-row items-center">
              <Image source={{ uri: selectedImage }} className="w-14 h-14 rounded-xl mr-3" resizeMode="cover" />
              <View className="flex-1">
                <Text className="text-sm font-medium text-[var(--color-foreground)]">Image attached</Text>
                <Text className="text-xs text-[var(--color-muted)] mt-1">
                  {isRecognizing ? 'Recognizing text...' : recognizedText ? 'Text recognized and ready to send' : 'Will send as image question'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => {
                setSelectedImage(null);
                setSelectedImageBase64(null);
                setRecognizedText(null);
              }}>
                <FontAwesome6 name="xmark" size={16} color="var(--color-muted)" />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View className="px-5 pt-3 pb-5" style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight + 12 : 20 }}>
          <View className="bg-[var(--color-surface)] rounded-[28px] px-4 py-3">
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              multiline
              placeholder="Ask a question or upload a problem..."
              placeholderTextColor="#9CA3AF"
              className="text-[15px] text-[var(--color-foreground)] min-h-[42px] max-h-28"
            />
            <View className="flex-row items-center justify-between mt-3">
              <View className="flex-row items-center gap-3">
                <TouchableOpacity activeOpacity={0.7} onPress={handlePickImage}>
                  <FontAwesome6 name="image" size={18} color="var(--color-muted)" />
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.7} onPress={handleTakePhoto}>
                  <FontAwesome6 name="camera" size={18} color="var(--color-muted)" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleSend}
                className="w-10 h-10 rounded-full bg-[var(--color-foreground)] items-center justify-center"
                disabled={isTyping || isGeneratingReport}
              >
                {isTyping || isGeneratingReport ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <FontAwesome6 name="arrow-up" size={14} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      <Modal
        visible={showFinishModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowFinishModal(false)}
      >
        <View className="flex-1 items-center justify-center px-6">
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setShowFinishModal(false)}
            className="absolute inset-0 bg-black/35"
          />
          <View className="w-full max-w-[360px] rounded-3xl bg-white px-6 py-6">
            <Text className="text-center text-xl font-bold text-[#22171D]">Wrap up for today?</Text>
            <Text className="mt-3 text-center text-sm leading-5 text-[#6B5A61]">
              You can keep going or generate your study report card now.
            </Text>
            <View className="mt-6 flex-row gap-3">
              <TouchableOpacity
                className="flex-1 items-center justify-center rounded-2xl border border-[#E9DCE1] bg-[#FFF8FA] py-3"
                activeOpacity={0.85}
                onPress={() => setShowFinishModal(false)}
              >
                <Text className="text-sm font-semibold text-[#8B6A76]">Keep Learning</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 items-center justify-center rounded-2xl bg-[#D93A6A] py-3"
                activeOpacity={0.85}
                onPress={() => {
                  void handleGenerateReport();
                }}
              >
                <Text className="text-sm font-semibold text-white">Yes, generate my report</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showReportCard}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowReportCard(false)}
      >
        <View className="flex-1 bg-[#F9F2F7]">
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 44, paddingBottom: 28 }}
            showsVerticalScrollIndicator={false}
          >
            <View className="items-center">
              <Text className="text-[50px] leading-[64px] text-[#FFE1EC]">✦</Text>
              <Text className="mt-1 text-center text-[50px] leading-[64px] text-[#FFE1EC]">✦</Text>
            </View>

            <Text className="mt-2 text-center text-[38px] font-black tracking-[-0.9px] text-[#221A22]">
              Daily Learning Report
            </Text>
            <Text className="mt-3 text-center text-[28px] leading-[36px] text-[#5F4A56]">
              You have completed today&apos;s learning tasks
            </Text>

            <View className="mt-8 flex-row gap-4">
              <View
                className="flex-1 rounded-[26px] border border-[#E5DFE3] bg-[#FAF9FA] px-5 py-5"
                style={{
                  shadowColor: '#2B1D24',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.06,
                  shadowRadius: 16,
                  elevation: 2,
                }}
              >
                <Text className="text-[20px] leading-[27px] text-[#4D3843]">Questions</Text>
                <Text className="text-[20px] leading-[27px] text-[#4D3843]">Photographed</Text>
                <Text className="mt-4 text-[42px] font-extrabold text-[#FF184F]">
                  {reportData?.totalSolved ?? 0} Questions
                </Text>
              </View>

              <View
                className="flex-1 rounded-[26px] border border-[#E5DFE3] bg-[#FAF9FA] px-5 py-5"
                style={{
                  shadowColor: '#2B1D24',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.06,
                  shadowRadius: 16,
                  elevation: 2,
                }}
              >
                <Text className="text-center text-[20px] leading-[27px] text-[#4D3843]">Time Spent</Text>
                <View className="mt-5 flex-row items-center justify-center">
                  <View className="mr-2 h-7 w-7 items-center justify-center rounded-full bg-[#FF184F]">
                    <FontAwesome6 name="clock" size={12} color="#fff" />
                  </View>
                  <Text className="text-[42px] font-extrabold text-[#FF184F]">
                    {reportData?.totalMins ?? 0} Minute
                  </Text>
                </View>
              </View>
            </View>

            <View className="mt-6 rounded-[24px] border border-[#E8E0E5] bg-white px-5 py-5">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-semibold uppercase tracking-[1.5px] text-[#8D6A79]">Subject Breakdown</Text>
                <Text className="text-xs text-[#9C7B88]">{totalSubjectsSolved} solved</Text>
              </View>
              <View className="mt-3 gap-2">
                {reportBreakdownRows.length > 0 ? (
                  reportBreakdownRows.map((item) => (
                    <View key={item.key} className="flex-row items-center justify-between rounded-xl bg-[#FFF3F7] px-3 py-2">
                      <Text className="text-sm font-medium text-[#4A3440]">{item.label}</Text>
                      <Text className="text-sm font-semibold text-[#B84370]">{item.value}</Text>
                    </View>
                  ))
                ) : (
                  <Text className="text-sm text-[#8D7280]">No solved problems recorded today.</Text>
                )}
              </View>
            </View>

            <View className="mt-6 gap-3">
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => {
                  void handleShareReport();
                }}
                className="items-center justify-center rounded-2xl bg-[#D93A6A] px-4 py-4"
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
      </Modal>

      <ConfettiCelebration
        visible={Boolean(celebration)}
        title={celebration ? `Congratulations! You've nurtured ${celebration.label}!` : ''}
        description={celebration ? `Check it out in your Mind Garden. ${celebration.dedication}` : ''}
        ctaLabel="Open Mind Garden"
        onClose={() => setCelebration(null)}
        onCta={() => {
          setCelebration(null);
          router.push('/profile');
        }}
      />
    </Screen>
  );
}
