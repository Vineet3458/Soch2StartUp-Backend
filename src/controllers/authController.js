import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Idea from "../models/Idea.js";
import Assignment from "../models/Assignment.js";
import { ROLES, SELF_REGISTER_ROLES, VERIFY_ROLES, ADMIN_ROLES } from "../config/roles.js";
import { getConfig } from "../services/configService.js";
import { audit, syslog } from "../services/logger.js";
import { notify } from "../services/notify.js";
import { emit } from "../services/realtime.js";
import { httpError, pick, str } from "../utils.js";

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });

export const publicUser = (u) => ({
  id: u._id, name: u.name, email: u.email, role: u.role, status: u.status, verified: u.verified,
  isEmailVerified: Boolean(u.isEmailVerified),
  bio: u.bio, company: u.company, location: u.location, expertise: u.expertise, prefs: u.prefs, createdAt: u.createdAt,
});

const sendAuth = (res, user, status = 200) => res.status(status).json({ token: signToken(user._id), user: publicUser(user) });

const BREACHED_PASSWORDS = new Set([
  "password", "password12", "password123", "password1234", "password12345", "password@123", "pass@1234",
  "12345678", "123456789", "1234567890", "12345678a", "12345678b", "123456789a",
  "admin123", "admin1234", "admin12345", "admin123456", "admin@123", "admin@1234", "admin@12345", "administrator",
  "superadmin123", "superadmin@123", "superadmin@12345",
  "founder123", "founder@123", "founder@1234", "founder@12345",
  "mentor123", "mentor@123", "mentor@1234", "mentor@12345",
  "expert123", "expert@123", "expert@1234", "expert@12345",
  "moderator123", "moderator@123", "moderator@1234", "moderator@12345",
  "qwerty123", "qwertyuiop", "welcome123", "welcome@123", "welcome1234", "letmein123",
  "iloveyou123", "pass1234", "changeme123", "changeme@123", "soch2startup123", "startup123", "startup@123"
]);

export const validatePasswordStrength = (pw) => {
  if (typeof pw !== "string") return "Password is required";
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (pw.length > 128) return "Password cannot exceed 128 characters";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Password must contain at least one letter and one number";
  if (BREACHED_PASSWORDS.has(pw.toLowerCase().trim())) {
    return "This password is known to be compromised in data breaches. Please choose a more secure password.";
  }
  return null;
};

export const register = async (req, res) => {
  const platform = getConfig("platform");
  if (!platform.registrationOpen) throw httpError(403, "Registration is currently closed");
  const name = str(req.body.name, 80), email = str(req.body.email, 120).toLowerCase(), password = typeof req.body.password === "string" ? req.body.password : "";
  if (!name || !email || !password) throw httpError(400, "Name, email and password are required");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw httpError(400, "Please enter a valid email address");
  const pwErr = validatePasswordStrength(password);
  if (pwErr) throw httpError(400, pwErr);

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
  const pwErr = validatePasswordStrength(newPassword);
  if (pwErr) throw httpError(400, pwErr);
  const user = await User.findById(req.user._id).select("+password");
  if (!(await user.matchPassword(String(currentPassword || "")))) throw httpError(400, "Current password is incorrect");
  user.password = newPassword;
  user.passwordChangedAt = new Date();
  await user.save();
  audit(user, "user.password_changed", user.email);
  emit("users", "update", user._id);
  res.json({ message: "Password updated" });
};

export const deleteMe = async (req, res) => {
  const user = req.user;
  if (user.role === ROLES.SUPERADMIN) throw httpError(403, "A superadmin account cannot be self-deleted");
  const ideaIds = (await Idea.find({ user: user._id }).select("_id")).map((i) => i._id);
  await Promise.all([
    Idea.deleteMany({ user: user._id }),
    Assignment.deleteMany({ $or: [{ assignee: user._id }, { idea: { $in: ideaIds } }] }),
    user.deleteOne(),
  ]);
  audit(user, "user.self_deleted", user.email, "User requested account deletion under DPDP Act 2023");
  emit("users", "delete", user._id);
  emit("ideas", "delete");
  emit("assignments", "delete");
  res.json({ message: "Account deleted successfully" });
};

export const verifyEmail = async (req, res) => {
  const token = str(req.body.token, 100);
  const email = str(req.body.email, 120).toLowerCase();
  if (!token) throw httpError(400, "Verification token is required");
  let user;
  if (email) {
    user = await User.findOne({ email }).select("+emailVerificationToken +emailVerificationExpires");
  } else if (req.user) {
    user = await User.findById(req.user._id).select("+emailVerificationToken +emailVerificationExpires");
  } else {
    user = await User.findOne({ emailVerificationToken: token }).select("+emailVerificationToken +emailVerificationExpires");
  }
  if (!user) throw httpError(404, "User not found or invalid token");
  const isMatch = Boolean(user.emailVerificationToken && user.emailVerificationToken === token);
  if (!isMatch) {
    throw httpError(400, "Invalid verification token");
  }
  if (user.emailVerificationExpires && user.emailVerificationExpires < new Date()) {
    throw httpError(400, "Verification token has expired");
  }
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();
  audit(user, "user.email_verified", user.email);
  res.json({ message: "Email verified successfully" });
};

export const sendVerification = async (req, res) => {
  const user = req.user;
  const token = Math.floor(100000 + Math.random() * 900000).toString();
  user.emailVerificationToken = token;
  user.emailVerificationExpires = new Date(Date.now() + 24 * 3600 * 1000);
  await user.save();
  console.log(`[AUTH] Verification code for ${user.email}: ${token}`);
  syslog("info", "email.verification_sent", `Code generated for ${user.email}`);
  res.json({ message: "Verification code sent to your email" });
};
