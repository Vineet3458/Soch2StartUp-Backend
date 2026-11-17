import Assignment from "../models/Assignment.js";
import { ADMIN_ROLES } from "../config/roles.js";
import { hasPermission } from "../services/configService.js";
import { audit } from "../services/logger.js";
import { notify } from "../services/notify.js";
import { emit } from "../services/realtime.js";
import { httpError, str, needId } from "../utils.js";

const POP = [{ path: "idea", select: "title industry status report.score report.verdict user createdAt", populate: { path: "user", select: "name email" } }, { path: "assignee", select: "name role email" }];

export const listAssignments = async (req, res) => {
  const { kind, stage } = req.query;
  const filter = {};
  const all = ADMIN_ROLES.includes(req.user.role) && req.query.mine !== "true";
  if (!all) filter.assignee = req.user._id;
  if (kind) filter.kind = kind;
  if (stage) filter.stage = stage;
  if (req.query.reEval === "true") filter.reEval = true;
  const rows = await Assignment.find(filter).populate(POP).sort("-updatedAt").limit(500);
  res.json(rows.filter((r) => r.idea)); // skip orphans
};

export const updateAssignment = async (req, res) => {
  const a = await Assignment.findById(needId(req.params.id)).populate("idea", "title user");
  if (!a) throw httpError(404, "Assignment not found");
  const mine = String(a.assignee) === String(req.user._id);
  if (!mine && !hasPermission(req.user.role, "ideas.assign")) throw httpError(403, "Not your assignment");
  const { stage, note, dueDate } = req.body;
  if (stage) {
    if (!["assigned", "in_progress", "completed", "archived"].includes(stage)) throw httpError(400, "Invalid stage");
    a.stage = stage;
    a.completedAt = stage === "completed" ? new Date() : undefined;
    if (stage === "completed") a.reEval = false;
  }
  if (note !== undefined) a.note = str(note, 400);
  if (dueDate !== undefined) a.dueDate = dueDate || undefined;
  await a.save();
  if (stage === "in_progress" && a.kind === "mentor") notify(a.idea.user, { type: "info", title: "Mentoring has started", message: `Your mentor began working on "${a.idea.title}".`, link: `/app/ideas/${a.idea._id}` });
  if (stage === "completed" && a.kind === "mentor") notify(a.idea.user, { type: "success", title: "Mentoring completed", message: `Your mentor marked "${a.idea.title}" as completed.`, link: `/app/ideas/${a.idea._id}` });
  audit(req.user, "assignment.updated", a.idea.title, `${a.kind} -> ${a.stage}`);
  emit("assignments", "update", a._id);
  res.json(a);
};

export const requestReEval = async (req, res) => {
  const a = await Assignment.findById(needId(req.params.id)).populate("idea", "title");
  if (!a || a.kind !== "evaluation") throw httpError(404, "Evaluation assignment not found");
  a.reEval = true; a.stage = "assigned"; a.note = str(req.body.note, 400) || a.note;
  await a.save();
  audit(req.user, "assignment.re_eval", a.idea.title);
  notify(a.assignee, { type: "warning", title: "Re-evaluation requested", message: `Please re-evaluate "${a.idea.title}".`, link: "/app/evaluations?f=re" });
  emit("assignments", "update", a._id);
  res.json(a);
};

export const deleteAssignment = async (req, res) => {
  const a = await Assignment.findByIdAndDelete(needId(req.params.id));
  if (!a) throw httpError(404, "Assignment not found");
  audit(req.user, "assignment.removed", String(a.idea), a.kind);
  emit("assignments", "delete", a._id); emit("ideas", "update", a.idea);
  res.json({ message: "Assignment removed" });
};
