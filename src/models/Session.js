import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    idea: { type: mongoose.Schema.Types.ObjectId, ref: "Idea", required: true, index: true },
    mentor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    founder: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, maxlength: 120 },
    agenda: { type: String, default: "", maxlength: 1000 },
    mode: { type: String, enum: ["video", "call", "in_person"], default: "video" },
    link: { type: String, default: "" },
    scheduledAt: { type: Date, required: true },
    durationMin: { type: Number, default: 45, min: 10, max: 240 },
    status: { type: String, enum: ["scheduled", "completed", "cancelled"], default: "scheduled" },
    notes: { type: String, default: "", maxlength: 2000 },
  },
  { timestamps: true }
);

export default mongoose.model("Session", sessionSchema);
