// One interface for every LLM provider. The council calls this for each model
// with the same prompt, so adding a provider never touches the validation logic.
import { syslog } from "./logger.js";

export const REPORT_SYSTEM = `You are a startup analyst evaluating a startup idea for funding potential.
Be critical and specific. Base your judgement on the idea, the market context and any LIVE MARKET DATA provided.
Return ONLY valid JSON with exactly this shape (all metrics are integers 0-100, higher is better):
{
  "metrics": { "marketDemand": 0, "competition": 0, "feasibility": 0, "financial": 0, "risk": 0 },
  "marketResearch": "2-3 sentences citing the live signals where relevant",
  "feasibilityNote": "2 sentences",
  "swot": { "strengths": [], "weaknesses": [], "opportunities": [], "threats": [] },
  "targetCustomers": [],
  "competitors": [],
  "risks": [],
  "recommendations": []
}
"competition" means 100 = very little competition. "risk" means 100 = very low risk.
Keep every list to 3 short items. Do not give every idea similar scores.`;

export const parseModelJson = (raw) => {
  let text = String(raw || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(text); } catch { /* try to salvage */ }
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* fall through */ }
  }
  throw new Error("Model returned invalid JSON");
};

const post = async (url, { headers = {}, body }, ms) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${detail ? ` ${detail.slice(0, 160)}` : ""}`);
    }
    return res.json();
  } finally { clearTimeout(timer); }
};

const callOpenRouter = async ({ model, apiKey, prompt, temperature, timeoutMs }) => {
  const base = {
    model,
    messages: [{ role: "system", content: REPORT_SYSTEM }, { role: "user", content: prompt }],
    temperature,
  };
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": process.env.CLIENT_URL || "http://localhost:5173",
    "X-Title": "Soch2Startup",
  };
  try {
    const data = await post("https://openrouter.ai/api/v1/chat/completions", {
      headers, body: { ...base, response_format: { type: "json_object" } },
    }, timeoutMs);
    return parseModelJson(data.choices?.[0]?.message?.content);
  } catch (e) {
    // A few free models reject response_format - retry once without it.
    if (!/400|response_format|json_object/i.test(e.message)) throw e;
    syslog("warn", "model.json_mode_retry", e.message, model);
    const data = await post("https://openrouter.ai/api/v1/chat/completions", { headers, body: base }, timeoutMs);
    return parseModelJson(data.choices?.[0]?.message?.content);
  }
};

const callGemini = async ({ model, apiKey, prompt, temperature, timeoutMs }) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const data = await post(url, {
    headers: { "x-goog-api-key": apiKey },
    body: {
      contents: [{ parts: [{ text: `${REPORT_SYSTEM}\n\n${prompt}` }] }],
      generationConfig: { responseMimeType: "application/json", temperature },
    },
  }, timeoutMs);
  return parseModelJson(data.candidates?.[0]?.content?.parts?.[0]?.text);
};

export const keyForProvider = (provider) => (
  provider === "gemini" ? process.env.GEMINI_API_KEY
    : provider === "openrouter" ? process.env.OPENROUTER_API_KEY
      : ""
);

export const callModel = async ({ provider = "openrouter", model, apiKey, prompt, temperature = 0.4, timeoutMs = 30000 }) => {
  if (!apiKey) throw new Error(`No API key configured for ${provider}`);
  if (provider === "gemini") return callGemini({ model, apiKey, prompt, temperature, timeoutMs });
  if (provider === "openrouter") return callOpenRouter({ model, apiKey, prompt, temperature, timeoutMs });
  throw new Error(`Unsupported provider: ${provider}`);
};
