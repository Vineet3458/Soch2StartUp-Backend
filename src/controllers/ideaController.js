import Idea from "../models/Idea.js";
import { analyzeIdea } from "../services/geminiService.js";
import { ROLES } from "../config/roles.js";

const STAFF = [ROLES.ADMIN, ROLES.SUPERADMIN, ROLES.MENTOR, ROLES.EXPERT];

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
  const ideas = await Idea.find({ user: req.user._id }).sort("-createdAt");
  res.json(ideas);
};

export const getIdea = async (req, res) => {
  const idea = await Idea.findById(req.params.id).populate("user", "name email");
  if (!idea) return res.status(404).json({ message: "Idea not found" });
  const isOwner = idea.user._id.equals(req.user._id);
  if (!isOwner && !STAFF.includes(req.user.role)) return res.status(403).json({ message: "Access denied" });
  res.json(idea);
};

export const deleteIdea = async (req, res) => {
  const idea = await Idea.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!idea) return res.status(404).json({ message: "Idea not found" });
  res.json({ message: "Idea deleted" });
};

// GET /api/ideas/compare?ids=id1,id2
export const compareIdeas = async (req, res) => {
  const ids = (req.query.ids || "").split(",").filter(Boolean);
  const ideas = await Idea.find({ _id: { $in: ids }, user: req.user._id });
  res.json(ideas);
};

// Mentors and industry experts leave feedback on an idea
export const addFeedback = async (req, res) => {
  const idea = await Idea.findById(req.params.id);
  if (!idea) return res.status(404).json({ message: "Idea not found" });
  if (!req.body.comment) return res.status(400).json({ message: "Comment is required" });
  idea.feedback.push({ by: req.user._id, byName: req.user.name, role: req.user.role, comment: req.body.comment });
  await idea.save();
  res.status(201).json(idea);
};
