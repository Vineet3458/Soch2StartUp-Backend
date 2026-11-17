import mongoose from "mongoose";

export const httpError = (status, message) => Object.assign(new Error(message), { status });
export const pick = (obj = {}, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const isId = (v) => mongoose.isValidObjectId(v) && String(v).length === 24;
export const str = (v, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const needId = (v, label = "id") => { if (!isId(v)) throw httpError(400, `Invalid ${label}`); return v; };
