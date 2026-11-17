import mongoose from "mongoose";

// A user-submitted flag against an idea, a piece of feedback or another user
const reportSchema = new mongoose.Schema(
  {
    targetType: { type: String, enum: ["idea", "feedback", "user"], required: true, index: true },
    target: { type: mongoose.Schema.Types.ObjectId, required: true },
    idea: { type: mongoose.Schema.Types.ObjectId, ref: "Idea" },
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: true, maxlength: 120 },
    details: { type: String, default: "", maxlength: 1000 },
    status: { type: String, enum: ["open", "resolved", "dismissed"], default: "open", index: true },
    resolution: { type: String, default: "" },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resolvedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("Report", reportSchema);
