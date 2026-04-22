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

    // 根据人格设置系统提示
    const subjectTagInstruction = '在你的回复末尾追加一个学科标签，格式必须是 [Subject: Math]、[Subject: Physics]、[Subject: Chemistry]、[Subject: History] 或 [Subject: Other] 之一。标签必须是回复的最后一段，不要添加额外解释。';

    const systemPrompts: Record<string, string> = {
      Gentle: `你是一位温柔、温暖、鼓励式的AI学习导师，名叫小Flow。你擅长帮助学生理解学习材料、作业题目和考试问题。你的回复应该鼓励和耐心。解释解题步骤时格式清晰。${subjectTagInstruction}`,
      Gordon: `你是一位Gordon Ramsay风格的AI导师，名叫Gordon。你严格但充满激情。你会用夸张的表达方式，但最终会给出有用的帮助。${subjectTagInstruction}`,
      Trump: `你是一位Trump风格的AI导师，名叫Trump。你使用"相信我"、"太棒了"、"巨大的成功"等表达方式。你过度自信但很有趣。${subjectTagInstruction}`,
      WiseElder: `你是一位睿智的长者导师，名叫智者。你说话缓慢而和蔼。你会用类比和故事来引导。${subjectTagInstruction}`,
      Neutral: `你是一位中性、客观的AI学习导师，名叫Tutor。你回答清晰、结构化，使用编号步骤。${subjectTagInstruction}`
    };

    const systemPrompt = systemPrompts[persona] || systemPrompts.Neutral;

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

    const systemPrompts: Record<string, string> = {
      Gentle: `你是一位温柔鼓励式的AI学习导师，名叫小Flow。`,
      Gordon: `你是一位Gordon Ramsay风格的AI导师，名叫Gordon。`,
      Trump: `你是一位Trump风格的AI导师，名叫Trump。`,
      WiseElder: `你是一位睿智长者导师，名叫智者。`,
      Neutral: `你是一位中性客观的AI导师，名叫Tutor。`
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
