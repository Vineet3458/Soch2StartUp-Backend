import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { ROLES, SELF_REGISTER_ROLES, VERIFY_ROLES, ADMIN_ROLES } from "../config/roles.js";
import { getConfig } from "../services/configService.js";
import { audit } from "../services/logger.js";
import { notify } from "../services/notify.js";
import { emit } from "../services/realtime.js";
import { httpError, pick, str } from "../utils.js";

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });

export const publicUser = (u) => ({
  id: u._id, name: u.name, email: u.email, role: u.role, status: u.status, verified: u.verified,
  bio: u.bio, company: u.company, location: u.location, expertise: u.expertise, prefs: u.prefs, createdAt: u.createdAt,
});

const sendAuth = (res, user, status = 200) => res.status(status).json({ token: signToken(user._id), user: publicUser(user) });

export const register = async (req, res) => {
  const platform = getConfig("platform");
  if (!platform.registrationOpen) throw httpError(403, "Registration is currently closed");
  const name = str(req.body.name, 80), email = str(req.body.email, 120).toLowerCase(), password = typeof req.body.password === "string" ? req.body.password : "";
  if (!name || !email || !password) throw httpError(400, "Name, email and password are required");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw httpError(400, "Please enter a valid email address");
  if (password.length < 6) throw httpError(400, "Password must be at least 6 characters");

  // Admin-level roles can never be self-assigned
  const role = SELF_REGISTER_ROLES.includes(req.body.role) ? req.body.role : ROLES.ENTREPRENEUR;
  const needsVerify = platform.requireVerification && VERIFY_ROLES.includes(role);
  const user = await User.create({ name, email, password, role, verified: !needsVerify, lastLoginAt: new Date() });

  audit(user, "user.registered", user.email, `New ${role} account`);
  emit("users", "create", user._id);
  const admins = await User.find({ role: { $in: ADMIN_ROLES }, isActive: true }).select("_id");
  notify(admins.map((a) => a._id), {
    type: needsVerify ? "warning" : "info",
    title: needsVerify ? "New verification request" : "New user joined",
    message: `${user.name} registered as ${role.replace("_", " ")}.`,
    link: needsVerify ? "/app/pending" : "/app/users",
  });
  sendAuth(res, user, 201);
};

export const login = async (req, res) => {
  const email = str(req.body.email, 120).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!email || !password) throw httpError(400, "Email and password are required");
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.matchPassword(password))) throw httpError(401, "Invalid email or password");
  if (!user.isActive) throw httpError(403, user.blockedReason ? `Your account is blocked: ${user.blockedReason}` : "Your account has been blocked");
  if (getConfig("platform").maintenance.enabled && !ADMIN_ROLES.includes(user.role)) {
    throw httpError(503, getConfig("platform").maintenance.message || "The platform is under maintenance");
  }
  user.lastLoginAt = new Date();
  await user.save();
  emit("users", "login", user._id);
  sendAuth(res, user);
};

export const getMe = (req, res) => {
  res.json({ user: publicUser(req.user) });
};

export const updateMe = async (req, res) => {
  const body = pick(req.body, ["name", "bio", "company", "location", "expertise", "prefs"]);
  if (body.name !== undefined) { body.name = str(body.name, 80); if (!body.name) throw httpError(400, "Name cannot be empty"); }
  for (const k of ["bio", "company", "location"]) if (body[k] !== undefined) body[k] = str(body[k], k === "bio" ? 500 : 80);
  if (body.expertise !== undefined) body.expertise = [].concat(body.expertise).map((x) => str(x, 30)).filter(Boolean).slice(0, 10);
  if (body.prefs) body.prefs = { ...req.user.prefs?.toObject?.(), ...pick(body.prefs, ["emailNotifications", "theme", "compact"]) };
  Object.assign(req.user, body);
  await req.user.save();
  emit("users", "update", req.user._id);
  res.json({ user: publicUser(req.user) });
};

export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (typeof newPassword !== "string" || newPassword.length < 6) throw httpError(400, "New password must be at least 6 characters");
  const user = await User.findById(req.user._id).select("+password");
  if (!(await user.matchPassword(String(currentPassword || "")))) throw httpError(400, "Current password is incorrect");
  user.password = newPassword;
  await user.save();
  audit(user, "user.password_changed", user.email);
  res.json({ message: "Password updated" });
};
