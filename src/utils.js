import mongoose from "mongoose";

export const httpError = (status, message) => Object.assign(new Error(message), { status });
export const pick = (obj = {}, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const isId = (v) => mongoose.isValidObjectId(v) && String(v).length === 24;
export const str = (v, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const needId = (v, label = "id") => { if (!isId(v)) throw httpError(400, `Invalid ${label}`); return v; };

export const sanitizeQuery = (val, max = 200) => {
  if (typeof val !== "string") return undefined;
  const s = val.trim();
  return s.length > 0 ? s.slice(0, max) : undefined;
};
export const cleanStr = sanitizeQuery;

export const isSafeUrl = (rawUrl) => {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    let h = u.hostname.toLowerCase();
    if (h.startsWith("[") && h.endsWith("]")) {
      h = h.slice(1, -1);
    }
    if (!h || h === "localhost" || h.endsWith(".localhost")) return false;
    if (h === "::" || h === "::1" || h === "0:0:0:0:0:0:0:0" || h === "0:0:0:0:0:0:0:1") return false;
    if (/^f[cd][0-9a-f]{2}:/i.test(h) || /^fe[89ab][0-9a-f]:/i.test(h)) return false;
    if (h.startsWith("::ffff:")) {
      const rest = h.slice(7);
      if (/^\d+\.\d+\.\d+\.\d+$/.test(rest)) {
        h = rest;
      } else {
        const parts = rest.split(":");
        if (parts.length === 2) {
          const high = parseInt(parts[0], 16);
          const low = parseInt(parts[1], 16);
          h = [high >> 8, high & 255, low >> 8, low & 255].join(".");
        }
      }
    }
    if (/^0\./.test(h) || h === "0.0.0.0") return false;
    if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return false;
    if (/^192\.0\.[02]\./.test(h) || /^198\.51\.100\./.test(h) || /^203\.0\.113\./.test(h)) return false;
    if (/^(22[4-9]|23\d|24\d|25[0-5])\./.test(h)) return false;
    return true;
  } catch {
    return false;
  }
};
