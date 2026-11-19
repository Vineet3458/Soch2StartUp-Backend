import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import connectDB from "./src/config/db.js";
import routes from "./src/routes/index.js";
import { loadConfig } from "./src/services/configService.js";
import { metricsMiddleware } from "./src/services/metrics.js";
import { syslog } from "./src/services/logger.js";
import { notFound, errorHandler } from "./src/middleware/errorMiddleware.js";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith("change_this")) {
  if (process.env.NODE_ENV === "production") { console.error("Refusing to start: set a strong JWT_SECRET in .env"); process.exit(1); }
  console.warn("⚠  JWT_SECRET is not set to a strong value. Fine for development, NOT for production.");
  process.env.JWT_SECRET ||= "dev-only-secret";
}

export const app = express();
if (process.env.NODE_ENV === "production" || process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "http://localhost:5000", "http://localhost:5173", "ws:", "http:", "https:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  })
);

app.use((req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  next();
});

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true, maxAge: 86400 }));

const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many requests from this IP, please try again in a few minutes." },
});
app.use("/api", globalApiLimiter);

app.use(express.json({ limit: "200kb" }));
app.use(metricsMiddleware);

app.use("/api", routes);
app.use("/api", notFound);

// Optional: serve the built React app from the same server (npm run build in the frontend first)
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../soch2startup-frontend/dist");
if (process.env.SERVE_CLIENT === "true" && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, "index.html")));
}
app.use(notFound);
app.use(errorHandler);

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  syslog("error", "process.unhandledRejection", err?.message || String(err));
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  syslog("error", "process.uncaughtException", err?.message || String(err));
  process.exit(1);
});

let activeServer = null;

const handleShutdown = async (signal) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  syslog("info", "process.shutdown", `Received ${signal}`);
  if (activeServer) {
    activeServer.close(async () => {
      try {
        const mongoose = (await import("mongoose")).default;
        await mongoose.disconnect();
      } catch { /* ignore */ }
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 10000).unref();
  } else {
    process.exit(0);
  }
};

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

export const start = async (port) => {
  await connectDB();
  await loadConfig();
  const PORT = port ?? (process.env.PORT !== undefined && process.env.PORT !== "" ? process.env.PORT : 5000);
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, () => {
      activeServer = server;
      const p = server.address()?.port || PORT;
      console.log(`Server running on port ${p}`);
      syslog("info", "server.started", `API listening on :${p}`);
      resolve(server);
    });
    server.on("error", reject);
  });
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
