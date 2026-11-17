import mongoose from "mongoose";

// A mentor (kind "mentor") or evaluator (kind "evaluation") assigned to an idea
const assignmentSchema = new mongoose.Schema(
  {
    idea: { type: mongoose.Schema.Types.ObjectId, ref: "Idea", required: true, index: true },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["mentor", "evaluation"], required: true },
    stage: { type: String, enum: ["assigned", "in_progress", "completed", "archived"], default: "assigned" },
    reEval: { type: Boolean, default: false },
    dueDate: Date,
    note: { type: String, default: "" },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    completedAt: Date,
  },
  { timestamps: true }
);
assignmentSchema.index({ idea: 1, assignee: 1, kind: 1 }, { unique: true });

export default mongoose.model("Assignment", assignmentSchema);
