// Seeds demo data for every role:  npm run seed           (adds missing users + sample data once)
//                                  npm run seed -- --reset (wipes the database first)
import "dotenv/config";
import mongoose from "mongoose";
import User from "./models/User.js";
import Idea from "./models/Idea.js";
import Assignment from "./models/Assignment.js";
import Feedback from "./models/Feedback.js";
import Session from "./models/Session.js";
import Notification from "./models/Notification.js";
import Resource from "./models/Resource.js";
import Report from "./models/Report.js";
import Request from "./models/Request.js";
import Log from "./models/Log.js";
import Config from "./models/Config.js";
import { ROLES } from "./config/roles.js";
import { loadConfig } from "./services/configService.js";
import { analyzeIdea } from "./services/aiService.js";

const reset = process.argv.includes("--reset");
const ago = (days, hours = 0) => new Date(Date.now() - days * 86400000 - hours * 3600000);
const inDays = (d, h = 10) => { const x = new Date(Date.now() + d * 86400000); x.setHours(h, 0, 0, 0); return x; };

const USERS = [
  { key: "super", name: "Super Admin", email: process.env.SUPERADMIN_EMAIL || "superadmin@soch2startup.com", password: process.env.SUPERADMIN_PASSWORD || "Admin@12345", role: ROLES.SUPERADMIN, days: 40 },
  { key: "admin", name: "Platform Admin", email: "admin@soch2startup.com", password: "Admin@12345", role: ROLES.ADMIN, days: 38 },
  { key: "mod", name: "Content Moderator", email: "moderator@soch2startup.com", password: "Moderator@123", role: ROLES.MODERATOR, days: 30 },
  { key: "mentor", name: "Rohan Sharma", email: "mentor@soch2startup.com", password: "Mentor@123", role: ROLES.MENTOR, days: 28, company: "Ex-Flipkart, Angel Investor", expertise: ["Go-to-market", "Fundraising", "E-commerce"], bio: "12 years building consumer products. Mentored 40+ early-stage founders." },
  { key: "mentor2", name: "Priya Nair", email: "priya.nair@soch2startup.com", password: "Mentor@123", role: ROLES.MENTOR, days: 20, company: "Growth Partner, Lightspeed Scout", expertise: ["SaaS", "Pricing", "Product"], bio: "Product leader turned scout. Loves B2B SaaS and developer tools." },
  { key: "expert", name: "Ananya Verma", email: "expert@soch2startup.com", password: "Expert@123", role: ROLES.EXPERT, days: 27, company: "Partner, Seed Fund", expertise: ["FinTech", "HealthTech", "Due diligence"], bio: "Early-stage VC evaluating 300+ decks a year." },
  { key: "expert2", name: "Vikram Rao", email: "vikram.rao@soch2startup.com", password: "Expert@123", role: ROLES.EXPERT, days: 18, company: "Agri-food strategy consultant", expertise: ["AgriTech", "FoodTech", "Supply chain"], bio: "Operator and advisor across agri value chains." },
  { key: "pending", name: "Neha Kapoor", email: "neha.kapoor@soch2startup.com", password: "Mentor@123", role: ROLES.MENTOR, days: 1, verified: false, expertise: ["EdTech"], bio: "Ex-teacher and edtech product manager awaiting verification." },
  { key: "f1", name: "Aarav Patel", email: "entrepreneur@soch2startup.com", password: "Founder@123", role: ROLES.ENTREPRENEUR, days: 25, company: "KrishiMitra", location: "Pune" },
  { key: "f2", name: "Meera Iyer", email: "meera.iyer@soch2startup.com", password: "Founder@123", role: ROLES.ENTREPRENEUR, days: 14, company: "LearnLoop", location: "Bengaluru" },
  { key: "f3", name: "Kabir Singh", email: "kabir.singh@soch2startup.com", password: "Founder@123", role: ROLES.ENTREPRENEUR, days: 9, location: "Delhi" },
  { key: "f4", name: "Sana Khan", email: "sana.khan@soch2startup.com", password: "Founder@123", role: ROLES.ENTREPRENEUR, days: 5, location: "Hyderabad" },
  { key: "f5", name: "Dev Malhotra", email: "dev.malhotra@soch2startup.com", password: "Founder@123", role: ROLES.ENTREPRENEUR, days: 3, location: "Mumbai" },
  { key: "blocked", name: "Rahul Bansal", email: "rahul.bansal@soch2startup.com", password: "Founder@123", role: ROLES.ENTREPRENEUR, days: 12, isActive: false, blockedReason: "Repeated spam submissions" },
];

const IDEAS = [
  { f: "f1", title: "KrishiMitra AI – Smart Crop Advisory", industry: "AgriTech", budget: "₹1–10 lakh", teamSize: "2–3 members", days: 22, status: "approved", description: "WhatsApp-first multilingual AI assistant helping smallholder farmers in India detect crop diseases from photos and get real-time mandi pricing and weather alerts. Monetised via agri-input partnerships and a premium subscription for FPOs." },
  { f: "f1", title: "FPO Connect – B2B Marketplace for Farmer Groups", industry: "AgriTech", budget: "Above ₹10 lakh", teamSize: "4+ members", days: 8, status: "under_review", description: "A B2B marketplace where Farmer Producer Organisations list produce directly for food processors, with quality grading, escrow payments and logistics tracking. Commission-based revenue." },
  { f: "f2", title: "LearnLoop – Peer Tutoring for Tier-2 Students", industry: "EdTech", budget: "Under ₹1 lakh", teamSize: "2–3 members", days: 12, status: "approved", description: "A vernacular peer-tutoring platform connecting college toppers with Class 9–12 students in tier-2 and tier-3 cities for affordable doubt-solving sessions. Subscription pricing under ₹299 per month." },
  { f: "f2", title: "StudyPod – AI Revision Planner", industry: "EdTech", budget: "Under ₹1 lakh", teamSize: "Solo founder", days: 4, status: "changes_requested", reviewNote: "Please clarify the revenue model and how you differ from existing planner apps.", description: "An app that builds personalised revision schedules for competitive exam aspirants using their mock test performance and spaced repetition. Free to start, premium plan planned." },
  { f: "f3", title: "PayKirana – UPI Credit for Neighbourhood Stores", industry: "FinTech", budget: "Above ₹10 lakh", teamSize: "4+ members", days: 10, status: "approved", description: "Working-capital micro-loans for kirana stores underwritten from UPI transaction history, with auto-repayment from daily settlements. Revenue from interest spread and a small processing fee, B2B focused on tier-2 markets." },
  { f: "f3", title: "QuickScan – Instant Health Check Kiosks", industry: "HealthTech", budget: "Above ₹10 lakh", teamSize: "2–3 members", days: 6, status: "submitted", description: "Self-serve kiosks in pharmacies and malls that measure basic vitals and generate a shareable health summary with teleconsult referrals. Revenue from consult commissions and pharmacy partnerships." },
  { f: "f4", title: "ThaliBox – Healthy Tiffin Subscription", industry: "FoodTech", budget: "₹1–10 lakh", teamSize: "2–3 members", days: 5, status: "submitted", description: "Weekly subscription of home-style healthy tiffins for office workers, cooked in shared cloud kitchens with calorie-tracked menus. Pricing from ₹120 per meal with monthly plans." },
  { f: "f4", title: "Swipe Social – Yet Another Social Network", industry: "Other", budget: "Under ₹1 lakh", teamSize: "Solo founder", days: 3, status: "rejected", reviewNote: "The concept is too generic and overlaps heavily with existing social networks. Please narrow the target audience.", description: "A social network where people share photos and follow friends and creators, with likes and comments just like the major platforms." },
  { f: "f5", title: "ShipEasy – Returns Automation for D2C Brands", industry: "SaaS", budget: "₹1–10 lakh", teamSize: "4+ members", days: 2, status: "under_review", description: "A B2B SaaS platform that automates return pickup, refund and exchange workflows for D2C brands on Shopify and WooCommerce. Subscription pricing per order volume, with analytics to cut return rates." },
  { f: "f5", title: "ReelRent – Fashion Rentals for Creators", industry: "E-commerce", budget: "₹1–10 lakh", teamSize: "Solo founder", days: 1, status: "draft", noReport: true, description: "Rent designer outfits for a day of content shoots, delivered and picked up within 24 hours in metro cities." },
];

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/soch2startup");
  console.log("MongoDB connected");
  if (reset) { await Promise.all([User, Idea, Assignment, Feedback, Session, Notification, Resource, Report, Request, Log, Config].map((m) => m.deleteMany({}))); console.log("Database cleared"); }
  await loadConfig();
  process.env.GEMINI_API_KEY = ""; // seed with the built-in analysis so no API calls are made

  const U = {};
  for (const u of USERS) {
    let doc = await User.findOne({ email: u.email.toLowerCase() });
    if (!doc) {
      const { days, ...rest } = u;
      delete rest.key;
      doc = await User.create({ ...rest, verified: rest.verified ?? true, createdAt: ago(days), lastLoginAt: ago(Math.random() * 3) });
    }
    U[u.key] = doc;
  }

  if (await Idea.countDocuments()) { console.log("Sample data already present - skipped (use --reset to rebuild)."); return summary(); }

  const I = [];
  for (const spec of IDEAS) {
    const base = { user: U[spec.f]._id, title: spec.title, description: spec.description, industry: spec.industry, budget: spec.budget, teamSize: spec.teamSize };
    const report = spec.noReport ? undefined : await analyzeIdea(base);
    if (report) report.generatedAt = ago(spec.days);
    const idea = await Idea.create({
      ...base, report, status: spec.status, reviewNote: spec.reviewNote || "", createdAt: ago(spec.days),
      ...(["approved", "rejected", "changes_requested"].includes(spec.status) ? { reviewedBy: U.admin._id, reviewedAt: ago(spec.days - 1) } : {}),
    });
    I.push(idea);
  }
  const [krishi, fpo, learn, study, kirana, quick, thali, swipe, ship] = I;

  // Plans & roadmaps for the flagship idea
  krishi.plan = { problem: "Smallholder farmers lose 20–30% of yield to late disease detection and sell at poor prices for lack of market information.", solution: "A WhatsApp assistant that diagnoses crop disease from a photo in the farmer's language and pushes mandi prices and weather alerts.", customers: "Smallholder farmers, FPOs and agri-input dealers in Maharashtra and Karnataka.", revenue: "Agri-input partner referrals, FPO subscriptions and credit lead-gen.", goToMarket: "Pilot with 2 FPOs, then expand through input dealers and state agri-department partnerships.", financials: "Break-even projected at ~4,000 paying FPO members; ₹8 lakh seed covers 9 months runway.", team: "CEO (agri background), CTO (ML), Growth lead." };
  krishi.roadmap = [
    { title: "Customer discovery – 20 farmer interviews", description: "Validate top 3 pain points", due: ago(10), status: "done" },
    { title: "Disease-detection MVP on WhatsApp", description: "Top 10 crops, Marathi + Hindi", due: ago(-5), status: "doing" },
    { title: "Pilot with 2 FPOs", description: "100 active farmers", due: ago(-25), status: "todo" },
    { title: "Pricing experiment", description: "Test ₹49/month FPO plan", due: ago(-45), status: "todo" },
  ];
  await krishi.save();
  learn.roadmap = [{ title: "Recruit 50 college tutors", status: "done", due: ago(3) }, { title: "Launch Hindi pilot in 3 cities", status: "doing", due: ago(-14) }];
  await learn.save();

  const A = async (idea, user, kind, stage, extra = {}) => Assignment.create({ idea: idea._id, assignee: user._id, kind, stage, assignedBy: U.admin._id, createdAt: ago(extra.days ?? 5), ...extra });
  await A(krishi, U.mentor, "mentor", "in_progress", { days: 18 });
  await A(learn, U.mentor, "mentor", "completed", { days: 9, completedAt: ago(2) });
  await A(kirana, U.mentor, "mentor", "assigned", { days: 2, dueDate: inDays(6) });
  await A(ship, U.mentor2, "mentor", "assigned", { days: 1 });
  await A(fpo, U.mentor, "mentor", "archived", { days: 6 });
  await A(krishi, U.expert2, "evaluation", "completed", { days: 19, completedAt: ago(17) });
  await A(kirana, U.expert, "evaluation", "assigned", { days: 4, reEval: true });
  await A(quick, U.expert, "evaluation", "assigned", { days: 3, dueDate: inDays(4) });
  await A(learn, U.expert, "evaluation", "completed", { days: 9, completedAt: ago(7) });
  await A(ship, U.expert, "evaluation", "in_progress", { days: 1 });
  await A(thali, U.expert2, "evaluation", "assigned", { days: 2 });

  const crit = (a, b, c, d, e, f) => ({ problem: a, market: b, innovation: c, execution: d, scalability: e, team: f });
  const ev = (idea, author, criteria, comment, rec, days, extra = {}) => {
    const score = Math.round((Object.values(criteria).reduce((s, x) => s + x, 0) / 6) * 10);
    return Feedback.create({ idea: idea._id, author: author._id, authorName: author.name, authorRole: author.role, kind: "evaluation", comment, criteria, score, recommendation: rec, createdAt: ago(days), ...extra });
  };
  await ev(krishi, U.expert2, crit(9, 8, 8, 7, 8, 8), "Strong, well-evidenced problem with a clear wedge via WhatsApp. Monetisation through FPOs is credible; validate farmer willingness to pay early.", "strong_yes", 17);
  await ev(learn, U.expert, crit(8, 7, 6, 8, 7, 7), "Solid traction path and low-cost delivery model. Differentiation vs. large players needs sharper articulation.", "yes", 7);
  await ev(kirana, U.expert, crit(6, 7, 5, 6, 6, 6), "Interesting underwriting angle but the evaluation finds credit risk controls underdeveloped for a first-time lender.", "maybe", 3,
    { dispute: { status: "open", by: U.f3._id, reason: "The scorecard ignored our NBFC partner's risk model described in the plan. Please re-evaluate.", at: ago(1) } });
  const g = (idea, author, comment, tags, days) => Feedback.create({ idea: idea._id, author: author._id, authorName: author.name, authorRole: author.role, kind: "guidance", comment, tags, createdAt: ago(days) });
  const gBad = await g(krishi, U.mentor, "Skip customer interviews and start spending on ads immediately.", ["growth"], 1);
  await g(krishi, U.mentor, "Pilot with two FPOs before scaling. Offer the farmer-facing service free and monetise through input-dealer referrals. Prepare a one-page pilot success metric sheet.", ["go-to-market", "pilot"], 12);
  await g(learn, U.mentor, "Great early traction. Focus on tutor quality: introduce a rating system and a 3-session trial. Price the monthly plan at ₹249 to test elasticity.", ["pricing", "quality"], 6);

  await Session.create([
    { idea: krishi._id, mentor: U.mentor._id, founder: U.f1._id, title: "Pilot planning with FPOs", agenda: "Pilot metrics, FPO outreach script, WhatsApp bot flows", mode: "video", link: "https://meet.example.com/krishi-pilot", scheduledAt: inDays(2, 11), durationMin: 45 },
    { idea: kirana._id, mentor: U.mentor._id, founder: U.f3._id, title: "Credit-risk discovery call", agenda: "Underwriting data sources, partner NBFC model", mode: "call", scheduledAt: inDays(5, 16), durationMin: 30 },
    { idea: krishi._id, mentor: U.mentor._id, founder: U.f1._id, title: "Kick-off session", agenda: "Goals for the next 8 weeks", mode: "video", scheduledAt: ago(14, -10), durationMin: 60, status: "completed", notes: "Agreed on discovery plan: 20 farmer interviews; weekly check-ins." },
    { idea: learn._id, mentor: U.mentor._id, founder: U.f2._id, title: "Pricing workshop", agenda: "Pricing tiers and trial design", mode: "in_person", scheduledAt: ago(5, -11), durationMin: 90, status: "completed", notes: "Tutor trial: 3 free sessions. Test ₹249 vs ₹299." },
  ]);

  const R = (title, kind, category, summary, body, extra = {}) => ({ title, kind, category, summary, body, author: U.admin._id, authorName: U.admin.name, ...extra });
  await Resource.create([
    R("Community Guidelines", "guideline", "Policy", "How we keep Soch2Startup respectful, useful and safe.", "1. Be honest and respectful.\n2. Share only ideas you have the right to share.\n3. No spam, plagiarism or misleading claims.\n4. Feedback must be constructive and specific.\n5. Report anything that breaks these rules — moderators review every report.", { pinned: true }),
    R("Idea Submission Rules", "guideline", "Policy", "What makes a good submission and what gets rejected.", "• Describe the problem, the customer and your solution.\n• Mention how you plan to earn revenue.\n• One idea per submission.\n• Generic or duplicate ideas may be rejected with feedback."),
    R("Mentor & Evaluator Code of Conduct", "guideline", "Policy", "Standards for people who give feedback.", "Be specific, kind and evidence-based. Declare conflicts of interest. Never share confidential founder information.", { audience: ["mentor", "industry_expert", "moderator", "admin"] }),
    R("Welcome to the new Soch2Startup", "announcement", "Platform", "Live notifications, mentor requests and evaluation scorecards are now available.", "We rebuilt the platform: changes now appear instantly across the app, you can request mentors, schedule sessions and dispute evaluations.", { pinned: true }),
    R("Mentor onboarding week", "announcement", "Community", "New mentors are being verified this week.", "If you applied as a mentor or expert, our team will verify your profile within 48 hours.", { audience: ["mentor", "industry_expert"] }),
    R("Lean Canvas Template", "template", "Strategy", "One-page business model template.", "Problem · Solution · Unique Value Proposition · Unfair Advantage · Customer Segments · Key Metrics · Channels · Cost Structure · Revenue Streams. Fill each box in one or two bullet points."),
    R("Customer Interview Script", "template", "Research", "20 questions for problem-discovery interviews.", "1. Tell me about the last time you faced <problem>.\n2. What did you do about it?\n3. What did it cost you?\n4. What have you tried?\n5. Would you pay to solve it? How much?"),
    R("Pitch Deck Outline", "template", "Fundraising", "The 10 slides investors expect.", "Problem, Solution, Market, Product, Traction, Business model, Go-to-market, Competition, Team, Ask."),
    R("The 8-Week MVP Playbook", "playbook", "Product", "Scope, build and launch a minimum viable product.", "Week 1–2: discovery & scope. Week 3–6: build the single core workflow. Week 7: closed beta with 10 users. Week 8: measure activation and decide: iterate, pivot or persevere."),
    R("Mentoring Playbook: Running a Great First Session", "playbook", "Mentoring", "A repeatable structure for mentors.", "Agenda → Founder goals → Reality check → Next-step commitments → Written summary within 24h.", { audience: ["mentor", "admin"] }),
    R("Evaluation Rubric Guide", "playbook", "Evaluation", "How to score the six criteria consistently.", "Problem, Market, Innovation, Execution, Scalability and Team are scored 0–10. 5 = average early-stage idea; 8+ requires clear evidence. Always justify extremes.", { audience: ["industry_expert", "admin"] }),
    R("Understanding TAM, SAM and SOM", "article", "Market", "Size your market the right way.", "Start bottom-up: number of reachable customers × realistic annual revenue per customer. Avoid top-down 1%-of-a-huge-market arguments."),
  ]);
  const saver = await Resource.findOne({ title: "Lean Canvas Template" });
  saver.savedBy = [U.f1._id, U.f2._id]; await saver.save();

  await Report.create({ targetType: "idea", target: swipe._id, idea: swipe._id, reporter: U.f2._id, reason: "Spam / low effort", details: "Looks like a copy of an existing social app with no new angle." });
  await Idea.updateOne({ _id: swipe._id }, { flagged: true });
  await Report.create({ targetType: "feedback", target: gBad._id, idea: krishi._id, reporter: U.f1._id, reason: "Harmful advice", details: "Telling founders to skip customer interviews is unhelpful." });
  await Report.create({ targetType: "user", target: U.blocked._id, reporter: U.f4._id, reason: "Harassment", details: "Sent unsolicited promotional messages." });
  await Report.create({ targetType: "idea", target: thali._id, idea: thali._id, reporter: U.f5._id, reason: "Possible duplicate", details: "Very similar to an idea submitted last week.", status: "dismissed", resolution: "Not a duplicate.", resolvedBy: U.mod._id, resolvedAt: ago(1) });

  await Request.create([
    { type: "mentor_request", requester: U.f4._id, idea: thali._id, note: "I need help with supply-chain and unit economics." },
    { type: "mentor_request", requester: U.f5._id, idea: ship._id, note: "Looking for someone with D2C SaaS experience." },
    { type: "role_change", requester: U.f3._id, requestedRole: "mentor", note: "I've scaled two fintech startups and would like to mentor." },
    { type: "mentor_request", requester: U.f1._id, idea: krishi._id, note: "Need an additional mentor for fundraising.", status: "approved", decidedBy: U.admin._id, decidedAt: ago(15), decisionNote: "Assigned Rohan." },
  ]);

  const N = (u, type, title, message, link, read = false, days = 0) => ({ user: u._id, type, title, message, link, read, createdAt: ago(days, Math.random() * 5) });
  await Notification.create([
    N(U.f1, "feedback", "New mentor guidance", "Rohan Sharma left guidance on KrishiMitra AI", `/app/ideas/${krishi._id}`, false, 0),
    N(U.f1, "session", "Mentoring session scheduled", "Pilot planning with FPOs · in 2 days", `/app/ideas/${krishi._id}`, false, 1),
    N(U.f1, "success", "Your idea was approved! 🎉", "KrishiMitra AI – Smart Crop Advisory", `/app/ideas/${krishi._id}`, true, 20),
    N(U.f2, "idea", "Changes were requested on your idea", "StudyPod: Please clarify the revenue model", `/app/ideas/${study._id}`, false, 2),
    N(U.f3, "warning", "Your evaluation dispute was received", "The evaluator has been asked to re-evaluate", `/app/ideas/${kirana._id}`, false, 1),
    N(U.admin, "idea", "New idea awaiting review", "ShipEasy – Returns Automation scored well", `/app/ideas/${ship._id}`, false, 0),
    N(U.admin, "warning", "New verification request", "Neha Kapoor registered as mentor", "/app/pending", false, 1),
    N(U.admin, "warning", "Mentor requested", "Sana Khan wants a mentor for ThaliBox", "/app/requests", false, 1),
    N(U.mentor, "idea", "New mentoring assignment", "PayKirana – UPI Credit for Neighbourhood Stores", "/app/assignments", false, 2),
    N(U.expert, "warning", "Your evaluation was disputed", "PayKirana: scorecard ignored our NBFC partner's model", "/app/disputes", false, 1),
    N(U.expert, "idea", "New evaluation assigned", "QuickScan – Instant Health Check Kiosks", "/app/evaluations", false, 3),
    N(U.mod, "warning", "New content report", "idea reported: Spam / low effort", "/app/mod-ideas", false, 1),
    N(U.super, "system", "System healthy", "All services are operational", "/app", true, 1),
  ]);

  const L = (kind, level, actor, action, target, message, days) => ({ kind, level, actor: actor?._id, actorName: actor?.name, actorRole: actor?.role, action, target, message, createdAt: ago(days, Math.random() * 6) });
  await Log.create([
    L("audit", "info", U.f1, "idea.created", krishi.title, "Score " + krishi.report.score, 22),
    L("audit", "info", U.admin, "idea.approve", krishi.title, "", 21),
    L("audit", "info", U.admin, "idea.assigned", krishi.title, "mentor -> Rohan Sharma", 18),
    L("audit", "info", U.expert2, "feedback.evaluated", krishi.title, "Score 80", 17),
    L("audit", "info", U.f2, "report.created", `idea:${swipe._id}`, "Spam / low effort", 3),
    L("audit", "info", U.mod, "report.dismiss", `idea:${thali._id}`, "Not a duplicate.", 1),
    L("system", "info", null, "server.started", "", "API listening", 3),
    L("system", "warn", null, "ai.gemini_failed", "ShipEasy", "Gemini API error 429 - fell back to demo analysis", 2),
    L("system", "error", null, "server.error", "", "POST /api/ideas: timeout while contacting webhook", 1),
    L("system", "info", null, "webhook.delivery", "", "idea.created -> 200", 1),
  ]);
  summary();
};

const summary = async () => {
  console.log("\nDemo accounts");
  console.table(USERS.map((u) => ({ role: u.role, email: u.email, password: u.password })));
};

run().then(() => mongoose.disconnect()).catch((e) => { console.error(e); process.exit(1); });
