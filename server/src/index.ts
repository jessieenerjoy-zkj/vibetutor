import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 9091;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL_BASE_URL =
  process.env.OPENROUTER_MODEL_BASE_URL || 'https://openrouter.ai/api/v1';
const GEMINI_TEXT_MODEL =
  process.env.GEMINI_TEXT_MODEL || 'google/gemini-2.5-flash';
const GEMINI_VISION_MODEL =
  process.env.GEMINI_VISION_MODEL || GEMINI_TEXT_MODEL;

function getOpenRouterHeaders() {
  if (!OPENROUTER_API_KEY) {
    throw new Error('Missing OPENROUTER_API_KEY');
  }

  return {
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:5002',
    'X-Title': process.env.OPENROUTER_APP_NAME || 'vibe-tutor',
  };
}

function normalizeContent(content: any): any {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part?.type === 'text') {
          return { type: 'text', text: part.text || '' };
        }

        if (part?.type === 'image_url' && part?.image_url?.url) {
          const imageUrl: Record<string, any> = { url: part.image_url.url };
          if (part.image_url.detail) {
            imageUrl.detail = part.image_url.detail;
          }

          return {
            type: 'image_url',
            image_url: imageUrl,
          };
        }

        return null;
      })
      .filter(Boolean);
  }

  return String(content ?? '');
}

function extractTextContent(content: any): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text') return part.text || '';
        return '';
      })
      .join('');
  }

  return '';
}

async function invokeLLM(
  messages: any[],
  options: { model: string; temperature: number }
): Promise<string> {
  const payload = {
    model: options.model,
    messages: messages.map((message) => ({
      role: message.role,
      content: normalizeContent(message.content),
    })),
    temperature: options.temperature,
  };

  const response = await fetch(
    `${OPENROUTER_MODEL_BASE_URL.replace(/\/$/, '')}/chat/completions`,
    {
      method: 'POST',
      headers: getOpenRouterHeaders(),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as any;
  return extractTextContent(data?.choices?.[0]?.message?.content);
}

async function* streamLLM(
  messages: any[],
  options: { model: string; temperature: number }
): AsyncGenerator<string, void, unknown> {
  const payload = {
    model: options.model,
    messages: messages.map((message) => ({
      role: message.role,
      content: normalizeContent(message.content),
    })),
    temperature: options.temperature,
    stream: true,
  };

  const response = await fetch(
    `${OPENROUTER_MODEL_BASE_URL.replace(/\/$/, '')}/chat/completions`,
    {
      method: 'POST',
      headers: getOpenRouterHeaders(),
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter stream error ${response.status}: ${errorText}`);
  }

  if (!response.body) {
    throw new Error('OpenRouter stream response body is empty');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;

      const dataStr = line.slice(5).trim();
      if (!dataStr || dataStr === '[DONE]') continue;

      let parsed: any;
      try {
        parsed = JSON.parse(dataStr);
      } catch {
        continue;
      }

      const deltaContent = parsed?.choices?.[0]?.delta?.content;
      if (typeof deltaContent === 'string') {
        yield deltaContent;
        continue;
      }

      if (Array.isArray(deltaContent)) {
        const text = extractTextContent(deltaContent);
        if (text) {
          yield text;
        }
      }
    }
  }
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/api/v1/health', (req, res) => {
  console.log('Health check success');
  res.status(200).json({ status: 'ok' });
});

// 从base64数据头检测MIME类型，默认JPEG
function detectImageMime(base64: string): string {
  const header = base64.substring(0, 20);
  if (header.startsWith('iVBOR')) return 'image/png';
  if (header.startsWith('/9j/')) return 'image/jpeg';
  if (header.startsWith('R0lGOD')) return 'image/gif';
  if (header.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg'; // 默认JPEG
}

function normalizeImagePayload(imageInput: string): { mimeType: string; base64Data: string } {
  const trimmed = String(imageInput || '').trim();
  const dataUriMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (dataUriMatch) {
    return {
      mimeType: dataUriMatch[1],
      base64Data: dataUriMatch[2].replace(/\s/g, ''),
    };
  }

  return {
    mimeType: detectImageMime(trimmed),
    base64Data: trimmed.replace(/\s/g, ''),
  };
}

// 使用 Gemini 视觉模型分析图片
async function analyzeImageWithVisionModel(
  imageBase64: string,
  prompt: string
): Promise<string> {
  const { mimeType, base64Data } = normalizeImagePayload(imageBase64);
  if (!base64Data || base64Data.length < 100) {
    throw new Error('Image payload is empty or too small');
  }

  const dataUri = `data:${mimeType};base64,${base64Data}`;

  console.log('Vision model: using MIME type:', mimeType, 'base64 length:', base64Data.length);

  const messages: any[] = [
    {
      role: 'user' as const,
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: {
            url: dataUri,
            detail: 'high',
          },
        },
      ],
    },
  ];

  return invokeLLM(messages, {
    model: GEMINI_VISION_MODEL,
    temperature: 0.3,
  });
}

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

// AI Insight API - generate learning insight
app.post('/api/v1/insight', async (req, res) => {
  try {
    const { mood, drops, minutes } = req.body;

    const messages = [
      {
        role: 'system' as const,
        content: `You are an encouraging AI learning assistant. Generate one short, warm insight sentence in English based on the user's mood and progress. Keep it under 30 words. Be supportive, natural, and concise.`
      },
      {
        role: 'user' as const,
        content: `Mood: ${mood || 'Unknown'}, Drops completed: ${drops || 0}/5, Study minutes today: ${minutes || 0}. Generate an encouraging sentence in English.`
      }
    ];

    const content = await invokeLLM(messages, {
      model: GEMINI_TEXT_MODEL,
      temperature: 0.8,
    });

    res.json({ content });
  } catch (error) {
    console.error('Insight error:', error);
    res.status(500).json({ content: "Keep going — you're making solid progress." });
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

    // Tutor system prompt (English by default)
    const responseLanguageInstruction =
      'Respond in English by default. If the user explicitly asks for another language, follow that request.';
    const subjectTagInstruction =
      'At the end of every reply, append exactly one tag in this format: [Subject: Math], [Subject: Physics], [Subject: Chemistry], [Subject: History], or [Subject: Other]. Put the tag at the very end with no extra text after it.';

    const systemPrompts: Record<string, string> = {
      Gentle: `You are Gentle, a warm and patient AI tutor. Encourage the student, explain clearly, and guide step by step without being harsh. ${responseLanguageInstruction} ${subjectTagInstruction}`,
      Gordon: `You are Gordon, a strict and fiery AI tutor inspired by Gordon Ramsay's style. Be tough on mistakes but still helpful and constructive. ${responseLanguageInstruction} ${subjectTagInstruction}`,
      Trump: `You are Trump, an over-the-top confident AI tutor with dramatic and entertaining phrasing. Keep it playful while still teaching clearly. ${responseLanguageInstruction} ${subjectTagInstruction}`,
      WiseElder: `You are WiseElder, a calm and wise tutor who uses short analogies and Socratic questions to guide thinking. ${responseLanguageInstruction} ${subjectTagInstruction}`,
      Neutral: `You are Tutor, a neutral and structured AI tutor. Be concise, clear, and step-based. ${responseLanguageInstruction} ${subjectTagInstruction}`
    };

    const systemPrompt = systemPrompts[persona] || systemPrompts.Neutral;

    if (imageBase64) {
      // 有图片时：先用视觉模型分析图片，再将结果传给 Tutor 人格
      console.log('Step 1: Analyzing image with vision model...');

      let imageAnalysis = '';
      try {
        imageAnalysis = await analyzeImageWithVisionModel(
          imageBase64,
          'Analyze this image carefully. If it contains a problem, formulas, diagrams, or text, extract the full content. If it is a question, rewrite the full question with all constraints and key details.'
        );
        console.log('Image analysis result:', imageAnalysis.substring(0, 200));
      } catch (visionError: any) {
        console.error('Vision model error:', visionError?.message || visionError);
        imageAnalysis = '[Image analysis failed. Could not read image content.]';
      }

      // Step 2: 将图片分析结果 + 用户消息组合，发给 Tutor 人格回复
      // 注意：history 不包含当前用户消息，当前消息通过 combinedMessage 传入
      const userText = message || 'Please solve this based on the image content.';
      const combinedMessage = `I uploaded an image. Here is the extracted content:\n${imageAnalysis}\n\n${userText}`;

      console.log('Step 2: Sending combined message to tutor persona...');

      const llmMessages = [
        { role: 'system', content: systemPrompt },
        ...history.map((msg: any) => ({
          role: msg.role,
          content: msg.content
        })),
        { role: 'user', content: combinedMessage }
      ];

      const content = await invokeLLM(llmMessages, {
        model: GEMINI_TEXT_MODEL,
        temperature: 0.7,
      });

      res.json({ content });
    } else {
      // 纯文字对话
      // 注意：history 不包含当前用户消息，当前消息通过 message 参数传入
      const llmMessages = [
        { role: 'system', content: systemPrompt },
        ...history.map((msg: any) => ({
          role: msg.role,
          content: msg.content
        })),
        { role: 'user', content: message }
      ];

      const content = await invokeLLM(llmMessages, {
        model: GEMINI_TEXT_MODEL,
        temperature: persona === 'Trump' ? 1.2 : 0.7,
      });

      res.json({ content });
    }
  } catch (error) {
    console.error('Tutor error:', error);
    res.status(500).json({ content: 'Let me think... could you share the problem one more time with a bit more detail?' });
  }
});

// SSE streaming Tutor API
app.post('/api/v1/tutor/stream', async (req, res) => {
  try {
    const { message, persona, history = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const responseLanguageInstruction =
      'Respond in English by default. If the user explicitly asks for another language, follow that request.';
    const subjectTagInstruction =
      'At the end of every reply, append exactly one tag in this format: [Subject: Math], [Subject: Physics], [Subject: Chemistry], [Subject: History], or [Subject: Other]. Put the tag at the very end with no extra text after it.';

    const systemPrompts: Record<string, string> = {
      Gentle: `You are Gentle, a warm and patient AI tutor. ${responseLanguageInstruction} ${subjectTagInstruction}`,
      Gordon: `You are Gordon, a strict and fiery AI tutor. ${responseLanguageInstruction} ${subjectTagInstruction}`,
      Trump: `You are Trump, an over-the-top confident AI tutor. ${responseLanguageInstruction} ${subjectTagInstruction}`,
      WiseElder: `You are WiseElder, a calm and wise tutor. ${responseLanguageInstruction} ${subjectTagInstruction}`,
      Neutral: `You are Tutor, a neutral and structured AI tutor. ${responseLanguageInstruction} ${subjectTagInstruction}`
    };

    const systemPrompt = systemPrompts[persona] || systemPrompts.Neutral;

    const llmMessages = [
      { role: 'system', content: systemPrompt },
      ...history.map((msg: any) => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ];

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, no-transform, must-revalidate');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    for await (const chunk of streamLLM(llmMessages, {
      model: GEMINI_TEXT_MODEL,
      temperature: persona === 'Trump' ? 1.2 : 0.7,
    })) {
      if (chunk) {
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
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
