import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
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
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: (process.env.CLIENT_URL || "http://localhost:5173,http://127.0.0.1:5173").split(","), credentials: true }));
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

export const start = async (port) => {
  await connectDB();
  await loadConfig();
  const PORT = port ?? (process.env.PORT !== undefined && process.env.PORT !== "" ? process.env.PORT : 5000);
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, () => {
      const p = server.address()?.port || PORT;
      console.log(`Server running on port ${p}`);
      syslog("info", "server.started", `API listening on :${p}`);
      resolve(server);
    });
    server.on("error", reject);
  });
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
