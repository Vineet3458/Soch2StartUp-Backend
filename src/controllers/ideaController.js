import Idea from "../models/Idea.js";
import { analyzeIdea } from "../services/geminiService.js";
import { ROLES } from "../config/roles.js";

const STAFF = [ROLES.ADMIN, ROLES.SUPERADMIN, ROLES.MENTOR, ROLES.EXPERT, ROLES.MODERATOR];

export const createIdea = async (req, res) => {
  const { title, description, industry, budget, teamSize } = req.body;
  if (!title || !description || !industry) {
    return res.status(400).json({ message: "Title, description and industry are required" });
  }
  const report = await analyzeIdea({ title, description, industry, budget, teamSize });
  const idea = await Idea.create({ user: req.user._id, title, description, industry, budget, teamSize, report });
  res.status(201).json(idea);
};

export const getMyIdeas = async (req, res) => {
  const isStaff = STAFF.includes(req.user.role);
  // Staff sees all ideas by default unless explicit ?my=true is specified
  const filter = isStaff && req.query.my !== "true" ? {} : { user: req.user._id };
  const ideas = await Idea.find(filter).populate("user", "name email role").sort("-createdAt");
  res.json(ideas);
};

export const getIdea = async (req, res) => {
  const idea = await Idea.findById(req.params.id).populate("user", "name email role");
  if (!idea) return res.status(404).json({ message: "Idea not found" });
  const isOwner = idea.user._id.equals(req.user._id);
  if (!isOwner && !STAFF.includes(req.user.role)) return res.status(403).json({ message: "Access denied" });
  res.json(idea);
};

export const deleteIdea = async (req, res) => {
  const isStaff = [ROLES.ADMIN, ROLES.SUPERADMIN].includes(req.user.role);
  const filter = isStaff ? { _id: req.params.id } : { _id: req.params.id, user: req.user._id };
  const idea = await Idea.findOneAndDelete(filter);
  if (!idea) return res.status(404).json({ message: "Idea not found" });
  res.json({ message: "Idea deleted" });
};

// GET /api/ideas/compare?ids=id1,id2
export const compareIdeas = async (req, res) => {
  const ids = (req.query.ids || "").split(",").filter(Boolean);
  const isStaff = STAFF.includes(req.user.role);
  const filter = isStaff ? { _id: { $in: ids } } : { _id: { $in: ids }, user: req.user._id };
  const ideas = await Idea.find(filter).populate("user", "name email role");
  res.json(ideas);
};

// Mentors, industry experts, admins, and moderators leave feedback on an idea
export const addFeedback = async (req, res) => {
  const idea = await Idea.findById(req.params.id);
  if (!idea) return res.status(404).json({ message: "Idea not found" });
  if (!req.body.comment) return res.status(400).json({ message: "Comment is required" });
  idea.feedback.push({
    by: req.user._id,
    byName: req.user.name,
    role: req.user.role,
    comment: req.body.comment,
    score: req.body.score || null,
  });
  await idea.save();
  res.status(201).json(idea);
};
