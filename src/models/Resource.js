import mongoose from "mongoose";

const resourceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    kind: { type: String, enum: ["guideline", "template", "playbook", "announcement", "article"], default: "article", index: true },
    category: { type: String, default: "General" },
    summary: { type: String, default: "", maxlength: 300 },
    body: { type: String, default: "", maxlength: 8000 },
    audience: { type: [String], default: [] }, // empty = everyone
    pinned: { type: Boolean, default: false },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    authorName: String,
    savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

export default mongoose.model("Resource", resourceSchema);
