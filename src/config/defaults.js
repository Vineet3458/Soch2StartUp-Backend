import { ROLES } from "./roles.js";

// Every permission the platform understands. Superadmin can grant/revoke these per role.
export const PERMISSIONS = [
  { key: "users.view", label: "View user directory", group: "Users" },
  { key: "users.manage", label: "Create, verify & block users", group: "Users" },
  { key: "roles.change", label: "Change user roles", group: "Users" },
  { key: "ideas.review", label: "Approve / reject ideas", group: "Ideas" },
  { key: "ideas.assign", label: "Assign mentors & evaluators", group: "Ideas" },
  { key: "ideas.delete", label: "Delete any idea", group: "Ideas" },
  { key: "resources.manage", label: "Manage resources & announcements", group: "Content" },
  { key: "reports.moderate", label: "Handle content reports", group: "Content" },
  { key: "feedback.write", label: "Write guidance & evaluations", group: "Content" },
  { key: "analytics.view", label: "View platform analytics", group: "Insights" },
  { key: "logs.view", label: "View audit & activity logs", group: "Insights" },
];

const ALL = PERMISSIONS.map((p) => p.key);

export const DEFAULT_PERMISSIONS = {
  [ROLES.SUPERADMIN]: ALL,
  [ROLES.ADMIN]: ["users.view", "users.manage", "roles.change", "ideas.review", "ideas.assign", "ideas.delete", "resources.manage", "reports.moderate", "feedback.write", "analytics.view", "logs.view"],
  [ROLES.MODERATOR]: ["users.view", "reports.moderate", "logs.view"],
  [ROLES.MENTOR]: ["feedback.write"],
  [ROLES.EXPERT]: ["feedback.write"],
  [ROLES.ENTREPRENEUR]: [],
};

export const DEFAULT_CONFIG = {
  platform: {
    name: "Soch2Startup",
    tagline: "Turn your startup idea into a scalable business",
    supportEmail: "support@soch2startup.com",
    registrationOpen: true,
    requireVerification: true,
    maintenance: { enabled: false, message: "We are performing scheduled maintenance. Please check back shortly." },
    banner: { enabled: false, text: "", tone: "info" },
  },
  features: {
    aiValidation: true,
    compareIdeas: true,
    mentorRequests: true,
    sessions: true,
    resourceHub: true,
    evaluations: true,
    moderation: true,
    publicStats: true,
  },
  scoring: {
    weights: { marketDemand: 30, competition: 15, feasibility: 20, financial: 20, risk: 15 },
    thresholds: { go: 70, improve: 50 },
  },
  engine: { provider: "gemini", enabled: true, model: "gemini-2.0-flash", temperature: 0.4, fallbackToDemo: true, market: "India" },
  categories: [
    { name: "FoodTech", enabled: true, color: "#f59e0b" },
    { name: "EdTech", enabled: true, color: "#6366f1" },
    { name: "HealthTech", enabled: true, color: "#10b981" },
    { name: "FinTech", enabled: true, color: "#06b6d4" },
    { name: "E-commerce", enabled: true, color: "#ec4899" },
    { name: "SaaS", enabled: true, color: "#8b5cf6" },
    { name: "AgriTech", enabled: true, color: "#84cc16" },
    { name: "Other", enabled: true, color: "#94a3b8" },
  ],
  permissions: DEFAULT_PERMISSIONS,
  integrations: {
    webhook: { enabled: false, url: "", events: ["idea.created", "idea.reviewed"] },
  },
};

// Keys anyone (even logged out) may read: they drive the landing page & forms
export const PUBLIC_KEYS = ["platform", "features", "categories"];
