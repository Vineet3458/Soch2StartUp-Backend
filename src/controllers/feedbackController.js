import Feedback from "../models/Feedback.js";
import Idea from "../models/Idea.js";
import Assignment from "../models/Assignment.js";
import { ROLES, ADMIN_ROLES } from "../config/roles.js";
import { hasPermission } from "../services/configService.js";
import { audit } from "../services/logger.js";
import { notify } from "../services/notify.js";
import { emit } from "../services/realtime.js";
import { httpError, str, needId } from "../utils.js";

const CRITERIA = ["problem", "market", "innovation", "execution", "scalability", "team"];
const cleanCriteria = (c = {}) => Object.fromEntries(CRITERIA.map((k) => [k, Math.max(0, Math.min(10, Number(c[k]) || 0))]));
const overall = (c) => Math.round((CRITERIA.reduce((s, k) => s + c[k], 0) / CRITERIA.length) * 10);

export const addFeedback = async (req, res) => {
  const idea = await Idea.findById(needId(req.params.id));
  if (!idea || idea.status === "draft") throw httpError(404, "Idea not found");
  const comment = str(req.body.comment, 3000);
  if (!comment) throw httpError(400, "Comment is required");
  const isAdmin = ADMIN_ROLES.includes(req.user.role);
  const kind = req.body.kind === "evaluation" ? "evaluation" : req.user.role === ROLES.EXPERT ? "evaluation" : "guidance";
  let assignment = null;
  if (!isAdmin) {
    const needKind = kind === "evaluation" ? "evaluation" : "mentor";
    assignment = await Assignment.findOne({ idea: idea._id, assignee: req.user._id, kind: needKind });
    if (!assignment) throw httpError(403, `You are not assigned to this idea. Claim it first or ask an admin to assign you.`);
  }
  const doc = { idea: idea._id, author: req.user._id, authorName: req.user.name, authorRole: req.user.role, kind, comment, tags: [].concat(req.body.tags || []).map((t) => str(t, 24)).filter(Boolean).slice(0, 6) };
  if (kind === "evaluation") {
    doc.criteria = cleanCriteria(req.body.criteria);
    doc.score = overall(doc.criteria);
    doc.recommendation = ["strong_yes", "yes", "maybe", "no"].includes(req.body.recommendation) ? req.body.recommendation : "maybe";
  }
  const fb = await Feedback.create(doc);
  if (assignment) {
    assignment.stage = kind === "evaluation" ? "completed" : assignment.stage === "assigned" ? "in_progress" : assignment.stage;
    if (kind === "evaluation") { assignment.completedAt = new Date(); assignment.reEval = false; }
    await assignment.save();
    emit("assignments", "update", assignment._id);
  }
  audit(req.user, kind === "evaluation" ? "feedback.evaluated" : "feedback.guidance", idea.title, doc.score != null ? `Score ${doc.score}` : "");
  notify(idea.user, { type: "feedback", title: kind === "evaluation" ? `New evaluation (${doc.score}/100)` : "New mentor guidance", message: `${req.user.name} on "${idea.title}"`, link: `/app/ideas/${idea._id}` });
  emit("feedback", "create", fb._id); emit("ideas", "update", idea._id);
  res.status(201).json(fb);
};

export const listFeedback = async (req, res) => {
  const { kind, disputed } = req.query;
  const filter = { status: "published" };
  if (kind) filter.kind = kind;
  const admin = ADMIN_ROLES.includes(req.user.role);
  if (disputed === "true") {
    filter["dispute.status"] = { $in: ["open", "resolved"] };
    if (!admin) {
      const own = (await Idea.find({ user: req.user._id }).select("_id")).map((i) => i._id);
      filter.$or = [{ author: req.user._id }, { idea: { $in: own } }];
    }
  } else if (!admin || req.query.mine === "true") filter.author = req.user._id;
  const rows = await Feedback.find(filter).populate({ path: "idea", select: "title industry report.score user", populate: { path: "user", select: "name" } }).sort("-createdAt").limit(500);
  res.json(rows.filter((r) => r.idea));
};

export const updateFeedback = async (req, res) => {
  const fb = await Feedback.findById(needId(req.params.id));
  if (!fb || fb.status === "removed") throw httpError(404, "Feedback not found");
  if (String(fb.author) !== String(req.user._id) && !ADMIN_ROLES.includes(req.user.role)) throw httpError(403, "You can only edit your own feedback");
  if (req.body.comment !== undefined) { fb.comment = str(req.body.comment, 3000); if (!fb.comment) throw httpError(400, "Comment is required"); }
  if (req.body.tags !== undefined) fb.tags = [].concat(req.body.tags).map((t) => str(t, 24)).filter(Boolean).slice(0, 6);
  if (fb.kind === "evaluation" && req.body.criteria) { fb.criteria = cleanCriteria(req.body.criteria); fb.score = overall(fb.criteria); }
  if (fb.kind === "evaluation" && req.body.recommendation) fb.recommendation = req.body.recommendation;
  await fb.save();
  audit(req.user, "feedback.updated", String(fb.idea));
  emit("feedback", "update", fb._id); emit("ideas", "update", fb.idea);
  res.json(fb);
};

export const removeFeedback = async (req, res) => {
  const fb = await Feedback.findById(needId(req.params.id));
  if (!fb) throw httpError(404, "Feedback not found");
  if (String(fb.author) !== String(req.user._id) && !hasPermission(req.user.role, "reports.moderate")) throw httpError(403, "You cannot remove this feedback");
  fb.status = "removed";
  await fb.save();
  audit(req.user, "feedback.removed", String(fb.idea));
  emit("feedback", "delete", fb._id); emit("ideas", "update", fb.idea);
  res.json({ message: "Feedback removed" });
};

// Founder disputes an evaluation -> evaluator is asked to re-evaluate
export const openDispute = async (req, res) => {
  const fb = await Feedback.findById(needId(req.params.id)).populate("idea", "title user");
  if (!fb || fb.kind !== "evaluation" || fb.status !== "published") throw httpError(404, "Evaluation not found");
  const owner = String(fb.idea.user) === String(req.user._id);
  if (!owner && !ADMIN_ROLES.includes(req.user.role)) throw httpError(403, "Only the idea owner can dispute an evaluation");
  if (fb.dispute?.status === "open") throw httpError(400, "This evaluation is already disputed");
  const reason = str(req.body.reason, 500);
  if (reason.length < 10) throw httpError(400, "Please explain your dispute (at least 10 characters)");
  fb.dispute = { status: "open", by: req.user._id, reason, at: new Date() };
  await fb.save();
  const a = await Assignment.findOneAndUpdate({ idea: fb.idea._id, assignee: fb.author, kind: "evaluation" }, { reEval: true, stage: "assigned" }, { new: true });
  audit(req.user, "feedback.disputed", fb.idea.title, reason);
  notify(fb.author, { type: "warning", title: "Your evaluation was disputed", message: `"${fb.idea.title}": ${reason}`, link: "/app/disputes" });
  emit("feedback", "update", fb._id); if (a) emit("assignments", "update", a._id);
  res.json(fb);
};

export const resolveDispute = async (req, res) => {
  const fb = await Feedback.findById(needId(req.params.id)).populate("idea", "title user");
  if (!fb || fb.dispute?.status !== "open") throw httpError(404, "No open dispute found");
  if (String(fb.author) !== String(req.user._id) && !ADMIN_ROLES.includes(req.user.role)) throw httpError(403, "Only the evaluator can respond");
  const response = str(req.body.response, 800);
  if (!response) throw httpError(400, "Please provide a response");
  if (req.body.criteria) { fb.criteria = cleanCriteria(req.body.criteria); fb.score = overall(fb.criteria); }
  fb.dispute.status = "resolved"; fb.dispute.response = response;
  await fb.save();
  const a = await Assignment.findOneAndUpdate({ idea: fb.idea._id, assignee: fb.author, kind: "evaluation" }, { reEval: false, stage: "completed", completedAt: new Date() }, { new: true });
  audit(req.user, "feedback.dispute_resolved", fb.idea.title);
  notify(fb.idea.user, { type: "success", title: "Your dispute was answered", message: `"${fb.idea.title}": ${response}`, link: `/app/ideas/${fb.idea._id}` });
  emit("feedback", "update", fb._id); if (a) emit("assignments", "update", a._id);
  res.json(fb);
};
