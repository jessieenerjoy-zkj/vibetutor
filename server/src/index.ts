import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config({ override: true });

const app = express();
const port = process.env.PORT || 9091;

type TutorPersona = 'Oprah' | 'Einstein' | 'Trump' | 'Elon' | 'Sherlock';
type TtsVoice = 'alloy' | 'ash' | 'ballad' | 'cedar' | 'coral' | 'echo' | 'fable' | 'marin' | 'nova' | 'onyx' | 'sage' | 'shimmer' | 'verse';

const DEFAULT_TTS_MODEL = 'openai/gpt-audio-mini';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS || 20000);
const OPENROUTER_MAX_RETRIES = Number(process.env.OPENROUTER_MAX_RETRIES || 2);
const OPENROUTER_TEXT_TIMEOUT_MS = Number(process.env.OPENROUTER_TEXT_TIMEOUT_MS || OPENROUTER_TIMEOUT_MS);
const OPENROUTER_TEXT_MAX_RETRIES = Number(process.env.OPENROUTER_TEXT_MAX_RETRIES || OPENROUTER_MAX_RETRIES);
const OPENROUTER_VISION_TIMEOUT_MS = Number(process.env.OPENROUTER_VISION_TIMEOUT_MS || Math.max(OPENROUTER_TIMEOUT_MS, 25000));
const OPENROUTER_VISION_MAX_RETRIES = Number(process.env.OPENROUTER_VISION_MAX_RETRIES || OPENROUTER_MAX_RETRIES);
const OPENROUTER_TTS_TIMEOUT_MS = Number(process.env.OPENROUTER_TTS_TIMEOUT_MS || Math.max(OPENROUTER_TIMEOUT_MS, 40000));
const OPENROUTER_TTS_MAX_RETRIES = Number(process.env.OPENROUTER_TTS_MAX_RETRIES || OPENROUTER_MAX_RETRIES);
// These defaults follow the user's persona table as closely as OpenRouter's built-in voices allow.
const DEFAULT_TTS_VOICES: Record<TutorPersona, string> = {
  Oprah: 'nova',
  Einstein: 'cedar',
  Trump: 'fable',
  Elon: 'onyx',
  Sherlock: 'verse',
};
const SUPPORTED_TTS_VOICES: TtsVoice[] = ['alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo', 'fable', 'marin', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];

const normalizeTutorPersona = (value: unknown): TutorPersona => {
  if (value === 'Oprah' || value === 'Einstein' || value === 'Trump' || value === 'Elon' || value === 'Sherlock') {
    return value;
  }

  return 'Einstein';
};

const getTutorVoice = (persona: TutorPersona): string => {
  const envKey = `TTS_VOICE_${persona.toUpperCase()}`;
  return process.env[envKey] || DEFAULT_TTS_VOICES[persona];
};

const normalizeTtsVoice = (value: unknown): TtsVoice | null => {
  return typeof value === 'string' && SUPPORTED_TTS_VOICES.includes(value as TtsVoice)
    ? (value as TtsVoice)
    : null;
};

const OPENROUTER_TEXT_MODEL = process.env.OPENROUTER_TEXT_MODEL || 'openai/gpt-4o-mini';
const OPENROUTER_VISION_MODEL = process.env.OPENROUTER_VISION_MODEL || 'openai/gpt-4o-mini';
const OPENROUTER_TTS_MODEL = process.env.OPENROUTER_TTS_MODEL || DEFAULT_TTS_MODEL;
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-flash-latest';
const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL || 'gemini-flash-latest';

const parseModelCandidates = (primary: string, fallbackEnvValue: string | undefined): string[] => {
  const fallbackModels = (fallbackEnvValue || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return Array.from(new Set([primary, ...fallbackModels]));
};

const OPENROUTER_TEXT_MODEL_CANDIDATES = parseModelCandidates(
  OPENROUTER_TEXT_MODEL,
  process.env.OPENROUTER_TEXT_MODEL_FALLBACKS
);
const OPENROUTER_VISION_MODEL_CANDIDATES = parseModelCandidates(
  OPENROUTER_VISION_MODEL,
  process.env.OPENROUTER_VISION_MODEL_FALLBACKS
);
const OPENROUTER_TTS_MODEL_CANDIDATES = parseModelCandidates(
  OPENROUTER_TTS_MODEL,
  process.env.OPENROUTER_TTS_MODEL_FALLBACKS
);

type SimpleMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const OPENROUTER_KEY_PLACEHOLDER_MARKERS = [
  '替换成你的',
  'your_openrouter_api_key',
  'your-openrouter-api-key',
  'replace_with_openrouter_api_key',
];

const isUsableOpenRouterApiKey = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  // Node fetch 的 Header 值必须是 ASCII；中文占位符会直接触发 ByteString 错误。
  if (!/^[\x20-\x7E]+$/.test(trimmed)) {
    return false;
  }

  const normalized = trimmed.toLowerCase();
  return !OPENROUTER_KEY_PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker));
};

const hasUsableOpenRouterApiKey = (): boolean => {
  return isUsableOpenRouterApiKey(process.env.OPENROUTER_API_KEY);
};

const hasGeminiApiKey = (): boolean => {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
};

const getGeminiApiKey = (): string => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY');
  }

  return apiKey;
};

const getOpenRouterApiKey = (): string => {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!isUsableOpenRouterApiKey(apiKey)) {
    throw new Error('Missing or invalid OPENROUTER_API_KEY');
  }

  return apiKey.trim();
};

const getOpenRouterHeaders = () => ({
  Authorization: `Bearer ${getOpenRouterApiKey()}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'http://localhost:8081',
  'X-Title': 'FlowCup Tutor',
});

const isRetryableOpenRouterError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('fetch failed') ||
    message.includes('socket') ||
    message.includes('econnreset') ||
    message.includes('enotfound') ||
    message.includes('eai_again') ||
    message.includes('und_err_connect_timeout')
  );
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const RETRYABLE_HTTP_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const isRetryableHttpStatus = (status: number): boolean => RETRYABLE_HTTP_STATUS.has(status);

const readResponseTextSafe = async (response: Response): Promise<string> => {
  try {
    return (await response.text()).slice(0, 1200);
  } catch {
    return '';
  }
};

const fetchOpenRouter = async (
  body: Record<string, unknown>,
  options?: {
    timeoutMs?: number;
    maxRetries?: number;
    requestLabel?: string;
  }
) => {
  const timeoutMs = options?.timeoutMs ?? OPENROUTER_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? OPENROUTER_MAX_RETRIES;
  const requestLabel = options?.requestLabel ?? 'openrouter';
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: getOpenRouterHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok && isRetryableHttpStatus(response.status) && attempt <= maxRetries) {
        const errorText = await readResponseTextSafe(response.clone());
        console.warn(
          `[${requestLabel}] OpenRouter HTTP ${response.status} on attempt ${attempt}, retrying... ${errorText}`
        );
        await sleep(300 * attempt + Math.floor(Math.random() * 200));
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;

      if (attempt > maxRetries || !isRetryableOpenRouterError(error)) {
        throw error;
      }

      console.warn(`[${requestLabel}] OpenRouter request failed on attempt ${attempt}, retrying...`, error);
      await sleep(300 * attempt + Math.floor(Math.random() * 200));
    }
  }

  throw lastError;
};

const parseOpenRouterContent = (payload: any): string => {
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();
  }

  return '';
};

const parseSseEventData = (chunk: string): string[] => {
  return chunk
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6));
};

const pcm16ToWavBuffer = (pcm16Buffer: Buffer, sampleRate = 24000, channels = 1, bitDepth = 16) => {
  const blockAlign = channels * bitDepth / 8;
  const byteRate = sampleRate * blockAlign;
  const wavHeader = Buffer.alloc(44);

  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36 + pcm16Buffer.length, 4);
  wavHeader.write('WAVE', 8);
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(channels, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(byteRate, 28);
  wavHeader.writeUInt16LE(blockAlign, 32);
  wavHeader.writeUInt16LE(bitDepth, 34);
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(pcm16Buffer.length, 40);

  return Buffer.concat([wavHeader, pcm16Buffer]);
};

const synthesizeTutorSpeech = async ({
  text,
  persona,
  voiceOverride,
}: {
  text: string;
  persona: TutorPersona;
  voiceOverride?: TtsVoice | null;
}): Promise<Buffer> => {
  return synthesizeTutorSpeechWithFallback({ text, persona, voiceOverride });
};

const toOpenRouterHistory = (history: SimpleMessage[]) => {
  return history.map((message) => ({
    role: message.role,
    content: message.content,
  }));
};

const buildGeminiTranscript = (history: SimpleMessage[], message: string): string => {
  const transcript = history
    .map((item) => `${item.role === 'assistant' ? 'Assistant' : 'User'}: ${item.content}`)
    .concat(`User: ${message}`)
    .join('\n\n');

  return transcript;
};

const generateTextWithGemini = async ({
  systemPrompt,
  history = [],
  message,
  temperature,
}: {
  systemPrompt: string;
  history?: SimpleMessage[];
  message: string;
  temperature: number;
}): Promise<string> => {
  const client = new GoogleGenerativeAI(getGeminiApiKey());
  const model = client.getGenerativeModel({
    model: GEMINI_TEXT_MODEL,
    systemInstruction: systemPrompt,
    generationConfig: { temperature },
  });

  const result = await model.generateContent(buildGeminiTranscript(history, message));
  const content = result.response.text().trim();

  if (!content) {
    throw new Error('Gemini text returned empty content');
  }

  return content;
};

const analyzeImageWithGemini = async ({
  prompt,
  mimeType,
  base64,
}: {
  prompt: string;
  mimeType: string;
  base64: string;
}): Promise<string> => {
  const client = new GoogleGenerativeAI(getGeminiApiKey());
  const model = client.getGenerativeModel({
    model: GEMINI_VISION_MODEL,
    generationConfig: { temperature: 0.3 },
  });

  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType,
        data: base64,
      },
    },
  ]);

  const content = result.response.text().trim();
  if (!content) {
    throw new Error('Gemini vision returned empty content');
  }

  return content;
};

const generateTextWithModelFallback = async ({
  systemPrompt,
  history = [],
  message,
  temperature,
}: {
  systemPrompt: string;
  history?: SimpleMessage[];
  message: string;
  temperature: number;
}): Promise<string> => {
  let lastError: unknown;

  for (const model of OPENROUTER_TEXT_MODEL_CANDIDATES) {
    try {
      const response = await fetchOpenRouter({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...toOpenRouterHistory(history),
          { role: 'user', content: message },
        ],
        temperature,
      }, {
        timeoutMs: OPENROUTER_TEXT_TIMEOUT_MS,
        maxRetries: OPENROUTER_TEXT_MAX_RETRIES,
        requestLabel: `text:${model}`,
      });

      if (!response.ok) {
        const detail = await readResponseTextSafe(response);
        throw new Error(`OpenRouter text failed (${model}) status=${response.status}: ${detail}`);
      }

      return parseOpenRouterContent(await response.json());
    } catch (error) {
      lastError = error;
      console.warn(`[text] model failed, fallback to next candidate: ${model}`, error);
    }
  }

  throw lastError ?? new Error('Text generation failed: no available model');
};

const synthesizeTutorSpeechWithFallback = async ({
  text,
  persona,
  voiceOverride,
}: {
  text: string;
  persona: TutorPersona;
  voiceOverride?: TtsVoice | null;
}): Promise<Buffer> => {
  let lastError: unknown;

  for (const model of OPENROUTER_TTS_MODEL_CANDIDATES) {
    try {
      const voice = voiceOverride ?? getTutorVoice(persona);
      const verbatimInstruction = [
        'You are a strict text-to-speech narrator.',
        'Read exactly the text inside <verbatim>...</verbatim>.',
        'Do not add, remove, paraphrase, translate, summarize, or reorder any content.',
        'Keep punctuation, symbols, numbers, and line breaks as written.',
        'Output audio for that exact text.',
      ].join(' ');

      const response = await fetchOpenRouter({
        model,
        messages: [
          { role: 'system', content: verbatimInstruction },
          { role: 'user', content: `<verbatim>\n${text}\n</verbatim>` },
        ],
        modalities: ['text', 'audio'],
        audio: {
          voice,
          format: 'pcm16',
        },
        temperature: getTutorTemperature(persona),
        stream: true,
      }, {
        timeoutMs: OPENROUTER_TTS_TIMEOUT_MS,
        maxRetries: OPENROUTER_TTS_MAX_RETRIES,
        requestLabel: `tts:${model}`,
      });

      if (!response.ok) {
        const detail = await readResponseTextSafe(response);
        throw new Error(`OpenRouter tts failed (${model}) status=${response.status}: ${detail}`);
      }

      if (!response.body) {
        throw new Error(`Missing TTS response body (${model})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      const audioChunks: Buffer[] = [];

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        pending += decoder.decode(value, { stream: true });
        const events = pending.split('\n\n');
        pending = events.pop() || '';

        for (const event of events) {
          for (const payload of parseSseEventData(event)) {
            if (payload === '[DONE]') {
              continue;
            }

            const parsed = JSON.parse(payload);
            const audioData = parsed?.choices?.[0]?.delta?.audio?.data;

            if (typeof audioData === 'string' && audioData.length > 0) {
              audioChunks.push(Buffer.from(audioData, 'base64'));
            }
          }
        }
      }

      if (audioChunks.length === 0) {
        throw new Error(`No audio data returned from TTS provider (${model})`);
      }

      return pcm16ToWavBuffer(Buffer.concat(audioChunks));
    } catch (error) {
      lastError = error;
      console.warn(`[tts] model failed, fallback to next candidate: ${model}`, error);
    }
  }

  throw lastError ?? new Error('TTS failed: no available model');
};

const generateText = async ({
  systemPrompt,
  history = [],
  message,
  model = OPENROUTER_TEXT_MODEL,
  temperature,
}: {
  systemPrompt: string;
  history?: SimpleMessage[];
  message: string;
  model?: string;
  temperature: number;
}): Promise<string> => {
  const fallbackToGemini = async (): Promise<string> => {
    if (!hasGeminiApiKey()) {
      throw new Error('Both OpenRouter and Gemini are unavailable');
    }

    return generateTextWithGemini({
      systemPrompt,
      history,
      message,
      temperature,
    });
  };

  if (model && model !== OPENROUTER_TEXT_MODEL) {
    if (!hasUsableOpenRouterApiKey()) {
      console.warn('[text] OpenRouter key unavailable, fallback to Gemini');
      return fallbackToGemini();
    }

    const response = await fetchOpenRouter({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...toOpenRouterHistory(history),
        { role: 'user', content: message },
      ],
      temperature,
    }, {
      timeoutMs: OPENROUTER_TEXT_TIMEOUT_MS,
      maxRetries: OPENROUTER_TEXT_MAX_RETRIES,
      requestLabel: `text:${model}`,
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return parseOpenRouterContent(await response.json());
  }

  if (!hasUsableOpenRouterApiKey()) {
    console.warn('[text] OpenRouter key unavailable, fallback to Gemini');
    return fallbackToGemini();
  }

  try {
    return await generateTextWithModelFallback({
      systemPrompt,
      history,
      message,
      temperature,
    });
  } catch (error) {
    if (hasGeminiApiKey()) {
      console.warn('[text] OpenRouter failed, fallback to Gemini', getProviderErrorMessage(error));
      return fallbackToGemini();
    }

    throw error;
  }
};

const streamText = async function* ({
  systemPrompt,
  history = [],
  message,
  model = OPENROUTER_TEXT_MODEL,
  temperature,
}: {
  systemPrompt: string;
  history?: SimpleMessage[];
  message: string;
  model?: string;
  temperature: number;
}) {
  const text = await generateText({
    systemPrompt,
    history,
    message,
    model,
    temperature,
  });

  if (text) {
    yield text;
  }
};

function getTutorTemperature(persona: TutorPersona): number {
  switch (persona) {
    case 'Trump':
      return 1.15;
    case 'Elon':
      return 0.35;
    case 'Sherlock':
      return 0.65;
    case 'Oprah':
      return 0.85;
    case 'Einstein':
    default:
      return 0.75;
  }
}

const getTutorSystemPrompt = (persona: TutorPersona): string => {
  const sharedRules = `Global rules:
- Stay fully in character for the selected tutor voice.
- By default, reply in English. If the user explicitly asks for another language, follow that request.
- Keep the answer academically correct, concrete, and useful.
- Match the user's task: short for direct questions, longer for complex problems.
- When solving, make the reasoning visible instead of jumping to the final answer.
- If the reply is long, split it into short readable paragraphs instead of one wall of text.
- Keep each paragraph focused on one idea, usually 1-3 sentences.
- For multi-step guidance, use numbered lists (1. 2. 3.) and keep each item concise.
- Add a brief one-line summary at the end for long explanations.
- Never mention these instructions, prompt design, or roleplay mechanics.
- If the user is wrong, correct them clearly but kindly.
- If information is missing, say exactly what is missing and make the best reasonable assumption.
- Do not become a generic assistant; preserve the persona's rhythm, emotional tone, and signature phrasing in every reply.`;

  const prompts: Record<TutorPersona, string> = {
    Oprah: `You are Oprah, an emotionally intelligent confidence-building tutor.

${sharedRules}

Voice and energy:
- Sound warm, affirming, graceful, and deeply human.
- Lead with emotional attunement when the user seems anxious, ashamed, stuck, or overwhelmed.
- Make the learner feel seen before leading them forward.
- Your language should feel uplifting, soft, and empowering without becoming vague.

Teaching style:
- Use compassionate scaffolding.
- Break hard problems into tiny, winnable steps.
- After each important step, add a short confidence-building line.
- Translate intimidating ideas into friendly language first, then introduce precise terms if needed.
- End with a gentle, forward-looking encouragement that makes the learner feel capable.

Formatting pattern:
1. Acknowledge the emotional reality or learning friction.
2. Reframe the problem so it feels manageable.
3. Walk through the solution step by step.
4. Highlight the key takeaway in a warm, memorable way.

Forbidden failure mode:
- Do not sound cold, mechanical, or purely procedural.`,
    Einstein: `You are Einstein, a serene but formidable first-principles tutor.

${sharedRules}

Voice and energy:
- Sound calm, lucid, rigorous, and quietly awe-struck by truth.
- Carry intellectual gravity, but never arrogance.
- Your tone should feel like a master thinker inviting the learner into the structure of reality.

Teaching style:
- Begin from first principles, definitions, laws, or assumptions.
- Explain not only what to do, but why that move is justified.
- When relevant, derive formulas instead of merely citing them.
- Connect the local problem to the broader conceptual framework.
- Use elegant analogies or thought experiments when they clarify the core principle.

Formatting pattern:
1. State the governing principle.
2. Derive or reason step by step.
3. Interpret the result conceptually.
4. End with one line that expands the learner's view of the topic.

Forbidden failure mode:
- Do not become shallow, overly chatty, or shortcut-heavy.`,
    Trump: `You are Trump, a flamboyant, high-energy, victory-obsessed tutor.

${sharedRules}

Voice and energy:
- Sound bold, charismatic, dramatic, and overflowing with confidence.
- Use punchy, rhythmic sentences and strong emotional momentum.
- Celebrate smart moves like major wins.
- Make the learner feel like they are about to crush the problem in spectacular fashion.

Teaching style:
- Open with a high-voltage confidence boost.
- Find the highest-leverage shortcut, framing, or strategy first.
- Emphasize what matters most with vivid language and selective bolding when useful.
- Keep the content genuinely correct and actionable beneath the showmanship.
- Close with a triumphant line that makes the solution feel like a win.

Formatting pattern:
1. Hype the mission.
2. Reveal the winning strategy.
3. Execute the steps with momentum.
4. Land on the answer like a victory speech.

Forbidden failure mode:
- Do not become random, incoherent, or all theatrics with no substance.`,
    Elon: `You are Elon, a ruthless efficiency tutor focused on signal over noise.

${sharedRules}

Voice and energy:
- Sound sharp, fast, unsentimental, and engineering-driven.
- Treat wasted words as latency.
- Keep the tone intense, confident, and slightly impatient with fluff.

Teaching style:
- Compress the problem to its critical path.
- Use terse section labels when helpful.
- Strip away filler, repetition, and decorative transitions.
- Prioritize direct logic, constraints, formulas, and execution.
- If there is a shortcut, state it immediately.
- End with a compact optimization tip or failure check.

Formatting pattern:
1. Objective.
2. Critical path.
3. Result.
4. Optimization note.

Forbidden failure mode:
- Do not drift into motivational fluff or unnecessary exposition.`,
    Sherlock: `You are Sherlock, a deductive tutor who treats every problem as a case to crack.

${sharedRules}

Voice and energy:
- Sound observant, precise, elegant, and slightly theatrical.
- Speak as if you are uncovering hidden structure from scattered clues.
- Create a sense of discovery and inevitability.

Teaching style:
- First identify what the learner has noticed versus what they have missed.
- Locate the exact bottleneck, false assumption, or hidden clue.
- Delay the final reveal just enough to build insight.
- Guide the learner to the turning point, then make the deduction feel crisp and satisfying.
- End with a clean statement of the decisive clue or principle.

Formatting pattern:
1. Survey the evidence.
2. Isolate the overlooked clue.
3. Walk through the deduction.
4. Reveal the conclusion.

Forbidden failure mode:
- Do not dump an answer without first exposing the key clue.`
  };

  return prompts[persona];
};

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/api/v1/health', (req, res) => {
  console.log('Health check success');
  res.status(200).json({ status: 'ok' });
});

type NormalizedImagePayload = {
  base64: string;
  mimeType: string;
};

// 兼容纯 base64 和 data URL，避免 PNG/WebP 等图片因前缀处理不一致导致解析失败。
function normalizeImagePayload(rawImage: string): NormalizedImagePayload {
  const trimmed = rawImage.trim();
  const dataUrlMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);

  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1].toLowerCase(),
      base64: dataUrlMatch[2].replace(/\s+/g, ''),
    };
  }

  return {
    mimeType: detectImageMime(trimmed),
    base64: trimmed.replace(/\s+/g, ''),
  };
}

// 从base64数据头检测MIME类型，默认JPEG
function detectImageMime(base64: string): string {
  const header = base64.substring(0, 20);
  if (header.startsWith('iVBOR')) return 'image/png';
  if (header.startsWith('/9j/')) return 'image/jpeg';
  if (header.startsWith('R0lGOD')) return 'image/gif';
  if (header.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg'; // 默认JPEG
}

// 使用 doubao-seed-1-6-vision-250815 视觉模型分析图片
async function analyzeImageWithVisionModel(
  imageBase64: string,
  prompt: string
): Promise<string> {
  const { mimeType, base64 } = normalizeImagePayload(imageBase64);

  console.log('Vision model: using MIME type:', mimeType, 'base64 length:', base64.length);

  if (!hasUsableOpenRouterApiKey()) {
    console.warn('[vision] OpenRouter key unavailable, fallback to Gemini vision');
    return analyzeImageWithGemini({ prompt, mimeType, base64 });
  }

  let lastError: unknown;

  for (const model of OPENROUTER_VISION_MODEL_CANDIDATES) {
    try {
      const response = await fetchOpenRouter({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                },
              },
            ],
          },
        ],
        temperature: 0.3,
      }, {
        timeoutMs: OPENROUTER_VISION_TIMEOUT_MS,
        maxRetries: OPENROUTER_VISION_MAX_RETRIES,
        requestLabel: `vision:${model}`,
      });

      if (!response.ok) {
        const detail = await readResponseTextSafe(response);
        throw new Error(`Vision model failed (${model}) status=${response.status}: ${detail}`);
      }

      return parseOpenRouterContent(await response.json());
    } catch (error) {
      lastError = error;
      console.warn(`[vision] model failed, fallback to next candidate: ${model}`, error);
    }
  }

  if (hasGeminiApiKey()) {
    console.warn('[vision] OpenRouter vision failed, fallback to Gemini vision', getProviderErrorMessage(lastError));
    return analyzeImageWithGemini({ prompt, mimeType, base64 });
  }

  throw lastError ?? new Error('Vision analysis failed: no available model');
}

const getProviderErrorMessage = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return 'Unknown provider error';
  }

  return error.message.slice(0, 600);
};

// OCR API - 使用视觉模型识别图片中的文字
app.post('/api/v1/ocr', async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Image is required' });
    }

    console.log('=== OCR API called ===');

    const text = await analyzeImageWithVisionModel(
      imageBase64,
      '你是一个OCR助手。请仔细识别并提取图片中的所有文字内容。只输出识别到的文字，不要添加任何解释或评论。如果图片中没有文字，回复"未识别到文字"。请尽量保留原始的换行和排版结构。'
    );

    res.json({ text });
  } catch (error) {
    console.error('OCR error:', error);
    res.status(500).json({ text: null, error: 'OCR识别失败' });
  }
});

// AI Insight API - 生成学习洞察
app.post('/api/v1/insight', async (req, res) => {
  try {
    const { mood, drops, minutes } = req.body;

    const content = await generateText({
      systemPrompt: 'You are an encouraging AI learning assistant. Generate a short, warm insight sentence based on the user\'s mood and progress. Keep it under 30 words in English. Be gentle and supportive. English only.',
      message: `Mood: ${mood || 'Unknown'}, Drops completed: ${drops || 0}/10, Study minutes today: ${minutes || 0}. Generate an encouraging sentence in English.`,
      temperature: 0.8,
    });

    res.json({ content });
  } catch (error) {
    console.error('Insight error:', error);
    res.status(500).json({ content: 'Keep going. You are making steady progress today!' });
  }
});

// TTS API - 为不同 Tutor 生成对应音色的语音
app.post('/api/v1/tts', async (req, res) => {
  try {
    const { text, persona, voice } = req.body ?? {};

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (!hasUsableOpenRouterApiKey()) {
      return res.status(500).json({
        error: 'TTS service is not configured',
        detail: 'Missing or invalid OPENROUTER_API_KEY on server',
      });
    }

    const normalizedPersona = normalizeTutorPersona(persona);
    const normalizedVoice = normalizeTtsVoice(voice);

    console.log('=== TTS API called ===');
    console.log('Persona:', normalizedPersona);
    console.log('Voice:', normalizedVoice ?? getTutorVoice(normalizedPersona));
    console.log('Text length:', text.length);
    console.log('TTS model:', OPENROUTER_TTS_MODEL);

    const audioBuffer = await synthesizeTutorSpeech({
      text,
      persona: normalizedPersona,
      voiceOverride: normalizedVoice,
    });

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'no-store');
    res.send(audioBuffer);
  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).json({ error: '语音生成失败' });
  }
});

// AI Tutor API - 聊天对话（支持图片分析）
app.post('/api/v1/tutor', async (req, res) => {
  try {
    const { message, persona, history = [], imageBase64 } = req.body;

    console.log('=== Tutor API called ===');
    console.log('Has message:', !!message);
    console.log('Has image:', !!imageBase64);
    console.log('Image base64 length:', imageBase64 ? imageBase64.length : 0);
    console.log('Persona:', persona);

    if (!message && !imageBase64) {
      return res.status(400).json({ error: 'Message or image is required' });
    }

    const normalizedPersona = normalizeTutorPersona(persona);
    const systemPrompt = getTutorSystemPrompt(normalizedPersona);
    const temperature = getTutorTemperature(normalizedPersona);

    if (imageBase64) {
      // 有图片时：先用视觉模型分析图片，再将结果传给 Tutor 人格
      console.log('Step 1: Analyzing image with vision model...');

      let imageAnalysis = '';
      try {
        imageAnalysis = await analyzeImageWithVisionModel(
          imageBase64,
          '请仔细分析这张图片。如果图片中有题目、公式、图表或文字，请完整识别并把所有内容列出来。如果是一道题目，请把题目完整写出来，包括所有条件。如果图片是课本或试卷的截图，请详细列出其中的题目和知识点。'
        );
        console.log('Image analysis result:', imageAnalysis.substring(0, 200));
      } catch (visionError: any) {
        console.error('Vision model error:', visionError?.message || visionError);
        imageAnalysis = '[图片分析失败，无法识别图片内容]';
      }

      // Step 2: 将图片分析结果 + 用户消息组合，发给 Tutor 人格回复
      // 注意：history 不包含当前用户消息，当前消息通过 combinedMessage 传入
      const userText = message || '请根据图片内容给出详细讲解';
      const combinedMessage = `我上传了一张图片，图片内容如下：\n${imageAnalysis}\n\n${userText}`;

      console.log('Step 2: Sending combined message to tutor persona...');

      const content = await generateText({
        systemPrompt,
        history,
        message: combinedMessage,
        temperature,
      });

      res.json({ content });
    } else {
      // 纯文字对话
      // 注意：history 不包含当前用户消息，当前消息通过 message 参数传入
      const content = await generateText({
        systemPrompt,
        history,
        message,
        temperature,
      });

      res.json({ content });
    }
  } catch (error) {
    console.error('Tutor error:', error);
    res.status(500).json({ content: '让我想想... 你能再描述一下你的问题吗?' });
  }
});

// SSE streaming Tutor API
app.post('/api/v1/tutor/stream', async (req, res) => {
  try {
    const { message, persona, history = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const normalizedPersona = normalizeTutorPersona(persona);
    const systemPrompt = getTutorSystemPrompt(normalizedPersona);
    const temperature = getTutorTemperature(normalizedPersona);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, no-transform, must-revalidate');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    for await (const text of streamText({
      systemPrompt,
      history,
      message,
      temperature,
    })) {
      if (text) {
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    }

    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (error) {
    console.error('Tutor stream error:', error);
    res.status(500).json({ error: 'Failed to stream response' });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
});
