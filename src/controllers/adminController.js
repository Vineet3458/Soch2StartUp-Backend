import User from "../models/User.js";
import Idea from "../models/Idea.js";
import { ROLES } from "../config/roles.js";

export const getStats = async (req, res) => {
  const [users, ideas, verdicts] = await Promise.all([
    User.countDocuments(),
    Idea.countDocuments(),
    Idea.aggregate([{ $group: { _id: "$report.verdict", count: { $sum: 1 } } }]),
  ]);
  res.json({ users, ideas, verdicts: verdicts.map((v) => ({ verdict: v._id, count: v.count })) });
};

export const getUsers = async (req, res) => res.json(await User.find().sort("-createdAt"));

// Superadmin only: change a user's role
export const updateRole = async (req, res) => {
  const { role } = req.body;
  if (!Object.values(ROLES).includes(role)) return res.status(400).json({ message: "Invalid role" });
  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
};

export const toggleActive = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  if (user.role === ROLES.SUPERADMIN) return res.status(403).json({ message: "Cannot deactivate a superadmin" });
  user.isActive = !user.isActive;
  await user.save();
  res.json(user);
};

export const getAllIdeas = async (req, res) =>
  res.json(await Idea.find().populate("user", "name email").sort("-createdAt"));

export const deleteIdeaAsAdmin = async (req, res) => {
  await Idea.findByIdAndDelete(req.params.id);
  res.json({ message: "Idea deleted" });
};
