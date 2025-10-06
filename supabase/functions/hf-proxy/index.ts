import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const HF_TOKEN = Deno.env.get("HF_TOKEN");
if (!HF_TOKEN) {
  throw new Error("HF_TOKEN environment variable is missing. Set it via `supabase secrets set HF_TOKEN=...`");
}

const HF_API_URL = "https://api-inference.huggingface.co/models";
const HF_ROUTER_URL = "https://router.huggingface.co/v1/chat/completions";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    const { modelId, inputs, parameters, messages } = await req.json();
    const trimmedModelId = typeof modelId === "string" ? modelId.trim() : "";

    if (!trimmedModelId) {
      return new Response(JSON.stringify({ error: "modelId is required" }), {
        status: 400,
        headers: corsHeaders
      });
    }

    if (Array.isArray(messages) && messages.length > 0) {
      return await forwardToRouter(trimmedModelId, messages, parameters);
    }

    if (typeof inputs === "string" && inputs.trim().length > 0) {
      return await forwardToInference(trimmedModelId, inputs, parameters);
    }

    return new Response(JSON.stringify({ error: "Either messages or inputs must be provided" }), {
      status: 400,
      headers: corsHeaders
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "Unexpected server error" }), {
      status: 500,
      headers: corsHeaders
    });
  }
});

function defaultParameters(modelId: string) {
  if (modelId.startsWith("openai/gpt-oss")) {
    return {
      provider: {
        name: "openai",
        args: {
          model: "gpt-4o-mini",
          temperature: 0.7
        }
      }
    };
  }
  return {
    max_tokens: 512,
    max_new_tokens: 512,
    temperature: 0.7
  };
}

async function forwardToRouter(modelId: string, messages: unknown, parameters: unknown) {
  const normalizedMessages = normalizeMessages(messages);
  if (!normalizedMessages.length) {
    return new Response(JSON.stringify({ error: "messages must be an array of { role, content }" }), {
      status: 400,
      headers: corsHeaders
    });
  }

  const params = normalizeChatParameters(parameters, modelId);
  const payload: Record<string, unknown> = {
    model: modelId,
    messages: normalizedMessages
  };

  if (typeof params.temperature === "number") {
    payload.temperature = params.temperature;
  }
  if (typeof params.max_tokens === "number") {
    payload.max_tokens = params.max_tokens;
  }
  const provider = (params as { provider?: unknown }).provider;
  if (provider !== undefined) {
    payload.provider = provider;
  }

  const response = await fetch(HF_ROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return buildProxyResponse(response);
}

async function forwardToInference(modelId: string, inputs: string, parameters: unknown) {
  const params = normalizeGenerateParameters(parameters, modelId);
  const body: Record<string, unknown> = {
    inputs
  };

  if (params) {
    body.parameters = params;
  }

  const response = await fetch(`${HF_API_URL}/${encodeURIComponent(modelId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  return buildProxyResponse(response);
}

function normalizeMessages(input: unknown): Array<{ role: string; content: string }> {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((candidate) => {
      if (!candidate || typeof candidate !== "object") {
        return null;
      }

      const role = typeof (candidate as { role?: unknown }).role === "string" ? (candidate as { role: string }).role : "";
      const rawContent = (candidate as { content?: unknown }).content;
      const content = typeof rawContent === "string" ? rawContent : "";

      if (!role || !content) {
        return null;
      }

      return { role, content };
    })
    .filter((item): item is { role: string; content: string } => Boolean(item));
}

function normalizeChatParameters(parameters: unknown, modelId: string) {
  const defaults = defaultParameters(modelId);
  const merged = {
    ...defaults,
    ...(typeof parameters === "object" && parameters !== null ? parameters : {})
  } as Record<string, unknown>;

  if (merged.max_tokens === undefined && typeof merged.max_new_tokens === "number") {
    merged.max_tokens = merged.max_new_tokens;
  }

  if (typeof merged.temperature === "string") {
    const parsed = Number(merged.temperature);
    if (!Number.isNaN(parsed)) {
      merged.temperature = parsed;
    }
  }

  return merged;
}

function normalizeGenerateParameters(parameters: unknown, modelId: string) {
  const defaults = defaultParameters(modelId);
  const merged = {
    ...defaults,
    ...(typeof parameters === "object" && parameters !== null ? parameters : {})
  } as Record<string, unknown>;

  if (merged.max_new_tokens === undefined && typeof merged.max_tokens === "number") {
    merged.max_new_tokens = merged.max_tokens;
  }

  const result: Record<string, unknown> = {};

  if (typeof merged.max_new_tokens === "number") {
    result.max_new_tokens = merged.max_new_tokens;
  }
  if (typeof merged.temperature === "number") {
    result.temperature = merged.temperature;
  }
  const provider = (merged as { provider?: unknown }).provider;
  if (provider !== undefined) {
    result.provider = provider;
  }

  return Object.keys(result).length ? result : null;
}

async function buildProxyResponse(upstream: Response) {
  const text = await upstream.text();
  const headers = { ...corsHeaders };
  const contentType = upstream.headers.get("content-type");
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  return new Response(text, {
    status: upstream.status,
    headers
  });
}
