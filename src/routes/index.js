import { Router } from "express";
import rateLimit from "express-rate-limit";
import { protect, authorize, perm, feature, userFromToken } from "../middleware/authMiddleware.js";
import { addClient } from "../services/realtime.js";
import { ROLES } from "../config/roles.js";
import * as auth from "../controllers/authController.js";
import * as users from "../controllers/userController.js";
import * as ideas from "../controllers/ideaController.js";
import * as assignments from "../controllers/assignmentController.js";
import * as feedback from "../controllers/feedbackController.js";
import * as sessions from "../controllers/sessionController.js";
import * as notifications from "../controllers/notificationController.js";
import * as resources from "../controllers/resourceController.js";
import * as reports from "../controllers/reportController.js";
import * as requests from "../controllers/requestController.js";
import * as stats from "../controllers/statsController.js";
import * as config from "../controllers/configController.js";
import * as system from "../controllers/systemController.js";

const r = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false, message: { message: "Too many attempts. Please try again in a few minutes." } });

r.get("/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

/* Live updates (Server-Sent Events). Token in the query string because EventSource cannot set headers. */
r.get("/events", async (req, res) => {
  let user = null;
  if (req.query.token) {
    try { user = await userFromToken(String(req.query.token)); } catch { /* handled below */ }
    if (!user) return res.status(401).json({ message: "Invalid or expired token" });
  }
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ user: Boolean(user) })}\n\n`);
  const remove = addClient(res, user);
  req.on("close", remove);
});

/* Public */
r.get("/config/public", config.publicConfig);
r.post("/auth/register", authLimiter, auth.register);
r.post("/auth/login", authLimiter, auth.login);

/* Everything below needs a valid token */
r.use(protect);
r.get("/auth/me", auth.getMe);
r.patch("/auth/me", auth.updateMe);
r.patch("/auth/password", authLimiter, auth.changePassword);

r.get("/config/app", config.appConfig);
r.get("/notifications", notifications.listNotifications);
r.post("/notifications/read-all", notifications.markAllRead);
r.delete("/notifications/read", notifications.clearRead);
r.patch("/notifications/:id/read", notifications.markRead);
r.delete("/notifications/:id", notifications.removeOne);

r.get("/stats/market", stats.marketStats);
r.get("/stats/badges", stats.badges);
r.get("/stats/admin", perm("analytics.view"), stats.adminStats);

/* Ideas */
r.route("/ideas").get(ideas.listIdeas).post(ideas.createIdea);
r.get("/ideas/compare", feature("compareIdeas"), ideas.compareIdeas); // keep above /:id
r.route("/ideas/:id").get(ideas.getIdea).patch(ideas.updateIdea).delete(ideas.deleteIdea);
r.post("/ideas/:id/reanalyze", ideas.reanalyze);
r.put("/ideas/:id/plan", ideas.updatePlan);
r.put("/ideas/:id/roadmap", ideas.updateRoadmap);
r.post("/ideas/:id/review", perm("ideas.review"), ideas.reviewIdea);
r.post("/ideas/:id/assign", perm("ideas.assign"), ideas.assign);
r.post("/ideas/:id/claim", authorize(ROLES.MENTOR, ROLES.EXPERT), ideas.claim);
r.post("/ideas/:id/mentor-request", ideas.requestMentor);
r.post("/ideas/:id/feedback", perm("feedback.write"), feedback.addFeedback);

/* Assignments, feedback, sessions */
r.get("/assignments", assignments.listAssignments);
r.route("/assignments/:id").patch(assignments.updateAssignment).delete(perm("ideas.assign"), assignments.deleteAssignment);
r.post("/assignments/:id/re-eval", perm("ideas.assign"), assignments.requestReEval);
r.get("/feedback", feedback.listFeedback);
r.route("/feedback/:id").patch(feedback.updateFeedback).delete(feedback.removeFeedback);
r.post("/feedback/:id/dispute", feedback.openDispute);
r.post("/feedback/:id/dispute/resolve", feedback.resolveDispute);
r.get("/sessions", feature("sessions"), sessions.listSessions);
r.post("/sessions", feature("sessions"), perm("feedback.write", "ideas.assign"), sessions.createSession);
r.route("/sessions/:id").patch(sessions.updateSession).delete(sessions.deleteSession);

/* Resources */
r.get("/resources", feature("resourceHub"), resources.listResources);
r.post("/resources", perm("resources.manage"), resources.createResource);
r.put("/resources/:id", perm("resources.manage"), resources.updateResource);
r.delete("/resources/:id", perm("resources.manage"), resources.deleteResource);
r.post("/resources/:id/save", resources.toggleSave);

/* Moderation & approvals */
r.post("/reports", feature("moderation"), reports.createReport);
r.get("/reports", perm("reports.moderate"), reports.listReports);
r.post("/reports/:id/resolve", perm("reports.moderate"), reports.resolveReport);
r.get("/requests", requests.listRequests);
r.post("/requests/role-change", requests.requestRoleChange);
r.post("/requests/:id/decide", perm("ideas.assign", "roles.change"), requests.decideRequest);

/* Users */
r.get("/users/directory", users.directory);
r.get("/users", perm("users.view"), users.listUsers);
r.post("/users", perm("users.manage"), users.createUser);
r.patch("/users/:id/role", perm("roles.change"), users.setRole);
r.post("/users/:id/verify", perm("users.manage"), users.verifyUser);
r.post("/users/:id/block", perm("users.manage"), users.blockUser);
r.delete("/users/:id", perm("users.manage"), users.deleteUser);

/* Logs & system */
r.get("/logs", perm("logs.view"), system.listLogs);
r.get("/system/health", authorize(ROLES.ADMIN, ROLES.SUPERADMIN), system.health);

/* Superadmin configuration */
const sa = authorize(ROLES.SUPERADMIN);
r.get("/config", sa, config.adminConfig);
r.post("/config/scoring/recalculate", sa, config.recalculate);
r.post("/config/engine/test", sa, config.engineTest);
r.post("/config/integrations/webhook/test", sa, config.webhookTest);
r.put("/config/:key", sa, config.updateConfig);
r.post("/config/:key/reset", sa, config.resetConfigKey);

export default r;
