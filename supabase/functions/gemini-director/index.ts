declare const Deno: {
  serve(handler: (request: Request) => Response | Promise<Response>): void;
  env: {
    get(name: string): string | undefined;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Locale = 'uz' | 'ru' | 'en';

type DirectorRequest = {
  context?: Record<string, unknown>;
  locale?: string;
};

function normalizeLocale(locale?: string): Locale {
  if (locale?.startsWith('ru')) return 'ru';
  if (locale?.startsWith('en')) return 'en';
  return 'uz';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidResponse(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.summary === 'string' &&
    ['good', 'warning', 'critical', 'unknown'].includes(String(value.health)) &&
    Array.isArray(value.insights) &&
    Array.isArray(value.recommendedActions)
  );
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

function buildPrompt(context: Record<string, unknown>, locale: Locale): string {
  const languageName = locale === 'ru' ? 'Russian' : locale === 'en' ? 'English' : 'Uzbek (Latin script)';

  return [
    'You are Velia Intelligence, an education-center operations analyst.',
    `Respond only in ${languageName}. Every summary, insight title, insight description, action, and recommendation must use that language.`,
    'Use only the supplied metrics. Never invent, estimate, or fill in missing numbers.',
    'Keep the response minimal: summary under 120 characters, at most 2 insights, and at most 2 recommended actions.',
    'If a metric is missing, state that it is unavailable instead of creating a value.',
    'Return valid JSON only. Do not wrap it in Markdown.',
    'Return one JSON object with these keys only: summary, health, insights, recommendedActions.',
    'Each insight must have: type, severity, title, description, action, relatedIds.',
    'Each recommendation must have: priority, title, description, actionType.',
    'Center metrics:',
    JSON.stringify(context),
  ].join('\n');
}

async function requestGemini(model: string, apiKey: string, prompt: string): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body = JSON.stringify({
    systemInstruction: {
      parts: [{ text: prompt }],
    },
    contents: [{ role: 'user', parts: [{ text: 'Analyze the supplied center metrics.' }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 192,
      responseMimeType: 'application/json',
    },
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body,
    });

    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status) || attempt === 1) {
      return response;
    }

    await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
  }

  throw new Error('Gemini request retry limit reached');
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.6-flash';
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Gemini is not configured on the server' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json() as DirectorRequest;
    if (!isRecord(body.context)) {
      return new Response(JSON.stringify({ error: 'A metrics context is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const locale = normalizeLocale(body.locale);
    const response = await requestGemini(model, apiKey, buildPrompt(body.context, locale));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini request failed', response.status, errorText.slice(0, 500));
      let upstreamMessage = 'Unknown Gemini API error';
      try {
        const upstreamPayload = JSON.parse(errorText) as { error?: { message?: string } };
        upstreamMessage = upstreamPayload.error?.message || upstreamMessage;
      } catch {
        // Keep the response safe if Gemini returns non-JSON text.
      }
      const transient = [429, 500, 502, 503, 504].includes(response.status);
      return new Response(JSON.stringify({ error: 'Gemini request failed', details: upstreamMessage }), {
        status: transient ? 503 : 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') {
      return new Response(JSON.stringify({ error: 'Gemini returned an empty response' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = extractJson(text);
    if (!isValidResponse(result)) {
      return new Response(JSON.stringify({ error: 'Gemini returned an invalid response shape' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const compactResult = result as {
      summary: string;
      insights: unknown[];
      recommendedActions: unknown[];
      [key: string]: unknown;
    };
    compactResult.summary = compactResult.summary.slice(0, 120);
    compactResult.insights = compactResult.insights.slice(0, 2);
    compactResult.recommendedActions = compactResult.recommendedActions.slice(0, 2);

    return new Response(JSON.stringify(compactResult), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Gemini function error', error);
    return new Response(JSON.stringify({ error: 'Unable to generate AI analysis' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
