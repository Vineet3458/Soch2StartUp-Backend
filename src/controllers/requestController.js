import Request from "../models/Request.js";
import User from "../models/User.js";
import Assignment from "../models/Assignment.js";
import Idea from "../models/Idea.js";
import { ROLES, ADMIN_ROLES } from "../config/roles.js";
import { hasPermission } from "../services/configService.js";
import { audit } from "../services/logger.js";
import { notify } from "../services/notify.js";
import { emit } from "../services/realtime.js";
import { httpError, str, needId } from "../utils.js";

export const listRequests = async (req, res) => {
  const admin = hasPermission(req.user.role, "ideas.assign") || hasPermission(req.user.role, "roles.change");
  const filter = admin ? {} : { requester: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;
  const rows = await Request.find(filter).populate("requester", "name email role").populate("idea", "title industry status report.score").populate("decidedBy", "name").sort("-createdAt").limit(300);
  res.json(rows);
};

export const requestRoleChange = async (req, res) => {
  const requestedRole = req.body.requestedRole;
  if (![ROLES.ENTREPRENEUR, ROLES.MENTOR, ROLES.EXPERT].includes(requestedRole)) throw httpError(400, "You can only request entrepreneur, mentor or industry expert");
  if (requestedRole === req.user.role) throw httpError(400, "You already have that role");
  if (await Request.findOne({ requester: req.user._id, type: "role_change", status: "pending" })) throw httpError(400, "You already have a pending role request");
  const r = await Request.create({ type: "role_change", requester: req.user._id, requestedRole, note: str(req.body.note, 600) });
  audit(req.user, "request.role_change", req.user.email, requestedRole);
  const admins = (await User.find({ role: { $in: ADMIN_ROLES }, isActive: true }).select("_id role")).filter((u) => hasPermission(u.role, "roles.change"));
  notify(admins.map((a) => a._id), { type: "warning", title: "Role change requested", message: `${req.user.name} → ${requestedRole.replace("_", " ")}`, link: "/app/requests" });
  emit("requests", "create", r._id);
  res.status(201).json(r);
};

export const decideRequest = async (req, res) => {
  const r = await Request.findById(needId(req.params.id)).populate("idea", "title user").populate("requester", "name role");
  if (!r || r.status !== "pending") throw httpError(404, "Pending request not found");
  const approve = req.body.decision === "approve";
  const note = str(req.body.note, 400);
  if (r.type === "mentor_request") {
    if (!hasPermission(req.user.role, "ideas.assign")) throw httpError(403, "You cannot assign mentors");
    if (approve) {
      const mentor = await User.findById(needId(req.body.mentorId, "mentor id"));
      if (!mentor || mentor.role !== ROLES.MENTOR || !mentor.isActive || !mentor.verified) throw httpError(400, "Choose an active, verified mentor");
      const a = await Assignment.findOneAndUpdate({ idea: r.idea._id, assignee: mentor._id, kind: "mentor" }, { $setOnInsert: { stage: "assigned" }, assignedBy: req.user._id }, { upsert: true, new: true });
      notify(mentor._id, { type: "idea", title: "New mentoring assignment", message: `"${r.idea.title}"`, link: "/app/assignments" });
      notify(r.requester._id, { type: "success", title: "Mentor request approved", message: `${mentor.name} will mentor "${r.idea.title}".`, link: `/app/ideas/${r.idea._id}` });
      emit("assignments", "create", a._id);
    } else notify(r.requester._id, { type: "warning", title: "Mentor request declined", message: note || `"${r.idea.title}"`, link: `/app/ideas/${r.idea._id}` });
    emit("ideas", "update", r.idea._id);
  } else {
    if (!hasPermission(req.user.role, "roles.change")) throw httpError(403, "You cannot change roles");
    if (approve) {
      const u = await User.findById(r.requester._id);
      u.role = r.requestedRole;
      u.verified = r.requestedRole === ROLES.ENTREPRENEUR; // mentor/expert must be verified again
      await u.save();
      emit("users", "update", u._id);
    }
    notify(r.requester._id, { type: approve ? "success" : "warning", title: approve ? "Role change approved" : "Role change declined", message: approve ? `You are now a ${r.requestedRole.replace("_", " ")}.` : note, link: "/app" });
  }
  r.status = approve ? "approved" : "rejected"; r.decidedBy = req.user._id; r.decidedAt = new Date(); r.decisionNote = note;
  await r.save();
  audit(req.user, `request.${r.status}`, r.type, r.requester.name);
  emit("requests", "update", r._id);
  res.json(r);
};
