import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    score: Number,
    verdict: { type: String, enum: ["GO", "IMPROVE", "AVOID"] },
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
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    industry: { type: String, required: true },
    budget: { type: String, default: "Not specified" },
    teamSize: { type: String, default: "Not specified" },
    report: reportSchema,
    feedback: [
      {
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        byName: String,
        role: String,
        comment: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Idea", ideaSchema);
