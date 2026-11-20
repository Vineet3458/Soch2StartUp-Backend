import User from "../models/User.js";
import Idea from "../models/Idea.js";
import Assignment from "../models/Assignment.js";
import { ROLES, ADMIN_ROLES } from "../config/roles.js";
import { audit } from "../services/logger.js";
import { notify } from "../services/notify.js";
import { emit } from "../services/realtime.js";
import { httpError, escapeRegex, str, needId } from "../utils.js";
import { validatePasswordStrength, deleteMe } from "./authController.js";
export { deleteMe };

// Admins may not touch admin/superadmin accounts - only a superadmin can
const guardTarget = (actor, target) => {
  if (actor.role !== ROLES.SUPERADMIN && ADMIN_ROLES.includes(target.role)) throw httpError(403, "Only a superadmin can modify admin accounts");
  if (String(actor._id) === String(target._id)) throw httpError(400, "You cannot perform this action on your own account");
};

export const listUsers = async (req, res) => {
  const { q, role, status } = req.query;
  const filter = {};
  if (role && Object.values(ROLES).includes(role)) filter.role = role;
  if (status === "blocked") filter.isActive = false;
  if (status === "pending") { filter.verified = false; filter.isActive = true; }
  if (status === "active") { filter.isActive = true; filter.verified = true; }
  if (q) { const rx = new RegExp(escapeRegex(q), "i"); filter.$or = [{ name: rx }, { email: rx }]; }
  const users = await User.find(filter).sort("-createdAt").limit(500);
  const ids = users.map((u) => u._id);
  const [ideaCounts, loads] = await Promise.all([
    Idea.aggregate([{ $match: { user: { $in: ids } } }, { $group: { _id: "$user", n: { $sum: 1 } } }]),
    Assignment.aggregate([{ $match: { assignee: { $in: ids }, stage: { $in: ["assigned", "in_progress"] } } }, { $group: { _id: "$assignee", n: { $sum: 1 } } }]),
  ]);
  const ic = Object.fromEntries(ideaCounts.map((x) => [String(x._id), x.n]));
  const ld = Object.fromEntries(loads.map((x) => [String(x._id), x.n]));
  res.json(users.map((u) => ({ ...u.toJSON(), ideaCount: ic[String(u._id)] || 0, activeAssignments: ld[String(u._id)] || 0 })));
};

// Any logged-in user: verified mentors & experts (for the Mentor Network)
export const directory = async (req, res) => {
  const users = await User.find({ role: { $in: [ROLES.MENTOR, ROLES.EXPERT] }, isActive: true, verified: true }).select("name role bio company expertise location");
  res.json(users);
};

export const createUser = async (req, res) => {
  const name = str(req.body.name, 80), email = str(req.body.email, 120).toLowerCase(), password = String(req.body.password || "");
  const role = Object.values(ROLES).includes(req.body.role) ? req.body.role : ROLES.ENTREPRENEUR;
  if (!name || !email) throw httpError(400, "Name and valid email are required");
  const pwErr = validatePasswordStrength(password);
  if (pwErr) throw httpError(400, pwErr);
  if (ADMIN_ROLES.includes(role) && req.user.role !== ROLES.SUPERADMIN) throw httpError(403, "Only a superadmin can create admin accounts");
  const user = await User.create({ name, email, password, role, verified: true });
  audit(req.user, "user.created", user.email, `Created ${role} account`);
  emit("users", "create", user._id);
  notify(user._id, { type: "success", title: "Welcome to Soch2Startup", message: "An administrator created your account.", link: "/app" });
  res.status(201).json(user);
};

export const setRole = async (req, res) => {
  const role = req.body.role;
  if (!Object.values(ROLES).includes(role)) throw httpError(400, "Invalid role");
  const user = await User.findById(needId(req.params.id));
  if (!user) throw httpError(404, "User not found");
  guardTarget(req.user, user);
  if (ADMIN_ROLES.includes(role) && req.user.role !== ROLES.SUPERADMIN) throw httpError(403, "Only a superadmin can grant admin roles");
  if (user.role === ROLES.SUPERADMIN && role !== ROLES.SUPERADMIN && (await User.countDocuments({ role: ROLES.SUPERADMIN, isActive: true })) <= 1) throw httpError(400, "There must be at least one active superadmin");
  const prev = user.role;
  user.role = role;
  await user.save();
  audit(req.user, "user.role_changed", user.email, `${prev} -> ${role}`);
  notify(user._id, { type: "info", title: "Your role was updated", message: `You are now a ${role.replace("_", " ")}.`, link: "/app" });
  emit("users", "update", user._id);
  res.json(user);
};

export const verifyUser = async (req, res) => {
  const user = await User.findById(needId(req.params.id));
  if (!user) throw httpError(404, "User not found");
  const approve = req.body.approve !== false;
  if (approve) {
    user.verified = true; await user.save();
    notify(user._id, { type: "success", title: "Account verified", message: "You can now start mentoring and evaluating startups.", link: "/app" });
    audit(req.user, "user.verified", user.email);
  } else {
    user.verified = false; user.isActive = false; user.blockedReason = str(req.body.reason, 200) || "Verification rejected"; await user.save();
    audit(req.user, "user.verification_rejected", user.email, user.blockedReason);
  }
  emit("users", "update", user._id);
  res.json(user);
};

export const blockUser = async (req, res) => {
  const user = await User.findById(needId(req.params.id));
  if (!user) throw httpError(404, "User not found");
  guardTarget(req.user, user);
  const block = req.body.block !== false;
  user.isActive = !block;
  user.blockedReason = block ? str(req.body.reason, 200) || "Violation of platform rules" : "";
  await user.save();
  audit(req.user, block ? "user.blocked" : "user.unblocked", user.email, user.blockedReason);
  emit("users", "update", user._id);
  res.json(user);
};

export const deleteUser = async (req, res) => {
  const user = await User.findById(needId(req.params.id));
  if (!user) throw httpError(404, "User not found");
  guardTarget(req.user, user);
  if (user.role === ROLES.SUPERADMIN) throw httpError(403, "A superadmin account cannot be deleted");
  const ideaIds = (await Idea.find({ user: user._id }).select("_id")).map((i) => i._id);
  await Promise.all([Idea.deleteMany({ user: user._id }), Assignment.deleteMany({ $or: [{ assignee: user._id }, { idea: { $in: ideaIds } }] }), user.deleteOne()]);
  audit(req.user, "user.deleted", user.email);
  emit("users", "delete", user._id); emit("ideas", "delete"); emit("assignments", "delete");
  res.json({ message: "User deleted" });
};
