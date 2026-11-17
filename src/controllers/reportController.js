import Report from "../models/Report.js";
import Idea from "../models/Idea.js";
import Feedback from "../models/Feedback.js";
import User from "../models/User.js";
import { ROLES, ADMIN_ROLES } from "../config/roles.js";
import { hasPermission } from "../services/configService.js";
import { audit } from "../services/logger.js";
import { notify } from "../services/notify.js";
import { emit } from "../services/realtime.js";
import { httpError, str, needId } from "../utils.js";

export const createReport = async (req, res) => {
  const { targetType } = req.body;
  if (!["idea", "feedback", "user"].includes(targetType)) throw httpError(400, "Invalid target type");
  const target = needId(req.body.target, "target");
  let idea;
  if (targetType === "idea") { const i = await Idea.findById(target); if (!i) throw httpError(404, "Idea not found"); idea = i._id; if (String(i.user) === String(req.user._id)) throw httpError(400, "You cannot report your own idea"); }
  if (targetType === "feedback") { const f = await Feedback.findById(target); if (!f) throw httpError(404, "Feedback not found"); idea = f.idea; }
  if (targetType === "user") { if (!(await User.exists({ _id: target }))) throw httpError(404, "User not found"); if (String(target) === String(req.user._id)) throw httpError(400, "You cannot report yourself"); }
  const reason = str(req.body.reason, 120);
  if (!reason) throw httpError(400, "Please select a reason");
  if (await Report.findOne({ targetType, target, reporter: req.user._id, status: "open" })) throw httpError(400, "You already reported this");
  const r = await Report.create({ targetType, target, idea, reporter: req.user._id, reason, details: str(req.body.details, 1000) });
  if (targetType === "idea") await Idea.updateOne({ _id: target }, { flagged: true });
  audit(req.user, "report.created", `${targetType}:${target}`, reason);
  const mods = (await User.find({ role: { $in: [ROLES.MODERATOR, ...ADMIN_ROLES] }, isActive: true }).select("_id role")).filter((u) => hasPermission(u.role, "reports.moderate"));
  notify(mods.map((m) => m._id), { type: "warning", title: "New content report", message: `${targetType} reported: ${reason}`, link: `/app/mod-${targetType === "idea" ? "ideas" : targetType === "feedback" ? "feedback" : "users"}` });
  emit("reports", "create", r._id); emit("ideas", "update", idea);
  res.status(201).json(r);
};

export const listReports = async (req, res) => {
  const { targetType, status } = req.query;
  const filter = {};
  if (targetType) filter.targetType = targetType;
  if (status) filter.status = status;
  const rows = await Report.find(filter).populate("reporter", "name role").populate("resolvedBy", "name").populate("idea", "title status flagged").sort("-createdAt").limit(300);
  // attach a readable snapshot of what was reported
  const out = [];
  for (const r of rows) {
    const o = r.toJSON();
    if (r.targetType === "idea") o.targetInfo = await Idea.findById(r.target).select("title industry status user report.score").populate("user", "name");
    if (r.targetType === "feedback") o.targetInfo = await Feedback.findById(r.target).select("comment authorName authorRole kind status");
    if (r.targetType === "user") o.targetInfo = await User.findById(r.target).select("name email role isActive");
    out.push(o);
  }
  res.json(out);
};

export const resolveReport = async (req, res) => {
  const r = await Report.findById(needId(req.params.id));
  if (!r || r.status !== "open") throw httpError(404, "Open report not found");
  const action = req.body.action || "dismiss";
  const note = str(req.body.note, 400);
  if (action === "dismiss") r.status = "dismissed";
  else {
    r.status = "resolved";
    if (r.targetType === "idea") {
      const idea = await Idea.findById(r.target);
      if (idea && action === "remove") { idea.status = "archived"; idea.reviewNote = note || "Removed by moderation"; await idea.save(); notify(idea.user, { type: "warning", title: "Your idea was removed by moderation", message: note || `"${idea.title}" violated community guidelines.`, link: `/app/ideas/${idea._id}` }); }
      if (idea && action === "changes") { idea.status = "changes_requested"; idea.reviewNote = note || "Moderator requested changes"; await idea.save(); notify(idea.user, { type: "idea", title: "Moderator requested changes", message: note, link: `/app/ideas/${idea._id}` }); }
    }
    if (r.targetType === "feedback" && action === "remove") {
      const f = await Feedback.findByIdAndUpdate(r.target, { status: "removed" });
      if (f) { notify(f.author, { type: "warning", title: "Your feedback was removed", message: note || "It violated community guidelines." }); emit("feedback", "delete", f._id); }
    }
    if (r.targetType === "user") {
      if (action === "warn") notify(r.target, { type: "warning", title: "Community guidelines warning", message: note || "Please review the community guidelines." , link: "/app/resources?kind=guideline" });
      if (action === "block") {
        if (!hasPermission(req.user.role, "users.manage")) throw httpError(403, "You do not have permission to block users");
        const u = await User.findById(r.target);
        if (u && !ADMIN_ROLES.includes(u.role)) { u.isActive = false; u.blockedReason = note || "Blocked after moderation review"; await u.save(); emit("users", "update", u._id); }
      }
    }
  }
  r.resolution = note || action; r.resolvedBy = req.user._id; r.resolvedAt = new Date();
  await r.save();
  if (r.targetType === "idea") { const open = await Report.countDocuments({ targetType: "idea", target: r.target, status: "open" }); await Idea.updateOne({ _id: r.target }, { flagged: open > 0 }); emit("ideas", "update", r.target); }
  audit(req.user, `report.${action}`, `${r.targetType}:${r.target}`, note);
  notify(r.reporter, { type: "info", title: "Your report was reviewed", message: action === "dismiss" ? "No action was needed." : "Action was taken. Thank you for keeping the community safe." });
  emit("reports", "update", r._id);
  res.json(r);
};
