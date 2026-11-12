import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { ROLES, SELF_REGISTER_ROLES } from "../config/roles.js";

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });

const sendAuth = (res, user, status = 200) =>
  res.status(status).json({
    token: signToken(user._id),
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  });

export const register = async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: "Name, email and password are required" });
  if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

  // Admin-level roles can never be self-assigned
  const safeRole = SELF_REGISTER_ROLES.includes(role) ? role : ROLES.ENTREPRENEUR;
  const user = await User.create({ name, email, password, role: safeRole });
  sendAuth(res, user, 201);
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.matchPassword(password))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  if (!user.isActive) return res.status(403).json({ message: "Your account has been deactivated" });
  sendAuth(res, user);
};

export const getMe = (req, res) => {
  const { _id, name, email, role } = req.user;
  res.json({ user: { id: _id, name, email, role } });
};
