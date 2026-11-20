import Log from "../models/Log.js";
import User from "../models/User.js";
import { getConfig } from "../services/configService.js";
import { snapshot } from "../services/metrics.js";
import { clientCount, onlineUserIds } from "../services/realtime.js";
import { dbPing } from "./statsController.js";
import { escapeRegex } from "../utils.js";

export const listLogs = async (req, res) => {
  const { kind = "audit", level, q, limit = 200 } = req.query;
  if (kind === "system" && req.user.role !== "superadmin") return res.status(403).json({ message: "Only a superadmin can read system logs" });
  const filter = { kind };
  if (level) filter.level = level;
  if (q) { const rx = new RegExp(escapeRegex(q), "i"); filter.$or = [{ action: rx }, { message: rx }, { actorName: rx }, { target: rx }]; }
  const logs = await Log.find(filter).sort("-createdAt").limit(Math.min(Number(limit) || 200, 500));
  res.json(logs);
};

export const health = async (req, res) => {
  const [db, errors24h, recent, activeUsers] = await Promise.all([
    dbPing(),
    Log.countDocuments({ kind: "system", level: "error", createdAt: { $gte: new Date(Date.now() - 86400000) } }),
    Log.find({ kind: "system" }).sort("-createdAt").limit(6),
    User.countDocuments({ isActive: true }),
  ]);
  const m = snapshot();
  const engine = getConfig("engine"), hook = getConfig("integrations").webhook;
  const mode = engine.mode || "council";
  const keyPresent = mode === "council"
    ? Boolean(process.env.OPENROUTER_API_KEY) && (engine.models || []).filter((x) => x.enabled).length >= 2
    : Boolean(process.env.GEMINI_API_KEY);
  const aiStatus = !engine.enabled || !getConfig("features").aiValidation ? "disabled" : !keyPresent || (mode !== "council" && engine.provider === "demo") ? "demo" : m.ai.lastOk === false ? "degraded" : "operational";
  const services = [
    { key: "api", name: "API server", status: "operational", detail: `${m.requests} requests · ${m.avgMs} ms avg` },
    { key: "db", name: "Database", status: db.ok ? "operational" : "down", detail: `${db.ms} ms ping` },
    { key: "ai", name: "AI validation engine", status: aiStatus, detail: aiStatus === "demo" ? (mode === "council" && !process.env.OPENROUTER_API_KEY ? "Council needs OPENROUTER_API_KEY – using demo analysis" : "Using built-in demo analysis") : m.ai.lastMs != null ? `Last call ${m.ai.lastMs} ms` : "Waiting for first call" },
    { key: "realtime", name: "Realtime stream", status: "operational", detail: `${clientCount()} open connections` },
    { key: "webhook", name: "Outgoing webhook", status: hook.enabled ? "operational" : "disabled", detail: hook.enabled ? hook.url : "Not configured" },
  ];
  res.json({ ...m, db, services, errors24h, recent, activeUsers, online: onlineUserIds().length, connections: clientCount() });
};
