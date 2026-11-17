import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema(
  {
    idea: { type: mongoose.Schema.Types.ObjectId, ref: "Idea", required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    authorName: String,
    authorRole: String,
    kind: { type: String, enum: ["guidance", "evaluation", "comment"], default: "comment" },
    comment: { type: String, required: true, maxlength: 3000 },
    tags: { type: [String], default: [] },
    score: { type: Number, min: 0, max: 100, default: null }, // overall for evaluations
    criteria: {
      problem: Number, market: Number, innovation: Number,
      execution: Number, scalability: Number, team: Number,
    },
    recommendation: { type: String, enum: ["strong_yes", "yes", "maybe", "no", ""], default: "" },
    status: { type: String, enum: ["published", "removed"], default: "published" },
    dispute: {
      status: { type: String, enum: ["none", "open", "resolved"], default: "none" },
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reason: String,
      response: String,
      at: Date,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Feedback", feedbackSchema);
