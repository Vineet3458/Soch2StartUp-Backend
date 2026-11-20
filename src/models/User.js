import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { ROLES } from "../config/roles.js";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, maxlength: 128, select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.ENTREPRENEUR },
    isActive: { type: Boolean, default: true }, // false = blocked
    verified: { type: Boolean, default: true }, // mentors/experts start unverified
    isEmailVerified: { type: Boolean, default: false }, // separate from mentor admin verification
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    passwordChangedAt: { type: Date },
    blockedReason: { type: String, default: "" },
    bio: { type: String, default: "", maxlength: 500 },
    company: { type: String, default: "", maxlength: 80 },
    location: { type: String, default: "", maxlength: 80 },
    expertise: { type: [String], default: [] },
    lastLoginAt: Date,
    prefs: {
      emailNotifications: { type: Boolean, default: true },
      theme: { type: String, enum: ["dark", "light"], default: "dark" },
      compact: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

userSchema.virtual("status").get(function () {
  if (!this.isActive) return "blocked";
  if (!this.verified) return "pending";
  return "active";
});
userSchema.set("toJSON", { virtuals: true, transform: (_d, r) => { delete r.password; delete r.emailVerificationToken; delete r.emailVerificationExpires; delete r.__v; delete r.id; return r; } });

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

export default mongoose.model("User", userSchema);
