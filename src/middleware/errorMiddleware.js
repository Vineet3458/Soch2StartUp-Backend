import { syslog } from "../services/logger.js";

export const notFound = (req, res) => res.status(404).json({ message: `Route not found: ${req.originalUrl}` });

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  let status = err.status || (res.statusCode >= 400 ? res.statusCode : 500);
  let message = err.message || "Server error";
  if (err.code === 11000) { status = 400; message = "That value is already in use"; if (err.keyPattern?.email) message = "Email already registered"; }
  if (err.name === "CastError") { status = 400; message = "Invalid id"; }
  if (err.name === "ValidationError") { status = 400; message = Object.values(err.errors).map((e) => e.message).join(", "); }
  if (status >= 500) { console.error(err); syslog("error", "server.error", `${req.method} ${req.originalUrl}: ${err.message}`); message = "Server error"; }
  res.status(status).json({ message });
};
