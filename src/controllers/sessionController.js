import Session from "../models/Session.js";
import Idea from "../models/Idea.js";
import Assignment from "../models/Assignment.js";
import { ADMIN_ROLES } from "../config/roles.js";
import { audit } from "../services/logger.js";
import { notify } from "../services/notify.js";
import { emit } from "../services/realtime.js";
import { httpError, str, needId } from "../utils.js";

const POP = [{ path: "idea", select: "title industry" }, { path: "mentor", select: "name" }, { path: "founder", select: "name email" }];

export const listSessions = async (req, res) => {
  const admin = ADMIN_ROLES.includes(req.user.role);
  const filter = admin ? {} : { $or: [{ mentor: req.user._id }, { founder: req.user._id }] };
  const rows = await Session.find(filter).populate(POP).sort("scheduledAt").limit(500);
  res.json(rows.filter((s) => s.idea));
};

export const createSession = async (req, res) => {
  const idea = await Idea.findById(needId(req.body.idea, "idea id"));
  if (!idea || idea.status === "draft") throw httpError(404, "Idea not found");
  const admin = ADMIN_ROLES.includes(req.user.role);
  if (!admin && !(await Assignment.findOne({ idea: idea._id, assignee: req.user._id, kind: "mentor" }))) throw httpError(403, "You can only schedule sessions for ideas you mentor");
  const when = new Date(req.body.scheduledAt);
  if (isNaN(when)) throw httpError(400, "Please choose a valid date and time");
  if (when < new Date(Date.now() - 60000)) throw httpError(400, "Choose a time in the future");
  const mentorId = admin && req.body.mentor ? needId(req.body.mentor, "mentor id") : req.user._id;
  const s = await Session.create({
    idea: idea._id, mentor: mentorId, founder: idea.user, title: str(req.body.title, 120) || `Mentoring: ${idea.title}`,
    agenda: str(req.body.agenda, 1000), mode: ["video", "call", "in_person"].includes(req.body.mode) ? req.body.mode : "video",
    link: str(req.body.link, 300), scheduledAt: when, durationMin: Number(req.body.durationMin) || 45,
  });
  audit(req.user, "session.scheduled", idea.title, when.toISOString());
  notify(idea.user, { type: "session", title: "Mentoring session scheduled", message: `${req.user.name} · ${when.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`, link: `/app/ideas/${idea._id}` });
  emit("sessions", "create", s._id);
  res.status(201).json(s);
};

export const updateSession = async (req, res) => {
  const s = await Session.findById(needId(req.params.id)).populate("idea", "title");
  if (!s) throw httpError(404, "Session not found");
  if (String(s.mentor) !== String(req.user._id) && !ADMIN_ROLES.includes(req.user.role)) throw httpError(403, "Only the mentor can change this session");
  const b = req.body;
  if (b.status && ["scheduled", "completed", "cancelled"].includes(b.status)) s.status = b.status;
  if (b.notes !== undefined) s.notes = str(b.notes, 2000);
  if (b.title) s.title = str(b.title, 120);
  if (b.agenda !== undefined) s.agenda = str(b.agenda, 1000);
  if (b.link !== undefined) s.link = str(b.link, 300);
  if (b.scheduledAt) { const d = new Date(b.scheduledAt); if (!isNaN(d)) s.scheduledAt = d; }
  await s.save();
  if (b.status === "cancelled") notify(s.founder, { type: "warning", title: "Session cancelled", message: `"${s.title}" was cancelled by your mentor.`, link: `/app/ideas/${s.idea._id}` });
  audit(req.user, "session.updated", s.idea.title, s.status);
  emit("sessions", "update", s._id);
  res.json(s);
};

export const deleteSession = async (req, res) => {
  const s = await Session.findById(needId(req.params.id));
  if (!s) throw httpError(404, "Session not found");
  if (String(s.mentor) !== String(req.user._id) && !ADMIN_ROLES.includes(req.user.role)) throw httpError(403, "Only the mentor can delete this session");
  await s.deleteOne();
  emit("sessions", "delete", s._id);
  res.json({ message: "Session deleted" });
};
