// Idea validation engine. Uses Gemini when a key is configured, otherwise a deterministic,
// idea-aware demo analysis. Scoring weights/thresholds come from the live Scoring Configuration.
import { getConfig } from "./configService.js";
import { recordAi } from "./metrics.js";
import { syslog } from "./logger.js";

const METRIC_KEYS = ["marketDemand", "competition", "feasibility", "financial", "risk"];
const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

/* ---------- scoring (pure, shared with "recalculate all") ---------- */
export const computeScore = (metrics, scoring = getConfig("scoring")) => {
  const w = scoring.weights;
  const total = METRIC_KEYS.reduce((s, k) => s + (Number(w[k]) || 0), 0) || 1;
  const score = Math.round(METRIC_KEYS.reduce((s, k) => s + (metrics[k] || 0) * ((Number(w[k]) || 0) / total), 0));
  const { go, improve } = scoring.thresholds;
  const verdict = score >= go ? "GO" : score >= improve ? "IMPROVE" : "AVOID";
  return { score, verdict };
};

/* ---------- Gemini ---------- */
const buildPrompt = ({ title, description, industry, budget, teamSize }, market) => `
You are a startup analyst. Evaluate this startup idea for the ${market} market.
Title: ${title}
Description: ${description}
Industry: ${industry}
Budget: ${budget}
Team: ${teamSize}

Return ONLY valid JSON with exactly this shape (all metrics are integers 0-100, higher is better):
{
  "metrics": { "marketDemand": 0, "competition": 0, "feasibility": 0, "financial": 0, "risk": 0 },
  "marketResearch": "2-3 sentences",
  "feasibilityNote": "2 sentences",
  "swot": { "strengths": [], "weaknesses": [], "opportunities": [], "threats": [] },
  "targetCustomers": [],
  "competitors": [],
  "risks": [],
  "recommendations": []
}
"competition" means 100 = very little competition. "risk" means 100 = very low risk.
Keep every list to 3 short items. Be critical and differentiate: do not give every idea similar scores.`;

const callGemini = async (idea, engine) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(engine.model)}:generateContent`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      // key goes in a header, not the URL, so it never lands in proxy/access logs
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(idea, engine.market) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: Number(engine.temperature) },
      }),
    });
    if (!res.ok) throw new Error(`Gemini API error ${res.status}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return JSON.parse(text.replace(/^```json|```$/g, "").trim());
  } finally { clearTimeout(timer); }
};

/* ---------- deterministic demo analysis ---------- */
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const INDUSTRY = {
  FoodTech: { demand: 74, comp: 42, feas: 70, fin: 58, risk: 55, competitors: ["Swiggy", "Zomato", "Local cloud kitchens"], customers: ["Urban working professionals", "Students & hostel residents", "Health-conscious families"], market: "India's food delivery and food-tech market is growing fast, driven by quick-commerce and rising disposable incomes in tier-1 and tier-2 cities." },
  EdTech: { demand: 78, comp: 38, feas: 74, fin: 55, risk: 56, competitors: ["BYJU'S", "Unacademy", "PhysicsWallah"], customers: ["School & college students", "Competitive exam aspirants", "Working professionals upskilling"], market: "India has one of the world's largest learner populations, and hybrid online learning continues to expand beyond metro cities." },
  HealthTech: { demand: 80, comp: 52, feas: 60, fin: 62, risk: 46, competitors: ["Practo", "PharmEasy", "HealthifyMe"], customers: ["Chronic-care patients", "Urban middle-class families", "Elderly users and caregivers"], market: "Digital health adoption in India is accelerating, supported by the Ayushman Bharat Digital Mission and growing telemedicine acceptance." },
  FinTech: { demand: 82, comp: 34, feas: 62, fin: 70, risk: 44, competitors: ["Paytm", "PhonePe", "Razorpay"], customers: ["First-time credit users", "Small merchants", "Gig-economy workers"], market: "UPI and open-banking rails make India one of the most active fintech markets, though regulation and trust are major hurdles." },
  "E-commerce": { demand: 76, comp: 28, feas: 72, fin: 52, risk: 50, competitors: ["Amazon India", "Flipkart", "Meesho"], customers: ["Tier-2/3 online shoppers", "Value-seeking millennials", "Small resellers"], market: "Online retail penetration in India is still low versus China or the US, leaving room for niche and vernacular-first players." },
  SaaS: { demand: 72, comp: 44, feas: 78, fin: 72, risk: 62, competitors: ["Zoho", "Freshworks", "Global SaaS incumbents"], customers: ["SMBs and startups", "Agencies & consultancies", "Operations teams"], market: "Indian SaaS is a global export story with strong engineering talent, but sales-cycle length and pricing pressure are persistent challenges." },
  AgriTech: { demand: 77, comp: 58, feas: 64, fin: 50, risk: 52, competitors: ["DeHaat", "AgroStar", "Ninjacart"], customers: ["Smallholder farmers", "Farmer Producer Organisations", "Agri-input dealers"], market: "With over 140 million farm households, agritech has a huge addressable base, but farmer willingness-to-pay and last-mile trust are critical." },
  Other: { demand: 65, comp: 50, feas: 66, fin: 56, risk: 55, competitors: ["Established incumbents", "Local offline alternatives", "Early-stage startups"], customers: ["Early adopters", "Small businesses", "Urban consumers"], market: "The target segment shows steady digital adoption, though demand needs to be validated through direct customer discovery." },
};

const demoReport = ({ title, description, industry, budget, teamSize }) => {
  const base = INDUSTRY[industry] || INDUSTRY.Other;
  const rnd = rng(hash(`${title}|${description}|${industry}`));
  const text = `${title} ${description}`.toLowerCase();
  const has = (re) => re.test(text);
  const detail = Math.min(12, Math.floor(description.length / 60)); // richer description = better-defined idea
  const monet = has(/subscription|commission|fee|pricing|revenue|saas|b2b|marketplace|premium|licen[sc]e/) ? 7 : -3;
  const tech = has(/\bai\b|machine learning|automation|platform|app|data|iot|analytics/) ? 4 : 0;
  const niche = has(/niche|specific|only|focused|regional|vernacular|tier[- ]?[23]/) ? 6 : 0;
  const crowded = has(/uber for|marketplace for everything|social network|food delivery|ride/) ? -9 : 0;
  const budgetBoost = /under/i.test(budget) ? -6 : /above/i.test(budget) ? 6 : 0;
  const teamBoost = /solo/i.test(teamSize) ? -4 : /4\+/.test(teamSize) ? 5 : 1;
  const j = (spread) => Math.round((rnd() - 0.5) * spread);

  const metrics = {
    marketDemand: clamp(base.demand + detail * 0.6 + tech + niche + j(14)),
    competition: clamp(base.comp + niche * 1.5 + crowded + j(16)),
    feasibility: clamp(base.feas + detail * 0.5 + teamBoost + tech - 2 + j(14)),
    financial: clamp(base.fin + monet + budgetBoost + j(14)),
    risk: clamp(base.risk + teamBoost + budgetBoost * 0.5 + niche * 0.5 + j(14)),
  };
  const shortTitle = title.length > 40 ? `${title.slice(0, 38)}…` : title;
  return {
    metrics,
    marketResearch: `${base.market} For "${shortTitle}", the strongest demand signal comes from ${base.customers[0].toLowerCase()}.`,
    feasibilityNote: `${metrics.feasibility >= 65 ? "An MVP looks achievable within 8–12 weeks with the stated team." : "The build needs a tighter scope or extra expertise before an MVP is realistic."} Financial viability depends on ${monet > 0 ? "converting early users into paying customers" : "defining a clear revenue model early"}.`,
    swot: {
      strengths: [detail > 4 ? "Well-articulated problem statement" : "Clear core concept", niche ? "Focused niche positioning" : "Growing market demand", tech ? "Technology-led differentiation" : "Low-cost MVP path"],
      weaknesses: ["No brand recognition yet", /under/i.test(budget) ? "Very limited initial funding" : "Unproven unit economics", /solo/i.test(teamSize) ? "Single-founder execution risk" : "Team needs domain advisors"],
      opportunities: [`Underserved ${industry} niches`, "Strategic partnerships & pilots", "Government and incubator support schemes"],
      threats: [`Established players like ${base.competitors[0]}`, "Fast followers copying the model", "Changing regulation & customer acquisition costs"],
    },
    targetCustomers: base.customers,
    competitors: base.competitors,
    risks: ["Customer acquisition cost", metrics.financial < 55 ? "Unclear path to revenue" : "Cash runway", "Execution speed vs. incumbents"],
    recommendations: ["Interview 15–20 target customers before building", metrics.competition < 45 ? "Pick one underserved niche to avoid head-on competition" : "Double down on your differentiator", "Ship a 6–8 week MVP and run a small paid pilot"],
  };
};

const list = (v, fallback) => (Array.isArray(v) && v.length ? v.slice(0, 5).map(String) : fallback);
const str = (v, fallback) => (typeof v === "string" && v.trim() ? v : fallback);

export const analyzeIdea = async (idea) => {
  const engine = getConfig("engine");
  const features = getConfig("features");
  const demo = demoReport(idea);
  let raw = demo;
  let source = "demo";

  if (process.env.GEMINI_API_KEY && engine.enabled && features.aiValidation && engine.provider === "gemini") {
    const t0 = Date.now();
    try {
      raw = await callGemini(idea, engine);
      source = "gemini";
      recordAi({ ok: true, ms: Date.now() - t0 });
    } catch (err) {
      recordAi({ ok: false, ms: Date.now() - t0, error: err.name === "AbortError" ? "timeout" : err.message });
      syslog("warn", "ai.gemini_failed", err.message, idea.title);
      if (!engine.fallbackToDemo) throw Object.assign(new Error("The AI engine is unavailable right now. Please try again shortly."), { status: 503 });
      raw = demo;
    }
  }

  const m = raw.metrics || {};
  const metrics = Object.fromEntries(METRIC_KEYS.map((k) => [k, clamp(m[k] ?? demo.metrics[k])]));
  const sw = raw.swot || {};
  return {
    source,
    generatedAt: new Date(),
    metrics,
    ...computeScore(metrics),
    marketResearch: str(raw.marketResearch, demo.marketResearch),
    feasibilityNote: str(raw.feasibilityNote, demo.feasibilityNote),
    swot: {
      strengths: list(sw.strengths, demo.swot.strengths), weaknesses: list(sw.weaknesses, demo.swot.weaknesses),
      opportunities: list(sw.opportunities, demo.swot.opportunities), threats: list(sw.threats, demo.swot.threats),
    },
    targetCustomers: list(raw.targetCustomers, demo.targetCustomers),
    competitors: list(raw.competitors, demo.competitors),
    risks: list(raw.risks, demo.risks),
    recommendations: list(raw.recommendations, demo.recommendations),
  };
};

// Used by Validation Engine "test run" - does not save anything
export const testEngine = async () => {
  const t0 = Date.now();
  const r = await analyzeIdea({ title: "Test: AI crop advisory", description: "A WhatsApp-first assistant that helps smallholder farmers diagnose crop disease from photos and get mandi prices.", industry: "AgriTech", budget: "₹1–10 lakh", teamSize: "2–3 members" });
  return { source: r.source, score: r.score, verdict: r.verdict, ms: Date.now() - t0, geminiKeyPresent: Boolean(process.env.GEMINI_API_KEY) };
};
