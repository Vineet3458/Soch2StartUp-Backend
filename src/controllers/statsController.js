import mongoose from "mongoose";
import User from "../models/User.js";
import Idea from "../models/Idea.js";
import Assignment from "../models/Assignment.js";
import Feedback from "../models/Feedback.js";
import Session from "../models/Session.js";
import Report from "../models/Report.js";
import Request from "../models/Request.js";
import { ROLES } from "../config/roles.js";
import { hasPermission } from "../services/configService.js";

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
const lastDays = (n) => Array.from({ length: n }, (_, i) => dayKey(Date.now() - (n - 1 - i) * 86400000));
const countBy = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

const industryStats = (ideas) => {
  const by = {};
  for (const i of ideas) {
    const g = (by[i.industry] ||= { name: i.industry, count: 0, scores: [], go: 0 });
    g.count++; if (i.report?.score != null) g.scores.push(i.report.score); if (i.report?.verdict === "GO") g.go++;
  }
  return Object.values(by).map((g) => ({ name: g.name, count: g.count, avgScore: avg(g.scores), goRate: g.count ? Math.round((g.go / g.count) * 100) : 0 })).sort((a, b) => b.count - a.count);
};

// Anonymised platform-wide insight - available to every logged-in user (Market Insights)
export const marketStats = async (req, res) => {
  const ideas = await Idea.find({ status: { $ne: "draft" }, report: { $exists: true } }).select("industry createdAt report").lean();
  const scores = ideas.map((i) => i.report.score);
  const comp = {};
  for (const i of ideas) for (const c of i.report.competitors || []) comp[c] = (comp[c] || 0) + 1;
  const recent = ideas.filter((i) => Date.now() - new Date(i.createdAt) < 30 * 86400000);
  res.json({
    total: ideas.length,
    avgScore: avg(scores),
    industries: industryStats(ideas),
    distribution: [["0–39", 0, 39], ["40–59", 40, 59], ["60–79", 60, 79], ["80–100", 80, 100]].map(([label, lo, hi]) => ({ label, count: scores.filter((s) => s >= lo && s <= hi).length })),
    topCompetitors: Object.entries(comp).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })),
    trending: Object.entries(countBy(recent, (i) => i.industry)).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
    metricAverages: ["marketDemand", "competition", "feasibility", "financial", "risk"].map((k) => ({ key: k, value: avg(ideas.map((i) => i.report.metrics?.[k] || 0)) })),
  });
};

export const adminStats = async (req, res) => {
  const [users, ideas, feedbackN, sessions, assignments, openReports, pendingRequests] = await Promise.all([
    User.find().select("role isActive verified createdAt name").lean(),
    Idea.find().select("status industry createdAt title report user").lean(),
    Feedback.countDocuments({ status: "published" }),
    Session.find().select("status scheduledAt").lean(),
    Assignment.find().select("kind stage assignee").lean(),
    Report.countDocuments({ status: "open" }),
    Request.countDocuments({ status: "pending" }),
  ]);
  const submitted = ideas.filter((i) => i.status !== "draft");
  const withReport = submitted.filter((i) => i.report);
  const days = lastDays(14);
  const signup = countBy(users, (u) => dayKey(u.createdAt)), sub = countBy(submitted, (i) => dayKey(i.createdAt));
  const byId = Object.fromEntries(users.map((u) => [String(u._id), u]));
  const load = {};
  for (const a of assignments) if (["assigned", "in_progress"].includes(a.stage)) load[a.assignee] = (load[a.assignee] || 0) + 1;
  res.json({
    totals: { users: users.length, ideas: submitted.length, drafts: ideas.length - submitted.length, feedback: feedbackN, sessions: sessions.length, assignments: assignments.length },
    usersByRole: countBy(users, (u) => u.role),
    usersByStatus: { active: users.filter((u) => u.isActive && u.verified).length, pending: users.filter((u) => u.isActive && !u.verified).length, blocked: users.filter((u) => !u.isActive).length },
    ideasByStatus: countBy(submitted, (i) => i.status),
    verdicts: countBy(withReport, (i) => i.report.verdict),
    industries: industryStats(submitted),
    avgScore: avg(withReport.map((i) => i.report.score)),
    signups: days.map((d) => ({ date: d, count: signup[d] || 0 })),
    submissions: days.map((d) => ({ date: d, count: sub[d] || 0 })),
    topIdeas: [...withReport].sort((a, b) => b.report.score - a.report.score).slice(0, 5).map((i) => ({ _id: i._id, title: i.title, industry: i.industry, score: i.report.score, verdict: i.report.verdict })),
    sessions: { upcoming: sessions.filter((s) => s.status === "scheduled" && new Date(s.scheduledAt) > new Date()).length, completed: sessions.filter((s) => s.status === "completed").length },
    assignmentsByStage: countBy(assignments, (a) => a.stage),
    workload: Object.entries(load).map(([id, n]) => ({ name: byId[id]?.name || "Unknown", role: byId[id]?.role, active: n })).sort((a, b) => b.active - a.active).slice(0, 8),
    openReports, pendingRequests,
  });
};

// Small live counters shown as sidebar badges
export const badges = async (req, res) => {
  const role = req.user.role;
  const b = {};
  if (hasPermission(role, "ideas.review")) b.review = await Idea.countDocuments({ status: { $in: ["submitted", "under_review"] } });
  if (hasPermission(role, "users.manage")) b.pending = await User.countDocuments({ verified: false, isActive: true });
  if (hasPermission(role, "ideas.assign") || hasPermission(role, "roles.change")) b.requests = await Request.countDocuments({ status: "pending" });
  if (hasPermission(role, "reports.moderate")) b.reports = await Report.countDocuments({ status: "open" });
  if (role === ROLES.MENTOR) b.assignments = await Assignment.countDocuments({ assignee: req.user._id, kind: "mentor", stage: "assigned" });
  if (role === ROLES.EXPERT) b.evaluations = await Assignment.countDocuments({ assignee: req.user._id, kind: "evaluation", stage: "assigned" });
  if (role === ROLES.ENTREPRENEUR) b.changes = await Idea.countDocuments({ user: req.user._id, status: "changes_requested" });
  if (role === ROLES.EXPERT) b.disputes = await Feedback.countDocuments({ author: req.user._id, "dispute.status": "open" });
  res.json(b);
};

export const publicStats = async () => {
  const [users, ideas, mentors, scored] = await Promise.all([
    User.countDocuments({ isActive: true }),
    Idea.countDocuments({ status: { $ne: "draft" } }),
    User.countDocuments({ role: { $in: [ROLES.MENTOR, ROLES.EXPERT] }, isActive: true, verified: true }),
    Idea.find({ status: { $ne: "draft" }, report: { $exists: true } }).select("report.score").lean(),
  ]);
  return { users, ideas, mentors, avgScore: avg(scored.map((i) => i.report.score)) };
};

export const dbPing = async () => {
  const t0 = Date.now();
  try { await mongoose.connection.db.admin().ping(); return { ok: true, ms: Date.now() - t0 }; } catch { return { ok: false, ms: Date.now() - t0 }; }
};
