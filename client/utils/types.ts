// 心情类型
export type MoodType = 'Crushed' | 'Stuck' | 'Calm' | 'Engaged' | 'Hyper';

// Tutor 学科分类
export type SubjectType = 'Math' | 'Physics' | 'Chemistry' | 'History' | 'Other';

// 心情配置
export const MOOD_CONFIG: Record<MoodType, { label: string; icon: string; color: string }> = {
  Crushed: { label: 'Crushed', icon: 'face-dizzy', color: '#E74C3C' },
  Stuck: { label: 'Stuck', icon: 'face-meh', color: '#F39C12' },
  Calm: { label: 'Calm', icon: 'face-smile', color: '#3498DB' },
  Engaged: { label: 'Engaged', icon: 'face-grin', color: '#27AE60' },
  Hyper: { label: 'Hyper', icon: 'face-kiss-beam', color: '#9B59B6' },
};

// AI Tutor人格类型
export type TutorPersona = 'Gentle' | 'Gordon' | 'Trump' | 'WiseElder' | 'Neutral';

// 人格配置
export const PERSONA_CONFIG: Record<TutorPersona, { label: string; description: string; icon: string; iconColor: string }> = {
  Gentle: { label: 'Gentle', description: 'Always gentle and supportive', icon: 'seedling', iconColor: '#F472B6' },
  Gordon: { label: 'Gordon', description: 'Strict but passionate', icon: 'sword', iconColor: '#DC2626' },
  Trump: { label: 'Trump', description: 'Over-the-top crazy mentor', icon: 'bolt', iconColor: '#2563EB' },
  WiseElder: { label: 'WiseElder', description: 'Storyteller and Socratic', icon: 'hat-wizard', iconColor: '#F59E0B' },
  Neutral: { label: 'Neutral', description: 'Standard textbook tutor', icon: 'bullseye', iconColor: '#64748B' },
};

// 心情到人格的默认映射
export const MOOD_TO_PERSONA: Record<MoodType, TutorPersona> = {
  Crushed: 'Gentle',
  Stuck: 'WiseElder',
  Calm: 'Neutral',
  Engaged: 'Gordon',
  Hyper: 'Trump',
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
    persona: 'Gentle',
    title: 'Gentle Mentor · Gentle',
    copy: 'Looks like today feels a little heavy. We matched you with Gentle, our most patient mentor. No rush — she will help you break things down step by step.',
    cta: 'Talk to Gentle',
    accentColor: '#F472B6',
  },
  Stuck: {
    badge: "Today's Match",
    badgeIcon: 'wand-magic-sparkles',
    persona: 'WiseElder',
    title: 'Wise Mentor · WiseElder',
    copy: 'Getting stuck is part of learning. WiseElder is here with a fresh perspective — sometimes one small story is all it takes to unlock the answer.',
    cta: 'Get Inspired',
    accentColor: '#F59E0B',
  },
  Calm: {
    badge: "Today's Match",
    badgeIcon: 'wand-magic-sparkles',
    persona: 'Neutral',
    title: 'Focused Mentor · Neutral',
    copy: 'Calm is a powerful study state. Neutral is ready to keep things clear, structured, and straight to the point so you can stay locked in today.',
    cta: 'Stay Focused',
    accentColor: '#64748B',
  },
  Engaged: {
    badge: "Today's Match",
    badgeIcon: 'wand-magic-sparkles',
    persona: 'Gordon',
    title: 'Challenge Mentor · Gordon',
    copy: "You're fired up today. Gordon is ready with high standards and sharp feedback — perfect if you want a real challenge.",
    cta: 'Take the Challenge',
    accentColor: '#DC2626',
  },
  Hyper: {
    badge: "Today's Match",
    badgeIcon: 'wand-magic-sparkles',
    persona: 'Trump',
    title: 'Power Mentor · Trump',
    copy: 'Your energy is off the charts. Trump is here to match that momentum and turn it into a bold, high-confidence study session.',
    cta: 'Go Big',
    accentColor: '#2563EB',
  },
};

// 每日消息列表
export const MOTD_MESSAGES = [
  "The only way to do great work is to love what you do. - Steve Jobs",
  "Believe you can and you're halfway there. - Theodore Roosevelt",
  "Education is not the filling of a pail, but the lighting of a fire. - W.B. Yeats",
  "The beautiful thing about learning is that no one can take it away from you. - B.B. King",
  "Success is not final, failure is not fatal: it is the courage to continue that counts. - Churchill",
  "The mind is not a vessel to be filled but a fire to be kindled. - Plutarch",
  "Learning is a treasure that will follow its owner everywhere. - Chinese Proverb",
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
