import mongoose from "mongoose";

// kind "audit" = who did what (business events); kind "system" = server events & errors
const logSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["audit", "system"], default: "audit", index: true },
    level: { type: String, enum: ["info", "warn", "error"], default: "info" },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    actorName: String,
    actorRole: String,
    action: { type: String, required: true }, // e.g. idea.approved
    target: String,
    message: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
logSchema.index({ createdAt: -1 });

export default mongoose.model("Log", logSchema);
