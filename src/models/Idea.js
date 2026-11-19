import mongoose from "mongoose";
import { IDEA_STATUS } from "../config/roles.js";

const reportSchema = new mongoose.Schema(
  {
    score: Number,
    verdict: { type: String, enum: ["GO", "IMPROVE", "AVOID"] },
    source: { type: String, default: "demo" }, // "gemini" | "demo" | "council"
    generatedAt: { type: Date, default: Date.now },
    confidence: Number, // council agreement + model coverage (0-100)
    consensus: { modelsUsed: Number, agreement: Number, coverage: Number },
    models: [{
      id: String, name: String, provider: String, model: String,
      weight: Number, ms: Number, score: Number, verdict: String, metrics: Object,
    }],
    failedModels: [{ name: String, error: String }],
    liveData: {
      mode: String, collectedAt: Date, summary: String,
      queries: [String], errors: [String],
      sources: [{ title: String, url: String, domain: String, snippet: String, kind: String, siteText: String }],
    },
    metrics: {
      marketDemand: Number,
      competition: Number, // higher = less competition
      feasibility: Number,
      financial: Number,
      risk: Number, // higher = safer
    },
    marketResearch: String,
    feasibilityNote: String,
    swot: {
      strengths: [String],
      weaknesses: [String],
      opportunities: [String],
      threats: [String],
    },
    targetCustomers: [String],
    competitors: [String],
    risks: [String],
    recommendations: [String],
  },
  { _id: false }
);

const ideaSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 4000 },
    industry: { type: String, required: true },
    budget: { type: String, default: "Not specified" },
    teamSize: { type: String, default: "Not specified" },
    status: { type: String, enum: IDEA_STATUS, default: "submitted", index: true },
    report: reportSchema,
    reviewNote: { type: String, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    flagged: { type: Boolean, default: false },
    plan: {
      problem: { type: String, default: "" },
      solution: { type: String, default: "" },
      customers: { type: String, default: "" },
      revenue: { type: String, default: "" },
      goToMarket: { type: String, default: "" },
      financials: { type: String, default: "" },
      team: { type: String, default: "" },
    },
    roadmap: [
      {
        title: { type: String, required: true, maxlength: 120 },
        description: { type: String, default: "", maxlength: 400 },
        due: Date,
        status: { type: String, enum: ["todo", "doing", "done"], default: "todo" },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Idea", ideaSchema);
