import { useState, useRef, useCallback, useEffect } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Screen } from '@/components/Screen';
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

export default function TutorScreen() {
  const scrollViewRef = useRef<ScrollView>(null);
  const styleListRef = useRef<FlatList<TutorPersona>>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const webAudioUrlRef = useRef<string | null>(null);
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
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
  const latestAssistantMessageIdRef = useRef<string | null>(null);
  const lastAutoWelcomedKeyRef = useRef<string | null>(null);
  const previewPersona = PERSONA_CONFIG[selectedStylePersona];
  const persona = PERSONA_CONFIG[currentPersona];
  const styleCardWidth = Math.max(screenWidth - 56, 280);

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
      setMessages([welcomeMsg]);
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
    if (!Number.isFinite(offsetX) || screenWidth <= 0) {
      return;
    }

    const nextIndex = Math.round(offsetX / screenWidth);
    const clampedIndex = Math.max(0, Math.min(TUTOR_PERSONAS.length - 1, nextIndex));
    const nextPersona = TUTOR_PERSONAS[clampedIndex];

    if (nextPersona && nextPersona !== selectedStylePersona) {
      setSelectedStylePersona(nextPersona);
    }
  }, [screenWidth, selectedStylePersona]);

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
      const newMessages = [...filteredMessages, nextWelcome];
      void saveChatHistory(newMessages);
      return newMessages;
    });

    if (isVoiceEnabled) {
      latestAssistantMessageIdRef.current = nextWelcome.id;
      await handlePlayMessage(nextWelcome, { isAuto: true, persona: nextPersona });
    }

    scrollToBottom();
  }, [handlePlayMessage, isVoiceEnabled, selectedStylePersona]);

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
      const history = messages.slice(-10).map((msg) => ({
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
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.content,
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

        if (newDrops >= 10) {
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
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => setIsProfileExpanded((prev) => !prev)}
          >
            <View
              className="px-5 pb-5"
              style={{
                paddingTop: insets.top + 16,
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
              <View className="p-4 rounded-[28px]">
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
                          {todayDrops}/10
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
        <ScrollView
          ref={scrollViewRef}
          className="flex-1 px-5"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: isProfileExpanded ? insets.top + 380 : insets.top + 140,
            paddingBottom: keyboardHeight > 0 ? 16 : 8,
          }}
        >
          {messages.map((message) => (
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
          ))}

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
          visible={isStylePickerVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setIsStylePickerVisible(false)}
        >
          <View className="flex-1 bg-black/45 justify-end">
            <View className="rounded-t-[32px] bg-[var(--color-background)] px-5 pt-5 pb-8">
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
                onScroll={(event) => updateStyleByOffset(event.nativeEvent.contentOffset.x)}
                scrollEventThrottle={16}
                onScrollEndDrag={handleStyleScrollEnd}
                onMomentumScrollEnd={handleStyleScrollEnd}
                getItemLayout={(_, index) => ({
                  length: screenWidth,
                  offset: screenWidth * index,
                  index,
                })}
                renderItem={({ item }) => {
                  const itemPersona = PERSONA_CONFIG[item];
                  const isSelected = item === selectedStylePersona;

                  return (
                    <View style={{ width: screenWidth }} className="items-center">
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
                                      {todayDrops}/10
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
