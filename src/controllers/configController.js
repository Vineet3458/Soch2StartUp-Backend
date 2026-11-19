import Idea from "../models/Idea.js";
import { PUBLIC_KEYS, PERMISSIONS, DEFAULT_CONFIG } from "../config/defaults.js";
import { ROLES } from "../config/roles.js";
import { getConfig, getAllConfig, setConfig, resetConfig } from "../services/configService.js";
import { computeScore, testEngine } from "../services/aiService.js";
import { testWebhook } from "../services/webhook.js";
import { audit } from "../services/logger.js";
import { emit } from "../services/realtime.js";
import { publicStats } from "./statsController.js";
import { httpError, str } from "../utils.js";

const pickKeys = (keys) => Object.fromEntries(keys.map((k) => [k, getConfig(k)]));

export const publicConfig = async (req, res) => {
  const cfg = pickKeys(PUBLIC_KEYS);
  cfg.categories = cfg.categories.filter((c) => c.enabled);
  const stats = cfg.features.publicStats ? await publicStats() : null;
  res.json({ ...cfg, stats });
};

// Config for a logged-in user: public + the bits the UI needs to decide what to show
export const appConfig = async (req, res) => {
  const cfg = pickKeys(PUBLIC_KEYS);
  cfg.categories = cfg.categories.filter((c) => c.enabled);
  res.json({ ...cfg, scoring: { thresholds: getConfig("scoring").thresholds, weights: getConfig("scoring").weights }, permissions: req.user.role === ROLES.SUPERADMIN ? PERMISSIONS.map((p) => p.key) : getConfig("permissions")[req.user.role] || [], aiEnabled: getConfig("engine").enabled });
};

export const adminConfig = (req, res) => res.json({
  ...getAllConfig(), permissionList: PERMISSIONS, roles: Object.values(ROLES),
  geminiKeyPresent: Boolean(process.env.GEMINI_API_KEY),
  openRouterKeyPresent: Boolean(process.env.OPENROUTER_API_KEY),
  tavilyKeyPresent: Boolean(process.env.TAVILY_API_KEY),
  serperKeyPresent: Boolean(process.env.SERPER_API_KEY),
});

const num = (v, lo, hi, label) => { const n = Number(v); if (!Number.isFinite(n) || n < lo || n > hi) throw httpError(400, `${label} must be between ${lo} and ${hi}`); return n; };

const VALIDATORS = {
  platform: (v) => ({
    name: str(v.name, 40) || "Soch2Startup", tagline: str(v.tagline, 140), supportEmail: str(v.supportEmail, 100),
    registrationOpen: Boolean(v.registrationOpen), requireVerification: Boolean(v.requireVerification),
    maintenance: { enabled: Boolean(v.maintenance?.enabled), message: str(v.maintenance?.message, 240) },
    banner: { enabled: Boolean(v.banner?.enabled), text: str(v.banner?.text, 240), tone: ["info", "success", "warning", "danger"].includes(v.banner?.tone) ? v.banner.tone : "info" },
  }),
  features: (v) => Object.fromEntries(Object.keys(DEFAULT_CONFIG.features).map((k) => [k, Boolean(v[k])])),
  scoring: (v) => {
    const weights = Object.fromEntries(Object.keys(DEFAULT_CONFIG.scoring.weights).map((k) => [k, num(v.weights?.[k], 0, 100, `Weight for ${k}`)]));
    if (Object.values(weights).reduce((a, b) => a + b, 0) <= 0) throw httpError(400, "At least one weight must be above zero");
    const go = num(v.thresholds?.go, 1, 100, "GO threshold"), improve = num(v.thresholds?.improve, 0, 99, "IMPROVE threshold");
    if (improve >= go) throw httpError(400, "The GO threshold must be higher than the IMPROVE threshold");
    return { weights, thresholds: { go, improve } };
  },
  engine: (v) => {
    const supplied = Array.isArray(v.models) ? v.models : DEFAULT_CONFIG.engine.models;
    const models = supplied.slice(0, 6).map((m) => ({
      id: str(m.id, 30) || Math.random().toString(36).slice(2, 8),
      name: str(m.name, 60) || "Model",
      provider: ["openrouter", "gemini"].includes(m.provider) ? m.provider : "openrouter",
      model: str(m.model, 100),
      weight: num(m.weight, 0, 5, "Model weight"),
      enabled: Boolean(m.enabled),
    })).filter((m) => m.model);
    if (!models.length) throw httpError(400, "Add at least one model to the council");
    const live = v.liveData || {};
    return {
      mode: ["council", "single", "demo"].includes(v.mode) ? v.mode : "council",
      enabled: Boolean(v.enabled),
      provider: ["gemini", "demo"].includes(v.provider) ? v.provider : "gemini",
      model: str(v.model, 60) || "gemini-2.0-flash",
      temperature: num(v.temperature, 0, 1, "Temperature"),
      fallbackToDemo: Boolean(v.fallbackToDemo),
      market: str(v.market, 40) || "India",
      aggregation: ["weighted", "mean", "median"].includes(v.aggregation) ? v.aggregation : "weighted",
      liveData: {
        enabled: Boolean(live.enabled),
        maxResults: num(live.maxResults ?? 8, 1, 20, "Max results"),
        maxPages: num(live.maxPages ?? 3, 0, 8, "Max pages"),
        timeoutMs: num(live.timeoutMs ?? 8000, 2000, 20000, "Fetch timeout"),
        sources: (Array.isArray(live.sources) ? live.sources : ["search", "officialSites"]).filter((s) => ["search", "officialSites"].includes(s)),
      },
      models,
    };
  },
  categories: (v) => {
    if (!Array.isArray(v) || !v.length) throw httpError(400, "Provide at least one category");
    const seen = new Set();
    const list = v.slice(0, 30).map((c) => ({ name: str(c.name, 30), enabled: Boolean(c.enabled), color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : "#8b5cf6" })).filter((c) => { if (!c.name || seen.has(c.name.toLowerCase())) return false; seen.add(c.name.toLowerCase()); return true; });
    if (!list.some((c) => c.enabled)) throw httpError(400, "At least one category must stay enabled");
    return list;
  },
  permissions: (v) => {
    const keys = new Set(PERMISSIONS.map((p) => p.key));
    const out = {};
    for (const role of Object.values(ROLES)) out[role] = role === ROLES.SUPERADMIN ? [...keys] : [].concat(v[role] || []).filter((k) => keys.has(k));
    return out;
  },
  integrations: (v) => {
    const url = str(v.webhook?.url, 300);
    if (url && !/^https?:\/\//i.test(url)) throw httpError(400, "Webhook URL must start with http:// or https://");
    return { webhook: { enabled: Boolean(v.webhook?.enabled) && Boolean(url), url, events: [].concat(v.webhook?.events || []).filter((e) => ["idea.created", "idea.reviewed"].includes(e)) } };
  },
};

export const updateConfig = async (req, res) => {
  const key = req.params.key;
  if (!VALIDATORS[key]) throw httpError(404, "Unknown setting group");
  const value = await setConfig(key, VALIDATORS[key](req.body || {}), req.user._id);
  audit(req.user, `config.${key}`, key, "Settings updated");
  res.json(value);
};

export const resetConfigKey = async (req, res) => {
  if (!VALIDATORS[req.params.key]) throw httpError(404, "Unknown setting group");
  const value = await resetConfig(req.params.key, req.user._id);
  audit(req.user, `config.${req.params.key}.reset`, req.params.key, "Reset to defaults");
  res.json(value);
};

// Re-score every existing report with the current weights/thresholds
export const recalculate = async (req, res) => {
  const ideas = await Idea.find({ report: { $exists: true, $ne: null } });
  let changed = 0, verdictChanges = 0;
  for (const idea of ideas) {
    const { score, verdict } = computeScore(idea.report.metrics);
    if (score !== idea.report.score || verdict !== idea.report.verdict) {
      if (verdict !== idea.report.verdict) verdictChanges++;
      idea.report.score = score; idea.report.verdict = verdict; await idea.save(); changed++;
    }
  }
  audit(req.user, "scoring.recalculated", `${ideas.length} ideas`, `${changed} scores changed, ${verdictChanges} verdicts changed`);
  emit("ideas", "update");
  res.json({ total: ideas.length, changed, verdictChanges });
};

export const engineTest = async (req, res) => res.json(await testEngine());
export const webhookTest = async (req, res) => {
  const url = str(req.body.url, 300);
  if (!/^https?:\/\//i.test(url)) throw httpError(400, "Enter a valid http(s) URL first");
  res.json(await testWebhook(url));
};
