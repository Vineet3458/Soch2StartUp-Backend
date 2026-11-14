import test from "node:test";
import assert from "node:assert/strict";
import { ROLES, SELF_REGISTER_ROLES } from "./src/config/roles.js";
import { analyzeIdea } from "./src/services/geminiService.js";
import { notFound, errorHandler } from "./src/middleware/errorMiddleware.js";
import { authorize } from "./src/middleware/authMiddleware.js";
import authRoutes from "./src/routes/authRoutes.js";
import ideaRoutes from "./src/routes/ideaRoutes.js";
import adminRoutes from "./src/routes/adminRoutes.js";

test("Backend Configuration - ROLES and SELF_REGISTER_ROLES", () => {
  assert.equal(ROLES.ENTREPRENEUR, "entrepreneur");
  assert.equal(ROLES.ADMIN, "admin");
  assert.equal(ROLES.SUPERADMIN, "superadmin");
  assert.equal(ROLES.MENTOR, "mentor");
  assert.equal(ROLES.EXPERT, "industry_expert");
  assert.equal(ROLES.MODERATOR, "moderator");

  assert.deepEqual(SELF_REGISTER_ROLES, [ROLES.ENTREPRENEUR, ROLES.MENTOR, ROLES.EXPERT]);
  assert.equal(SELF_REGISTER_ROLES.includes(ROLES.ADMIN), false);
  assert.equal(SELF_REGISTER_ROLES.includes(ROLES.SUPERADMIN), false);
});

test("Gemini Service - analyzeIdea fallback and score calculation", async () => {
  const sampleIdea = {
    title: "AI Powered Farm Analytics",
    description: "Real-time crop disease detection and soil moisture monitoring using drones and IoT sensors",
    industry: "Agritech",
    budget: "$25,000",
    teamSize: "4 engineers",
  };

  const report = await analyzeIdea(sampleIdea);
  assert.ok(report);
  assert.ok(typeof report.score === "number");
  assert.ok(report.score >= 0 && report.score <= 100);
  assert.ok(["GO", "IMPROVE", "AVOID"].includes(report.verdict));

  const { metrics } = report;
  assert.ok(metrics.marketDemand >= 0 && metrics.marketDemand <= 100);
  assert.ok(metrics.competition >= 0 && metrics.competition <= 100);
  assert.ok(metrics.feasibility >= 0 && metrics.feasibility <= 100);
  assert.ok(metrics.financial >= 0 && metrics.financial <= 100);
  assert.ok(metrics.risk >= 0 && metrics.risk <= 100);

  const expectedScore = Math.round(
    metrics.marketDemand * 0.3 +
    metrics.competition * 0.15 +
    metrics.feasibility * 0.2 +
    metrics.financial * 0.2 +
    metrics.risk * 0.15
  );
  assert.equal(report.score, expectedScore);

  const expectedVerdict = expectedScore >= 70 ? "GO" : expectedScore >= 50 ? "IMPROVE" : "AVOID";
  assert.equal(report.verdict, expectedVerdict);

  assert.ok(Array.isArray(report.swot.strengths));
  assert.ok(Array.isArray(report.swot.weaknesses));
  assert.ok(Array.isArray(report.swot.opportunities));
  assert.ok(Array.isArray(report.swot.threats));
  assert.ok(Array.isArray(report.targetCustomers));
  assert.ok(Array.isArray(report.competitors));
  assert.ok(Array.isArray(report.risks));
  assert.ok(Array.isArray(report.recommendations));
});

test("Error Middleware - notFound returns 404", () => {
  const req = { originalUrl: "/api/unknown-endpoint" };
  let statusCode = 200;
  let jsonResult = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(obj) {
      jsonResult = obj;
      return this;
    },
  };

  notFound(req, res);
  assert.equal(statusCode, 404);
  assert.equal(jsonResult.message, "Route not found: /api/unknown-endpoint");
});

test("Error Middleware - errorHandler formats errors", () => {
  let statusCode = 200;
  let jsonResult = null;
  const res = {
    statusCode: 200,
    status(code) {
      statusCode = code;
      return this;
    },
    json(obj) {
      jsonResult = obj;
      return this;
    },
  };

  // Test duplicate email error (code 11000)
  errorHandler({ code: 11000, message: "Duplicate" }, {}, res, () => {});
  assert.equal(statusCode, 400);
  assert.equal(jsonResult.message, "Email already registered");

  // Test invalid CastError
  errorHandler({ name: "CastError", message: "Cast failed" }, {}, res, () => {});
  assert.equal(statusCode, 400);
  assert.equal(jsonResult.message, "Invalid id");
});

test("Auth Middleware - authorize enforces role checks", () => {
  const authAdmin = authorize(ROLES.ADMIN, ROLES.SUPERADMIN);

  let nextCalled = false;
  let deniedStatus = null;
  let deniedMessage = null;

  const mockRes = {
    status(code) {
      deniedStatus = code;
      return this;
    },
    json(obj) {
      deniedMessage = obj.message;
      return this;
    },
  };

  // Allowed role
  authAdmin({ user: { role: ROLES.ADMIN } }, mockRes, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);

  // Denied role
  nextCalled = false;
  authAdmin({ user: { role: ROLES.ENTREPRENEUR } }, mockRes, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(deniedStatus, 403);
  assert.equal(deniedMessage, "You do not have permission for this action");
});

test("Express Routers - auth, idea, and admin routes are defined and mountable", () => {
  assert.ok(authRoutes);
  assert.ok(typeof authRoutes === "function");
  assert.ok(authRoutes.stack && authRoutes.stack.length > 0);

  assert.ok(ideaRoutes);
  assert.ok(typeof ideaRoutes === "function");
  assert.ok(ideaRoutes.stack && ideaRoutes.stack.length > 0);

  assert.ok(adminRoutes);
  assert.ok(typeof adminRoutes === "function");
  assert.ok(adminRoutes.stack && adminRoutes.stack.length > 0);
});
