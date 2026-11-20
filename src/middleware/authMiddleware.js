import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { VERIFY_ROLES } from "../config/roles.js";
import { hasPermission, getConfig } from "../services/configService.js";

export const userFromToken = async (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) return null;
  if (user.passwordChangedAt && decoded.iat) {
    if (decoded.iat * 1000 < user.passwordChangedAt.getTime()) return null;
  }
  return user;
};

// Checks the JWT and attaches the logged-in user to req.user
export const protect = async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.split(" ")[1] : null;
  if (!token) return res.status(401).json({ message: "Not authorized, token missing" });
  try {
    const user = await userFromToken(token);
    if (!user) return res.status(401).json({ message: "Account not available" });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

// Allows only the listed roles, e.g. authorize("admin", "superadmin")
export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: "You do not have permission for this action" });
  next();
};

// Allows anyone whose role currently holds ANY of the listed permissions (live from Roles & Permissions)
export const perm = (...keys) => (req, res, next) => {
  if (!keys.some((k) => hasPermission(req.user.role, k))) return res.status(403).json({ message: "You do not have permission for this action" });
  if (VERIFY_ROLES.includes(req.user.role) && !req.user.verified && keys.includes("feedback.write")) {
    return res.status(403).json({ message: "Your account is awaiting admin verification" });
  }
  next();
};

// Blocks features switched off by the superadmin in Feature Management
export const feature = (name) => (req, res, next) => {
  if (!getConfig("features")[name]) return res.status(403).json({ message: "This feature is currently disabled by the administrator" });
  next();
};
