import mongoose from "mongoose";

// Things that need an admin decision: mentor requests, role changes
const requestSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["mentor_request", "role_change"], required: true, index: true },
    requester: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    idea: { type: mongoose.Schema.Types.ObjectId, ref: "Idea" },
    requestedRole: String,
    note: { type: String, default: "", maxlength: 600 },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    decisionNote: { type: String, default: "" },
    decidedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("Request", requestSchema);
