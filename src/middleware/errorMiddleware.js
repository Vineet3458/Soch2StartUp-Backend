import { syslog } from "../services/logger.js";

export const redactUrl = (url = "") => {
  try {
    const [path, query] = String(url).split("?");
    if (!query) return url;
    const params = new URLSearchParams(query);
    for (const key of [...params.keys()]) {
      if (/token|password|key|secret/i.test(key)) {
        params.set(key, "[REDACTED]");
      }
    }
    const qs = decodeURIComponent(params.toString());
    return qs ? `${path}?${qs}` : path;
  } catch {
    return url;
  }
};

export const notFound = (req, res) => res.status(404).json({ message: `Route not found: ${redactUrl(req.originalUrl)}` });

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  let status = err.status || (res.statusCode >= 400 ? res.statusCode : 500);
  let message = err.message || "Server error";
  if (err.code === 11000) { status = 400; message = "That value is already in use"; if (err.keyPattern?.email) message = "Email already registered"; }
  if (err.name === "CastError") { status = 400; message = "Invalid id"; }
  if (err.name === "ValidationError") { status = 400; message = Object.values(err.errors).map((e) => e.message).join(", "); }
  if (status >= 500) {
    const safeUrl = redactUrl(req.originalUrl);
    console.error(err);
    syslog("error", "server.error", `${req.method} ${safeUrl}: ${err.message}`);
    message = "Server error";
  }
  res.status(status).json({ message });
};
