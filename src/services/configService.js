import Config from "../models/Config.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { emit } from "./realtime.js";

const cache = new Map();
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const merge = (base, over) => {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = k in base ? merge(base[k], over[k]) : over[k];
  return out;
};

export const loadConfig = async () => {
  const rows = await Config.find();
  cache.clear();
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    const row = rows.find((r) => r.key === key);
    cache.set(key, merge(DEFAULT_CONFIG[key], row?.value));
  }
};

export const getConfig = (key) => cache.get(key) ?? DEFAULT_CONFIG[key];
export const getAllConfig = () => Object.fromEntries([...cache.entries()]);

export const setConfig = async (key, value, userId) => {
  if (!(key in DEFAULT_CONFIG)) throw Object.assign(new Error("Unknown config key"), { status: 400 });
  await Config.findOneAndUpdate({ key }, { key, value, updatedBy: userId }, { upsert: true, new: true });
  cache.set(key, merge(DEFAULT_CONFIG[key], value));
  emit("config", "update", key);
  return cache.get(key);
};

export const resetConfig = async (key, userId) => setConfig(key, DEFAULT_CONFIG[key], userId);

export const hasPermission = (role, perm) => {
  if (role === "superadmin") return true;
  return (getConfig("permissions")?.[role] || []).includes(perm);
};
