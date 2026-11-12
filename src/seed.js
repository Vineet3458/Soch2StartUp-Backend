// Seeds users for all roles and sample startup ideas: npm run seed
import "dotenv/config";
import mongoose from "mongoose";
import User from "./models/User.js";
import Idea from "./models/Idea.js";
import { ROLES } from "./config/roles.js";

const SEED_USERS = [
  {
    name: "Super Admin",
    email: process.env.SUPERADMIN_EMAIL || "superadmin@soch2startup.com",
    password: process.env.SUPERADMIN_PASSWORD || "Admin@12345",
    role: ROLES.SUPERADMIN,
  },
  {
    name: "Platform Admin",
    email: process.env.ADMIN_EMAIL || "admin@soch2startup.com",
    password: process.env.ADMIN_PASSWORD || "Admin@12345",
    role: ROLES.ADMIN,
  },
  {
    name: "Content Moderator",
    email: process.env.MODERATOR_EMAIL || "moderator@soch2startup.com",
    password: process.env.MODERATOR_PASSWORD || "Moderator@123",
    role: ROLES.MODERATOR,
  },
  {
    name: "Rohan Sharma",
    email: process.env.MENTOR_EMAIL || "mentor@soch2startup.com",
    password: process.env.MENTOR_PASSWORD || "Mentor@123",
    role: ROLES.MENTOR,
  },
  {
    name: "Ananya Verma",
    email: process.env.EXPERT_EMAIL || "expert@soch2startup.com",
    password: process.env.EXPERT_PASSWORD || "Expert@123",
    role: ROLES.EXPERT,
  },
  {
    name: "Aarav Patel",
    email: process.env.ENTREPRENEUR_EMAIL || "entrepreneur@soch2startup.com",
    password: process.env.ENTREPRENEUR_PASSWORD || "Founder@123",
    role: ROLES.ENTREPRENEUR,
  },
];

const buildSampleIdeas = (entrepreneur, mentor, expert) => [
  {
    user: entrepreneur._id,
    title: "KrishiMitra AI – Smart Crop Advisory",
    description:
      "WhatsApp-first multilingual AI assistant helping smallholder farmers in India detect crop diseases from photos and get real-time mandi pricing and weather alerts.",
    industry: "AgriTech",
    budget: "₹8,00,000",
    teamSize: "3 founders",
    report: {
      score: 79,
      verdict: "GO",
      metrics: { marketDemand: 86, competition: 68, feasibility: 82, financial: 74, risk: 78 },
      marketResearch:
        "India has over 140 million agricultural households with rapidly growing smartphone and WhatsApp penetration in tier-3 and rural regions.",
      feasibilityNote:
        "Image-based disease detection models and WhatsApp Business APIs make an MVP straightforward to launch within 8–10 weeks.",
      swot: {
        strengths: ["Low-friction WhatsApp UX", "Regional language support", "High daily utility"],
        weaknesses: ["Low direct farmer willingness to pay", "Data quality in rural networks", "Initial trust barrier"],
        opportunities: ["Agri-input brand partnerships", "FPO distribution channels", "State govt pilot grants"],
        threats: ["Incumbent agri-apps", "Subsidy shifts", "Seasonal usage dips"],
      },
      targetCustomers: ["Smallholder farmers", "Farmer Producer Organizations (FPOs)", "Agri-input dealers"],
      competitors: ["DeHaat", "AgroStar", "Plantix"],
      risks: ["Monetization via B2C subscriptions", "Offline image inference accuracy", "Distribution cost"],
      recommendations: [
        "Pilot with 2 FPOs in one state before scaling",
        "Monetize through agri-input and credit referrals",
        "Support voice notes in local dialects",
      ],
    },
    feedback: [
      {
        by: mentor._id,
        byName: mentor.name,
        role: mentor.role,
        comment: "Strong wedge via WhatsApp. Focus early GTM on FPO partnerships rather than direct farmer ads.",
      },
      {
        by: expert._id,
        byName: expert.name,
        role: expert.role,
        comment: "Agri-input marketplace margins can fund free advisory if retention stays above 40% at week 8.",
      },
    ],
  },
  {
    user: entrepreneur._id,
    title: "KiranaFlow – Hyperlocal B2B Restocking",
    description:
      "Automated inventory forecasting and pooled wholesale ordering app for neighborhood kirana stores in metro suburbs.",
    industry: "Retail / B2B Commerce",
    budget: "₹15,00,000",
    teamSize: "4 members",
    report: {
      score: 61,
      verdict: "IMPROVE",
      metrics: { marketDemand: 76, competition: 38, feasibility: 66, financial: 55, risk: 58 },
      marketResearch:
        "Kirana stores still account for the majority of Indian grocery retail, though B2B e-commerce already has well-funded incumbents.",
      feasibilityNote:
        "App development is simple, but cold-chain logistics, credit underwriting, and distributor onboarding require heavy working capital.",
      swot: {
        strengths: ["Simple reorder workflow", "Demand aggregation discounts", "High purchase frequency"],
        weaknesses: ["Thin FMCG margins", "Working capital intensive", "Hard distributor onboarding"],
        opportunities: ["High-margin private labels", "Embedded BNPL credit", "Dark-store micro-fulfillment"],
        threats: ["Udaan & JioMart Partner", "Quick commerce shift", "Credit defaults"],
      },
      targetCustomers: ["Independent kirana stores", "Small supermarkets", "Local FMCG distributors"],
      competitors: ["JioMart Partner", "Udaan", "ElasticRun"],
      risks: ["Price wars with incumbents", "Inventory shrinkage", "Collection delays"],
      recommendations: [
        "Start as an asset-light SaaS + group buying layer without owning warehouses",
        "Target one high-margin category like packaged snacks or beverages first",
        "Validate unit economics across 50 stores before raising capital",
      ],
    },
    feedback: [
      {
        by: mentor._id,
        byName: mentor.name,
        role: mentor.role,
        comment: "Avoid holding inventory initially—prove repeat weekly ordering in a single pin code first.",
      },
    ],
  },
  {
    user: entrepreneur._id,
    title: "QuickCoin – Unregulated Crypto Arbitrage Bot",
    description:
      "Consumer retail app promising guaranteed daily returns through automated cross-exchange cryptocurrency arbitrage.",
    industry: "FinTech / Crypto",
    budget: "₹3,00,000",
    teamSize: "2 founders",
    report: {
      score: 41,
      verdict: "AVOID",
      metrics: { marketDemand: 55, competition: 40, feasibility: 45, financial: 35, risk: 22 },
      marketResearch:
        "Retail crypto interest fluctuates sharply in India due to 30% VDA taxation, 1% TDS on trades, and strict compliance scrutiny.",
      feasibilityNote:
        "Cross-exchange spreads collapse quickly at scale, while custodial fund handling creates severe legal and security exposure.",
      swot: {
        strengths: ["High viral curiosity", "Low initial code footprint", "24/7 market activity"],
        weaknesses: ["No sustainable edge", "Regulatory & TDS friction", "Trust deficit"],
        opportunities: ["Non-custodial analytics tools", "Tax & compliance reporting", "Institutional tooling"],
        threats: ["Regulatory bans or enforcement", "Exchange API limits", "Smart contract or custody hacks"],
      },
      targetCustomers: ["Retail crypto traders", "Speculative investors"],
      competitors: ["Existing trading bots", "Global crypto exchanges", "Signal groups"],
      risks: ["Regulatory non-compliance", "Promising guaranteed returns", "Exchange withdrawal freezes"],
      recommendations: [
        "Pivot away from guaranteed-return retail bots",
        "Explore non-custodial portfolio analytics or VDA tax compliance",
        "Consult fintech legal counsel before handling user funds",
      ],
    },
    feedback: [],
  },
];

await mongoose.connect(process.env.MONGO_URI);

const usersByRole = {};

for (const userData of SEED_USERS) {
  let user = await User.findOne({ email: userData.email });
  if (user) {
    console.log(`[skip] ${userData.role} already exists: ${user.email}`);
  } else {
    user = await User.create(userData);
    console.log(`[created] ${user.role}: ${user.email}`);
  }
  usersByRole[userData.role] = user;
}

const entrepreneur = usersByRole[ROLES.ENTREPRENEUR];
const mentor = usersByRole[ROLES.MENTOR];
const expert = usersByRole[ROLES.EXPERT];

const sampleIdeas = buildSampleIdeas(entrepreneur, mentor, expert);
for (const ideaData of sampleIdeas) {
  const existing = await Idea.findOne({ user: ideaData.user, title: ideaData.title });
  if (existing) {
    console.log(`[skip] Idea already exists: ${ideaData.title}`);
  } else {
    await Idea.create(ideaData);
    console.log(`[created] Idea: ${ideaData.title} (${ideaData.report.verdict})`);
  }
}

await mongoose.disconnect();
console.log("Seeding complete.");
