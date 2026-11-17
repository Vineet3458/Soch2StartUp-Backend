import Log from "../models/Log.js";
import { emit } from "./realtime.js";

const safe = async (doc) => { try { await Log.create(doc); emit("logs", "create"); } catch (e) { console.error("log write failed:", e.message); } };

// Business event: who did what
export const audit = (actor, action, target = "", message = "") =>
  safe({ kind: "audit", level: "info", actor: actor?._id, actorName: actor?.name, actorRole: actor?.role, action, target: String(target || ""), message });

// Server event: errors, integration results, security warnings
export const syslog = (level, action, message = "", target = "") => safe({ kind: "system", level, action, message, target });
