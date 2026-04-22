// 心情类型
export type MoodType = 'Crushed' | 'Stuck' | 'Calm' | 'Engaged' | 'Hyper';

export const MOOD_TYPES: MoodType[] = ['Crushed', 'Stuck', 'Calm', 'Engaged', 'Hyper'];

// Tutor 学科分类
export type SubjectType = 'Math' | 'Physics' | 'Chemistry' | 'History' | 'Other';

export const normalizeMoodType = (value: unknown): MoodType | null => {
  if (value === 'Rushed') {
    return 'Hyper';
  }

  return typeof value === 'string' && MOOD_TYPES.includes(value as MoodType)
    ? (value as MoodType)
    : null;
};

export const isMoodType = (value: unknown): value is MoodType =>
  normalizeMoodType(value) !== null;

// 心情配置
export const MOOD_CONFIG: Record<MoodType, { label: string; icon: string; color: string }> = {
  Crushed: { label: 'Crushed', icon: 'face-dizzy', color: '#E74C3C' },
  Stuck: { label: 'Stuck', icon: 'face-meh', color: '#F39C12' },
  Calm: { label: 'Calm', icon: 'face-smile', color: '#3498DB' },
  Engaged: { label: 'Engaged', icon: 'face-grin', color: '#27AE60' },
  Hyper: { label: 'Hyper', icon: 'face-kiss-beam', color: '#9B59B6' },
};

// AI Tutor 人格类型
export type TutorPersona = 'Oprah' | 'Einstein' | 'Trump' | 'Elon' | 'Sherlock';

export const TUTOR_PERSONAS: TutorPersona[] = ['Oprah', 'Einstein', 'Trump', 'Elon', 'Sherlock'];

export type TtsVoice =
  | 'alloy'
  | 'ash'
  | 'ballad'
  | 'cedar'
  | 'coral'
  | 'echo'
  | 'fable'
  | 'marin'
  | 'nova'
  | 'onyx'
  | 'sage'
  | 'shimmer'
  | 'verse';

export const TTS_VOICES: TtsVoice[] = [
  'alloy',
  'ash',
  'ballad',
  'cedar',
  'coral',
  'echo',
  'fable',
  'marin',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
];

export const TTS_VOICE_LABELS: Record<TtsVoice, string> = {
  alloy: 'Alloy',
  ash: 'Ash',
  ballad: 'Ballad',
  cedar: 'Cedar',
  coral: 'Coral',
  echo: 'Echo',
  fable: 'Fable',
  marin: 'Marin',
  nova: 'Nova',
  onyx: 'Onyx',
  sage: 'Sage',
  shimmer: 'Shimmer',
  verse: 'Verse',
};

export const normalizeTutorPersona = (value: unknown): TutorPersona => {
  const legacyMap: Record<string, TutorPersona> = {
    Gentle: 'Oprah',
    Neutral: 'Einstein',
    Gordon: 'Trump',
    WiseElder: 'Sherlock',
  };

  if (typeof value !== 'string') {
    return 'Einstein';
  }

  if (
    value === 'Oprah' ||
    value === 'Einstein' ||
    value === 'Trump' ||
    value === 'Elon' ||
    value === 'Sherlock'
  ) {
    return value;
  }

  return legacyMap[value] ?? 'Einstein';
};

interface PersonaConfig {
  label: string;
  subtitle: string;
  description: string;
  avatarTag: string;
  traits: string[];
  icon: string;
  iconColor: string;
  color: string;
  typicalLanguage: string;
  solvingStyleTitle: string;
  solvingStyleDescription: string;
}

// 人格配置
export const PERSONA_CONFIG: Record<TutorPersona, PersonaConfig> = {
  Oprah: {
    label: 'Oprah',
    subtitle: 'Empowerment Mentor',
    description: 'Warm, empathetic mentor focused on confidence-building',
    avatarTag: 'Empower',
    traits: ['Healing', 'Empathetic', 'Nurturing'],
    icon: 'mug-hot',
    iconColor: '#C85D7C',
    color: '#C85D7C',
    typicalLanguage:
      "I see you, and I feel your struggle. This problem is just a small hurdle. Let's breathe and find your inner power, one beautiful step at a time.",
    solvingStyleTitle: 'Compassionate Scaffolding.',
    solvingStyleDescription:
      "This style focuses on high-empathy guidance. It avoids cold technical jargon and breaks complex problems into micro-steps. Every progression includes positive reinforcement to rebuild confidence.",
  },
  Einstein: {
    label: 'Einstein',
    subtitle: 'Senior Mentor',
    description: 'Systematic and rigorous first-principles tutor',
    avatarTag: 'Wisdom',
    traits: ['Profound', 'Systematic', 'Authoritative'],
    icon: 'scroll',
    iconColor: '#4C7DFF',
    color: '#4C7DFF',
    typicalLanguage:
      'Wisdom begins with wonder. Let us explore the fundamental principles that govern this question.',
    solvingStyleTitle: 'First-Principles Rigor.',
    solvingStyleDescription:
      'An authoritative academic style that prioritizes why over how, and builds a bridge from this question to the broader knowledge tree.',
  },
  Trump: {
    label: 'Trump',
    subtitle: 'The Winning Mentor',
    description: 'High-energy, confidence-first strategic style',
    avatarTag: 'Winning',
    traits: ['Legendary', 'Bold', 'Victorious'],
    icon: 'rocket',
    iconColor: '#F59E0B',
    color: '#F59E0B',
    typicalLanguage:
      "We're going to solve this and it's going to be huge. Smart strategy, big momentum, total success.",
    solvingStyleTitle: 'Dominant Strategic Superiority.',
    solvingStyleDescription:
      'Designed for high-flow states. It emphasizes strategic shortcuts and motivation while preserving learning clarity.',
  },
  Elon: {
    label: 'Elon',
    subtitle: 'Strategic Mentor',
    description: 'Fast, direct, minimal explanation path',
    avatarTag: 'Strategy',
    traits: ['Rapid', 'Direct', 'Minimalist'],
    icon: 'bolt',
    iconColor: '#00A896',
    color: '#00A896',
    typicalLanguage:
      'Efficiency is the key metric. No fluff, just the critical path to the answer.',
    solvingStyleTitle: 'Hyper-Efficient Minimalism.',
    solvingStyleDescription:
      'A result-oriented approach that strips away non-essential explanation and focuses on the decisive logic chain.',
  },
  Sherlock: {
    label: 'Sherlock',
    subtitle: 'Deduction Mentor',
    description: 'Clue-driven guidance and Socratic inference',
    avatarTag: 'Guidance',
    traits: ['Analytical', 'Perceptive', 'Guiding'],
    icon: 'magnifying-glass',
    iconColor: '#8B5CF6',
    color: '#8B5CF6',
    typicalLanguage:
      'The game is afoot. Identify the clue you missed and the entire structure will become clear.',
    solvingStyleTitle: 'Deductive Clue-Inference.',
    solvingStyleDescription:
      'Uses detective-style prompting to expose missing links, helping the learner arrive at the answer with genuine understanding.',
  },
};

// 心情到人格的默认映射
export const MOOD_TO_PERSONA: Record<MoodType, TutorPersona> = {
  Crushed: 'Oprah',
  Stuck: 'Sherlock',
  Calm: 'Einstein',
  Engaged: 'Trump',
  Hyper: 'Elon',
};

export interface MoodPrescription {
  badge: string;
  badgeIcon: string;
  persona: TutorPersona;
  title: string;
  copy: string;
  cta: string;
  accentColor: string;
}

export const MOOD_PRESCRIPTIONS: Record<MoodType, MoodPrescription> = {
  Crushed: {
    badge: "Today's Match",
    badgeIcon: 'wand-magic-sparkles',
    persona: 'Oprah',
    title: 'Gentle Mentor · Oprah',
    copy: 'Looks like today feels heavy. Oprah will guide you with patient, confidence-first steps.',
    cta: 'Talk to Oprah',
    accentColor: '#C85D7C',
  },
  Stuck: {
    badge: "Today's Match",
    badgeIcon: 'wand-magic-sparkles',
    persona: 'Sherlock',
    title: 'Clue Mentor · Sherlock',
    copy: 'When you feel stuck, Sherlock helps you spot the missing clue and unlock the next move.',
    cta: 'Find the Clue',
    accentColor: '#8B5CF6',
  },
  Calm: {
    badge: "Today's Match",
    badgeIcon: 'wand-magic-sparkles',
    persona: 'Einstein',
    title: 'Focused Mentor · Einstein',
    copy: 'Calm is perfect for deep work. Einstein keeps your session structured, rigorous, and clear.',
    cta: 'Go Deeper',
    accentColor: '#4C7DFF',
  },
  Engaged: {
    badge: "Today's Match",
    badgeIcon: 'wand-magic-sparkles',
    persona: 'Trump',
    title: 'Challenge Mentor · Trump',
    copy: 'You are fired up. Trump matches your momentum with bold strategy and challenge energy.',
    cta: 'Take the Challenge',
    accentColor: '#F59E0B',
  },
  Hyper: {
    badge: "Today's Match",
    badgeIcon: 'wand-magic-sparkles',
    persona: 'Elon',
    title: 'Speed Mentor · Elon',
    copy: 'Energy is high. Elon keeps it efficient and turns momentum into fast, accurate progress.',
    cta: 'Move Fast',
    accentColor: '#00A896',
  },
};

// 每日消息列表
export const MOTD_MESSAGES = [
  'The only way to do great work is to love what you do. - Steve Jobs',
  "Believe you can and you're halfway there. - Theodore Roosevelt",
  'Education is not the filling of a pail, but the lighting of a fire. - W.B. Yeats',
  'The beautiful thing about learning is that no one can take it away from you. - B.B. King',
  'Success is not final, failure is not fatal: it is the courage to continue that counts. - Churchill',
  'The mind is not a vessel to be filled but a fire to be kindled. - Plutarch',
  'Learning is a treasure that will follow its owner everywhere. - Chinese Proverb',
];

// 消息接口
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageUri?: string;
  persona?: TutorPersona;
  timestamp: Date;
}

// 心情历史记录
export interface MoodRecord {
  date: string; // YYYY-MM-DD
  mood: MoodType;
}

// 水滴记录
export interface DropsData {
  [date: string]: number; // date -> drops count
}

// 点赞记录
export interface LikeRecord {
  [date: string]: boolean;
}

// 用户数据
export interface UserData {
  moodHistory: MoodRecord[];
  dailyDrops: DropsData;
  likedMOTD: LikeRecord;
  currentPersona: TutorPersona;
  chatHistory: ChatMessage[];
}
