declare const Deno: {
  serve(
    handler: (request: Request) => Response | Promise<Response>,
  ): void;
  env: {
    get(name: string): string | undefined;
  };
};

type Locale = 'uz' | 'ru' | 'en';
type FunctionMode = 'director' | 'chat' | 'student_message';
type Health = 'good' | 'warning' | 'critical' | 'unknown';
type Severity = 'low' | 'medium' | 'high';

type DirectorRequest = {
  mode?: string;
  context?: Record<string, unknown>;
  message?: string;
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  systemPrompt?: string;
  centerId?: string;
  studentName?: string;
  centerName?: string;
  type?: string;
  debt?: number;
  locale?: string;
};

type GeminiInsight = {
  type: string;
  severity: Severity;
  title: string;
  description: string;
  action: string;
  relatedIds: string[];
};

type GeminiRecommendation = {
  priority: number;
  title: string;
  description: string;
  actionType: string;
};

type DirectorResponse = {
  summary: string;
  health: Health;
  insights: GeminiInsight[];
  recommendedActions: GeminiRecommendation[];
};

type GeminiApiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
    finishMessage?: string;
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function normalizeLocale(value?: string): Locale {
  const locale = value?.toLowerCase().trim();
  if (locale?.startsWith('ru')) return 'ru';
  if (locale?.startsWith('en')) return 'en';
  return 'uz';
}

function normalizeMode(value?: string): FunctionMode {
  if (value === 'chat') return 'chat';
  if (value === 'student_message') return 'student_message';
  return 'director';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function getLanguageName(locale: Locale): string {
  if (locale === 'ru') return 'Russian';
  if (locale === 'en') return 'English';
  return 'Uzbek (Latin script)';
}

function extractText(payload: GeminiApiResponse): string | null {
  const parts = payload.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;

  const text = parts
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();

  return text || null;
}

function stripCodeFence(value: string): string {
  return value
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseJson<T>(value: string): T {
  return JSON.parse(stripCodeFence(value)) as T;
}

function isValidInsight(value: unknown): value is GeminiInsight {
  if (!isRecord(value)) return false;

  return (
    typeof value.type === 'string' &&
    (value.severity === 'low' || value.severity === 'medium' || value.severity === 'high') &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    typeof value.action === 'string' &&
    Array.isArray(value.relatedIds) &&
    value.relatedIds.every((id) => typeof id === 'string')
  );
}

function isValidRecommendation(value: unknown): value is GeminiRecommendation {
  if (!isRecord(value)) return false;

  return (
    typeof value.priority === 'number' &&
    Number.isFinite(value.priority) &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    typeof value.actionType === 'string'
  );
}

function isValidDirectorResponse(value: unknown): value is DirectorResponse {
  if (!isRecord(value)) return false;
  if (typeof value.summary !== 'string') return false;
  if (
    value.health !== 'good' &&
    value.health !== 'warning' &&
    value.health !== 'critical' &&
    value.health !== 'unknown'
  ) {
    return false;
  }
  if (!Array.isArray(value.insights) || !Array.isArray(value.recommendedActions)) {
    return false;
  }
  return (
    value.insights.every(isValidInsight) &&
    value.recommendedActions.every(isValidRecommendation)
  );
}

function compactDirectorResponse(value: DirectorResponse): DirectorResponse {
  return {
    summary: value.summary.slice(0, 120),
    health: value.health,
    insights: value.insights.slice(0, 2).map((item) => ({
      type: item.type.slice(0, 80),
      severity: item.severity,
      title: item.title.slice(0, 160),
      description: item.description.slice(0, 300),
      action: item.action.slice(0, 300),
      relatedIds: item.relatedIds.slice(0, 20),
    })),
    recommendedActions: value.recommendedActions.slice(0, 2).map((item) => ({
      priority: item.priority,
      title: item.title.slice(0, 160),
      description: item.description.slice(0, 300),
      actionType: item.actionType.slice(0, 80),
    })),
  };
}

function buildDirectorPrompt(context: Record<string, unknown>, locale: Locale): string {
  return [
    'You are Velia Intelligence, an education-center operations analyst.',
    `Respond only in ${getLanguageName(locale)}.`,
    'Use ONLY the metrics supplied in CENTER METRICS.',
    'Never invent, estimate, assume, or fabricate numbers or facts.',
    'If a needed metric is missing, say it is unavailable.',
    'Keep the response concise and practical.',
    'summary must be 120 characters or fewer.',
    'Return at most 2 insights and at most 2 recommendedActions.',
    'Return valid JSON only. Do not use Markdown fences.',
    '',
    'Return this exact JSON shape:',
    '{',
    '  "summary": "string",',
    '  "health": "good | warning | critical | unknown",',
    '  "insights": [',
    '    {',
    '      "type": "string",',
    '      "severity": "low | medium | high",',
    '      "title": "string",',
    '      "description": "string",',
    '      "action": "string",',
    '      "relatedIds": ["string"]',
    '    }',
    '  ],',
    '  "recommendedActions": [',
    '    {',
    '      "priority": 1,',
    '      "title": "string",',
    '      "description": "string",',
    '      "actionType": "string"',
    '    }',
    '  ]',
    '}',
    '',
    'CENTER METRICS:',
    JSON.stringify(context),
  ].join('\n');
}

function buildChatPrompt(
  message: string,
  locale: Locale,
  context?: Record<string, unknown>,
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>,
): string {
  const history = Array.isArray(messages)
    ? messages
        .filter(
          (item) =>
            item &&
            (item.role === 'user' || item.role === 'assistant') &&
            typeof item.content === 'string' &&
            item.content.trim(),
        )
        .slice(-20)
        .map((item) => `${item.role === 'user' ? 'USER' : 'ASSISTANT'}: ${item.content.trim()}`)
        .join('\n')
    : '';

  return [
    'You are Velia AI Chat, an assistant inside an education-center management system.',
    `Respond only in ${getLanguageName(locale)}.`,
    'Answer clearly, briefly, and practically.',
    'Use the supplied center data when it is relevant to the user question.',
    'Never invent student names, payment amounts, attendance values, group sizes, teacher names, dates, or other center-specific facts.',
    'Never claim to have queried the database beyond the data included below.',
    'If the requested center-specific information is missing, say that it is unavailable in the supplied AI data.',
    'For general education-center management questions, you may provide general guidance without inventing center-specific facts.',
    '',
    'CENTER DATA:',
    context ? JSON.stringify(context) : 'Not provided.',
    '',
    history ? 'RECENT CONVERSATION:' : '',
    history,
    '',
    'CURRENT USER MESSAGE:',
    message,
  ].filter((line) => line !== '').join('\n');
}
function buildStudentMessagePrompt(params: {
  studentName: string;
  centerName: string;
  type: string;
  debt?: number;
  locale: Locale;
}): string {
  const debtText =
    typeof params.debt === 'number' && Number.isFinite(params.debt) && params.debt > 0
      ? new Intl.NumberFormat('uz-UZ').format(params.debt)
      : 'not supplied';

  return [
    'You are the message-writing assistant for Velia.',
    `Write a ready-to-send education-center message in ${getLanguageName(params.locale)}.`,
    'Write exactly one message and nothing else.',
    'Be polite, natural, short, and clear.',
    'Never invent a debt amount or other personal data.',
    '',
    `Student name: ${params.studentName}`,
    `Center name: ${params.centerName}`,
    `Message type: ${params.type}`,
    `Debt amount: ${debtText}`,
  ].join('\n');
}

function fallbackStudentMessage(params: {
  studentName: string;
  centerName: string;
  type: string;
  debt?: number;
  locale: Locale;
}): string {
  const name = params.studentName || 'O‘quvchi';
  const center = params.centerName || 'Velia';
  const debt =
    typeof params.debt === 'number' && params.debt > 0
      ? `${new Intl.NumberFormat('uz-UZ').format(params.debt)} so‘m`
      : null;

  if (params.locale === 'ru') {
    if (params.type === 'debt_reminder') {
      return `Здравствуйте, ${name}! В центре «${center}»${debt ? ` у вас задолженность ${debt}` : ' есть задолженность'}. Пожалуйста, оплатите в ближайшее время.`;
    }
    if (params.type === 'attendance_alert') {
      return `Здравствуйте, ${name}! Пожалуйста, обратите внимание на посещаемость в центре «${center}».`;
    }
    if (params.type === 'praise') {
      return `Поздравляем, ${name}! Отличные результаты в центре «${center}». Так держать!`;
    }
    if (params.type === 'announcement') {
      return `Уважаемый(ая) ${name}, важное объявление от центра «${center}».`;
    }
    return `Уважаемый(ая) ${name}, сообщение от центра «${center}».`;
  }

  if (params.locale === 'en') {
    if (params.type === 'debt_reminder') {
      return `Hello ${name}! At ${center}${debt ? ` your outstanding balance is ${debt}` : ' you have an outstanding balance'}. Please pay it soon.`;
    }
    if (params.type === 'attendance_alert') {
      return `Hello ${name}! Please pay attention to your attendance at ${center}.`;
    }
    if (params.type === 'praise') {
      return `Great job, ${name}! Excellent progress at ${center}. Keep it up!`;
    }
    if (params.type === 'announcement') {
      return `Dear ${name}, an important announcement from ${center}.`;
    }
    return `Dear ${name}, a message from ${center}.`;
  }

  if (params.type === 'debt_reminder') {
    return `Assalomu alaykum, ${name}! «${center}» markazida${debt ? ` qarzdorligingiz ${debt}` : ' qarzdorligingiz bor'}. Iltimos, tez orada to‘lovni amalga oshiring.`;
  }
  if (params.type === 'attendance_alert') {
    return `Assalomu alaykum, ${name}! «${center}» markazidagi davomatingizga e’tibor bering.`;
  }
  if (params.type === 'praise') {
    return `Tabriklaymiz, ${name}! «${center}» markazida a’lo natija. Davom eting!`;
  }
  if (params.type === 'announcement') {
    return `Hurmatli ${name}, «${center}» markazidan muhim e’lon.`;
  }
  return `Hurmatli ${name}, «${center}» markazidan xabar.`;
}

async function callGemini(params: {
  model: string;
  apiKey: string;
  systemInstruction: string;
  userText: string;
  jsonMode?: boolean;
  maxOutputTokens?: number;
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
}): Promise<GeminiApiResponse> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent`;

  const generationConfig: Record<string, unknown> = {
    temperature: 0.2,
    maxOutputTokens: params.maxOutputTokens ?? 4096,
    ...(params.thinkingLevel
      ? {
          thinkingConfig: {
            thinkingLevel: params.thinkingLevel,
          },
        }
      : {}),
  };

  if (params.jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }

  const requestBody = {
    systemInstruction: {
      parts: [{ text: params.systemInstruction }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: params.userText }],
      },
    ],
    generationConfig,
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': params.apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      return (await response.json()) as GeminiApiResponse;
    }

    const retryable = [429, 500, 502, 503, 504].includes(response.status);

    if (!retryable || attempt === 2) {
      const raw = await response.text();
      let errorPayload: GeminiApiResponse = {};

      try {
        errorPayload = JSON.parse(raw) as GeminiApiResponse;
      } catch {
        // Upstream did not return JSON.
      }

      return {
        ...errorPayload,
        error: {
          ...(errorPayload.error ?? {}),
          code: response.status,
          message:
            errorPayload.error?.message ||
            raw.slice(0, 500) ||
            `Gemini API error ${response.status}`,
        },
      };
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 700 * (attempt + 1));
    });
  }

  return {
    error: {
      code: 502,
      message: 'Gemini request failed after retries.',
    },
  };
}

function geminiErrorMessage(payload: GeminiApiResponse): string {
  return payload.error?.message || 'Unknown Gemini API error.';
}

async function readRequestBody(request: Request): Promise<DirectorRequest> {
  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    throw new Error('Request body must contain valid JSON.');
  }

  if (!isRecord(raw)) {
    throw new Error('Request body must be a JSON object.');
  }

  return raw as DirectorRequest;
}

function validateChatMessage(message: string): string | null {
  if (!message) return 'A message is required.';
  if (message.length > 4000) return 'Message is too long. Maximum is 4000 characters.';
  return null;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
      405,
    );
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse(
      { error: 'Authentication required', code: 'AUTH_REQUIRED' },
      401,
    );
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('GEMINI_API_KEY is missing.');
    return jsonResponse(
      { error: 'Gemini is not configured on the server', code: 'GEMINI_NOT_CONFIGURED' },
      503,
    );
  }

  const model = getString(Deno.env.get('GEMINI_MODEL'), 'gemini-3.6-flash');

  try {
    const body = await readRequestBody(request);
    const mode = normalizeMode(body.mode);
    const locale = normalizeLocale(body.locale);

    if (mode === 'chat') {
      const history = Array.isArray(body.messages)
        ? body.messages
            .filter(
              (item) =>
                item &&
                (item.role === 'user' || item.role === 'assistant') &&
                typeof item.content === 'string' &&
                item.content.trim(),
            )
            .slice(-20)
        : [];

      const lastHistoryUser = [...history]
        .reverse()
        .find((item) => item.role === 'user')?.content;

      const message = getString(body.message || lastHistoryUser);
      const messageError = validateChatMessage(message);

      if (messageError) {
        return jsonResponse(
          { error: messageError, code: 'INVALID_MESSAGE' },
          400,
        );
      }

      if (body.context !== undefined && !isRecord(body.context)) {
        return jsonResponse(
          { error: 'context must be an object when provided', code: 'INVALID_CONTEXT' },
          400,
        );
      }

      const contextJson = body.context
        ? JSON.stringify(body.context)
        : '';

      // The frontend may send detailed records. Reject only truly excessive payloads.
      if (contextJson.length > 350_000) {
        return jsonResponse(
          {
            error: 'Center AI data is too large for this request.',
            code: 'CONTEXT_TOO_LARGE',
          },
          413,
        );
      }

      const payload = await callGemini({
        model,
        apiKey,
        systemInstruction:
          'You are Velia AI Chat. Follow the supplied data and factuality rules exactly. Never invent center-specific information.',
        userText: buildChatPrompt(
          message,
          locale,
          body.context,
          history,
        ),
        jsonMode: false,
        maxOutputTokens: 4096,
        thinkingLevel: 'minimal',
      });

      const text = extractText(payload);
      if (!text) {
        const details = geminiErrorMessage(payload);
        console.error('Gemini chat failed:', details);
        return jsonResponse(
          {
            error: 'Gemini request failed',
            code: 'GEMINI_CHAT_FAILED',
            details: details.slice(0, 500),
          },
          payload.error?.code === 429 ? 429 : 502,
        );
      }

      const candidate = payload.candidates?.[0];
      const finishReason = candidate?.finishReason;

      if (finishReason === 'MAX_TOKENS') {
        console.warn(
          'Gemini chat response reached MAX_TOKENS. Increasing output budget is required.',
        );
      }

      const reply = text.slice(0, 12000);
      return jsonResponse({
        text: reply,
        reply,
        ...(finishReason ? { finishReason } : {}),
      });
    }

    if (mode === 'student_message') {
      const studentName = getString(body.studentName, 'O‘quvchi');
      const centerName = getString(body.centerName, 'Velia');
      const type = getString(body.type, 'general');
      const debt =
        typeof body.debt === 'number' && Number.isFinite(body.debt)
          ? body.debt
          : undefined;

      const payload = await callGemini({
        model,
        apiKey,
        systemInstruction: 'You write ready-to-send education-center messages for Velia.',
        userText: buildStudentMessagePrompt({
          studentName,
          centerName,
          type,
          debt,
          locale,
        }),
        jsonMode: false,
        maxOutputTokens: 1024,
        thinkingLevel: 'minimal',
      });

      const text = extractText(payload);
      if (!text) {
        const details = geminiErrorMessage(payload);
        console.error('Gemini student message failed:', details);
        return jsonResponse(
          {
            error: 'Gemini request failed',
            code: 'GEMINI_STUDENT_MESSAGE_FAILED',
            details: details.slice(0, 500),
          },
          payload.error?.code === 429 ? 429 : 502,
        );
      }

      return jsonResponse({ text: text.slice(0, 2000) });
    }

    if (!isRecord(body.context)) {
      return jsonResponse(
        { error: 'A metrics context is required', code: 'CONTEXT_REQUIRED' },
        400,
      );
    }

    const serializedContext = JSON.stringify(body.context);
    if (serializedContext.length > 12000) {
      return jsonResponse(
        {
          error: 'Metrics context is too large. Reduce the supplied center data.',
          code: 'CONTEXT_TOO_LARGE',
        },
        400,
      );
    }

    const payload = await callGemini({
      model,
      apiKey,
      systemInstruction: 'You are Velia Intelligence. Return only the requested JSON object.',
      userText: buildDirectorPrompt(body.context, locale),
      jsonMode: true,
      maxOutputTokens: 700,
    });

    const text = extractText(payload);
    if (!text) {
      const details = geminiErrorMessage(payload);
      console.error('Gemini Director failed:', details);
      return jsonResponse(
        {
          error: 'Gemini request failed',
          code: 'GEMINI_DIRECTOR_FAILED',
          details: details.slice(0, 500),
        },
        payload.error?.code === 429 ? 429 : 502,
      );
    }

    try {
      const parsed = parseJson<unknown>(text);
      if (!isValidDirectorResponse(parsed)) {
        console.error('Invalid Director response shape:', text.slice(0, 1000));
        return jsonResponse(
          { error: 'Gemini returned an invalid response shape', code: 'INVALID_DIRECTOR_RESPONSE' },
          502,
        );
      }

      return jsonResponse(compactDirectorResponse(parsed));
    } catch (error) {
      console.error('Failed to parse Gemini Director JSON:', error);
      return jsonResponse(
        { error: 'Gemini returned invalid JSON', code: 'INVALID_GEMINI_JSON' },
        502,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('gemini-director fatal error:', message);
    return jsonResponse(
      { error: 'Unable to process AI request', code: 'INTERNAL_ERROR' },
      500,
    );
  }
});
