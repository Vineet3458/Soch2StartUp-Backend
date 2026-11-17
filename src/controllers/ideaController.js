import Idea from "../models/Idea.js";
import User from "../models/User.js";
import Assignment from "../models/Assignment.js";
import Feedback from "../models/Feedback.js";
import Session from "../models/Session.js";
import Report from "../models/Report.js";
import Request from "../models/Request.js";
import { ROLES, ADMIN_ROLES, STAFF_ROLES } from "../config/roles.js";
import { analyzeIdea } from "../services/aiService.js";
import { getConfig, hasPermission } from "../services/configService.js";
import { audit } from "../services/logger.js";
import { notify } from "../services/notify.js";
import { emit } from "../services/realtime.js";
import { fireWebhook } from "../services/webhook.js";
import { httpError, escapeRegex, str, needId } from "../utils.js";

const isOwner = (idea, user) => String(idea.user?._id || idea.user) === String(user._id);
const canSee = (idea, user) => isOwner(idea, user) || (STAFF_ROLES.includes(user.role) && idea.status !== "draft");

const validateCore = (body) => {
  const title = str(body.title, 120), description = str(body.description, 4000), industry = str(body.industry, 40);
  if (!title || !description || !industry) throw httpError(400, "Title, description and industry are required");
  if (description.length < 30) throw httpError(400, "Please describe your idea in at least 30 characters");
  const cat = getConfig("categories").find((c) => c.name === industry);
  if (!cat || !cat.enabled) throw httpError(400, "That industry category is not available");
  return { title, description, industry, budget: str(body.budget, 40) || "Not specified", teamSize: str(body.teamSize, 40) || "Not specified" };
};

const adminIds = async (perm) => (await User.find({ role: { $in: ADMIN_ROLES }, isActive: true }).select("_id role")).filter((u) => hasPermission(u.role, perm)).map((u) => u._id);

// Adds assignments, feedback counts and expert score summary to a list of ideas
const decorate = async (ideas) => {
  const ids = ideas.map((i) => i._id);
  const [assignments, fbRows] = await Promise.all([
    Assignment.find({ idea: { $in: ids } }).populate("assignee", "name role"),
    Feedback.find({ idea: { $in: ids }, status: "published" }).select("idea kind score").lean(),
  ]);
  const fbMap = {};
  for (const f of fbRows) {
    const g = (fbMap[String(f.idea)] ||= { n: 0, evals: 0, sum: 0 });
    g.n++;
    if (f.kind === "evaluation" && f.score != null) { g.evals++; g.sum += f.score; }
  }
  return ideas.map((i) => {
    const o = i.toJSON();
    const f = fbMap[String(i._id)];
    o.assignments = assignments.filter((a) => String(a.idea) === String(i._id)).map((a) => a.toJSON());
    o.feedbackCount = f?.n || 0;
    o.expertScore = f?.evals ? Math.round(f.sum / f.evals) : null;
    return o;
  });
};

export const createIdea = async (req, res) => {
  const core = validateCore(req.body);
  const asDraft = req.body.saveAsDraft === true;
  let report, status = "draft";
  if (!asDraft) {
    if (!getConfig("features").aiValidation) throw httpError(403, "AI validation is currently disabled. You can save your idea as a draft.");
    report = await analyzeIdea(core);
    status = "submitted";
  }
  const idea = await Idea.create({ ...core, user: req.user._id, status, report });
  audit(req.user, asDraft ? "idea.drafted" : "idea.created", idea.title, report ? `Score ${report.score} (${report.verdict})` : "Saved as draft");
  emit("ideas", "create", idea._id);
  if (!asDraft) {
    notify(await adminIds("ideas.review"), { type: "idea", title: "New idea awaiting review", message: `"${idea.title}" scored ${report.score} (${report.verdict}).`, link: `/app/ideas/${idea._id}` });
    fireWebhook("idea.created", { id: idea._id, title: idea.title, score: report.score, verdict: report.verdict });
  }
  res.status(201).json(idea);
};

export const listIdeas = async (req, res) => {
  const { status, industry, q, mine, assigned } = req.query;
  const filter = {};
  const staff = STAFF_ROLES.includes(req.user.role);
  if (!staff || mine === "true") filter.user = req.user._id;
  else filter.$or = [{ status: { $ne: "draft" } }, { user: req.user._id }];
  if (assigned === "true") {
    const a = await Assignment.find({ assignee: req.user._id }).select("idea");
    filter._id = { $in: a.map((x) => x.idea) };
  }
  if (status) filter.status = status;
  if (industry) filter.industry = industry;
  if (q) { const rx = new RegExp(escapeRegex(q), "i"); filter.$and = [{ $or: [{ title: rx }, { description: rx }] }]; }
  const ideas = await Idea.find(filter).populate("user", "name email role").sort("-createdAt").limit(500);
  res.json(await decorate(ideas));
};

export const getIdea = async (req, res) => {
  const idea = await Idea.findById(needId(req.params.id)).populate("user", "name email role").populate("reviewedBy", "name");
  if (!idea) throw httpError(404, "Idea not found");
  if (!canSee(idea, req.user)) throw httpError(403, "Access denied");
  const moderator = hasPermission(req.user.role, "reports.moderate");
  const [assignments, feedback, sessions, openReports, pendingRequest] = await Promise.all([
    Assignment.find({ idea: idea._id }).populate("assignee", "name role"),
    Feedback.find({ idea: idea._id, ...(moderator ? {} : { status: "published" }) }).sort("-createdAt"),
    Session.find({ idea: idea._id }).populate("mentor", "name").sort("scheduledAt"),
    moderator ? Report.countDocuments({ target: idea._id, status: "open" }) : 0,
    Request.findOne({ idea: idea._id, type: "mentor_request", status: "pending" }),
  ]);
  res.json({ ...idea.toJSON(), assignments, feedback, sessions, openReports, pendingMentorRequest: Boolean(pendingRequest) });
};

// Owner edits a draft (or an idea sent back for changes). Saving a changes_requested idea re-validates it.
export const updateIdea = async (req, res) => {
  const idea = await Idea.findById(needId(req.params.id));
  if (!idea) throw httpError(404, "Idea not found");
  if (!isOwner(idea, req.user)) throw httpError(403, "Only the owner can edit this idea");
  if (!["draft", "changes_requested"].includes(idea.status)) throw httpError(400, "Only drafts or ideas sent back for changes can be edited");
  Object.assign(idea, validateCore({ ...idea.toObject(), ...req.body }));
  if (req.body.submit === true || idea.status === "changes_requested") {
    if (!getConfig("features").aiValidation) throw httpError(403, "AI validation is currently disabled");
    idea.report = await analyzeIdea(idea);
    idea.status = "submitted";
    idea.reviewNote = "";
    notify(await adminIds("ideas.review"), { type: "idea", title: "Idea resubmitted", message: `"${idea.title}" is ready for review again.`, link: `/app/ideas/${idea._id}` });
  }
  await idea.save();
  audit(req.user, "idea.updated", idea.title, `status ${idea.status}`);
  emit("ideas", "update", idea._id);
  res.json(idea);
};

export const reanalyze = async (req, res) => {
  const idea = await Idea.findById(needId(req.params.id));
  if (!idea) throw httpError(404, "Idea not found");
  if (!isOwner(idea, req.user) && !hasPermission(req.user.role, "ideas.review")) throw httpError(403, "Access denied");
  if (idea.status === "draft") throw httpError(400, "Submit the draft first");
  if (!getConfig("features").aiValidation) throw httpError(403, "AI validation is currently disabled");
  idea.report = await analyzeIdea(idea);
  await idea.save();
  audit(req.user, "idea.reanalyzed", idea.title, `Score ${idea.report.score}`);
  emit("ideas", "update", idea._id);
  res.json(idea);
};

export const updatePlan = async (req, res) => {
  const idea = await Idea.findById(needId(req.params.id));
  if (!idea) throw httpError(404, "Idea not found");
  if (!isOwner(idea, req.user)) throw httpError(403, "Only the owner can edit the business plan");
  const keys = ["problem", "solution", "customers", "revenue", "goToMarket", "financials", "team"];
  for (const k of keys) if (req.body[k] !== undefined) idea.plan[k] = str(req.body[k], 2000);
  await idea.save();
  emit("ideas", "update", idea._id);
  res.json(idea);
};

export const updateRoadmap = async (req, res) => {
  const idea = await Idea.findById(needId(req.params.id));
  if (!idea) throw httpError(404, "Idea not found");
  if (!isOwner(idea, req.user)) throw httpError(403, "Only the owner can edit the roadmap");
  if (!Array.isArray(req.body.roadmap)) throw httpError(400, "roadmap must be an array");
  idea.roadmap = req.body.roadmap.slice(0, 40).map((m) => ({
    ...(m._id ? { _id: m._id } : {}), title: str(m.title, 120), description: str(m.description, 400),
    due: m.due ? new Date(m.due) : undefined, status: ["todo", "doing", "done"].includes(m.status) ? m.status : "todo",
  })).filter((m) => m.title);
  await idea.save();
  emit("ideas", "update", idea._id);
  res.json(idea);
};

export const deleteIdea = async (req, res) => {
  const idea = await Idea.findById(needId(req.params.id));
  if (!idea) throw httpError(404, "Idea not found");
  if (!isOwner(idea, req.user) && !hasPermission(req.user.role, "ideas.delete")) throw httpError(403, "You cannot delete this idea");
  await Promise.all([idea.deleteOne(), Assignment.deleteMany({ idea: idea._id }), Feedback.deleteMany({ idea: idea._id }), Session.deleteMany({ idea: idea._id }), Report.deleteMany({ idea: idea._id }), Request.deleteMany({ idea: idea._id })]);
  audit(req.user, "idea.deleted", idea.title);
  if (!isOwner(idea, req.user)) notify(idea.user, { type: "warning", title: "Your idea was removed", message: `"${idea.title}" was deleted by an administrator.` });
  for (const t of ["ideas", "assignments", "feedback", "sessions", "reports", "requests"]) emit(t, "delete", idea._id);
  res.json({ message: "Idea deleted" });
};

// GET /api/ideas/compare?ids=a,b
export const compareIdeas = async (req, res) => {
  const ids = (req.query.ids || "").split(",").filter(Boolean).slice(0, 2);
  ids.forEach((i) => needId(i));
  const ideas = await Idea.find({ _id: { $in: ids }, report: { $exists: true } }).populate("user", "name email role");
  res.json(ideas.filter((i) => canSee(i, req.user)));
};

// Admin approves / rejects / sends back
export const reviewIdea = async (req, res) => {
  const map = { approve: "approved", reject: "rejected", changes: "changes_requested", review: "under_review", reopen: "submitted" };
  const status = map[req.body.decision];
  if (!status) throw httpError(400, "Decision must be approve, reject, changes, review or reopen");
  const idea = await Idea.findById(needId(req.params.id));
  if (!idea) throw httpError(404, "Idea not found");
  if (idea.status === "draft") throw httpError(400, "Drafts cannot be reviewed");
  const note = str(req.body.note, 600);
  if (["reject", "changes"].includes(req.body.decision) && !note) throw httpError(400, "Please add a note explaining your decision");
  idea.status = status; idea.reviewNote = note; idea.reviewedBy = req.user._id; idea.reviewedAt = new Date();
  await idea.save();
  audit(req.user, `idea.${req.body.decision}`, idea.title, note);
  const msg = { approved: "Your idea was approved! 🎉", rejected: "Your idea was not approved.", changes_requested: "Changes were requested on your idea.", under_review: "Your idea is now under review.", submitted: "Your idea was reopened." }[status];
  notify(idea.user, { type: status === "approved" ? "success" : status === "rejected" ? "warning" : "idea", title: msg, message: note ? `"${idea.title}": ${note}` : `"${idea.title}"`, link: `/app/ideas/${idea._id}` });
  emit("ideas", "update", idea._id);
  fireWebhook("idea.reviewed", { id: idea._id, title: idea.title, status });
  res.json(idea);
};

export const assign = async (req, res) => {
  const idea = await Idea.findById(needId(req.params.id));
  if (!idea) throw httpError(404, "Idea not found");
  const kind = req.body.kind === "evaluation" ? "evaluation" : "mentor";
  const assignee = await User.findById(needId(req.body.userId, "user id"));
  const wanted = kind === "mentor" ? ROLES.MENTOR : ROLES.EXPERT;
  if (!assignee || assignee.role !== wanted || !assignee.isActive) throw httpError(400, `Choose an active ${wanted.replace("_", " ")}`);
  if (!assignee.verified) throw httpError(400, "That user is not verified yet");
  if (idea.status === "draft") throw httpError(400, "Drafts cannot be assigned");
  const a = await Assignment.findOneAndUpdate(
    { idea: idea._id, assignee: assignee._id, kind },
    { $setOnInsert: { stage: "assigned" }, assignedBy: req.user._id, dueDate: req.body.dueDate || undefined, note: str(req.body.note, 400) },
    { upsert: true, new: true }
  );
  audit(req.user, "idea.assigned", idea.title, `${kind} -> ${assignee.name}`);
  notify(assignee._id, { type: "idea", title: kind === "mentor" ? "New mentoring assignment" : "New evaluation assigned", message: `"${idea.title}" (${idea.industry})`, link: kind === "mentor" ? "/app/assignments" : "/app/evaluations" });
  if (kind === "mentor") notify(idea.user, { type: "success", title: "A mentor was assigned", message: `${assignee.name} will mentor "${idea.title}".`, link: `/app/ideas/${idea._id}` });
  emit("assignments", "create", a._id); emit("ideas", "update", idea._id);
  res.status(201).json(a);
};

// Mentors / experts pick up an idea themselves from the open pool
export const claim = async (req, res) => {
  const idea = await Idea.findById(needId(req.params.id));
  if (!idea || idea.status === "draft") throw httpError(404, "Idea not found");
  const kind = req.user.role === ROLES.EXPERT ? "evaluation" : req.user.role === ROLES.MENTOR ? "mentor" : null;
  if (!kind) throw httpError(403, "Only mentors and experts can claim ideas");
  if (!req.user.verified) throw httpError(403, "Your account is awaiting admin verification");
  const a = await Assignment.findOneAndUpdate({ idea: idea._id, assignee: req.user._id, kind }, { $setOnInsert: { stage: "assigned", assignedBy: req.user._id } }, { upsert: true, new: true });
  audit(req.user, "idea.claimed", idea.title, kind);
  notify(idea.user, { type: "success", title: kind === "mentor" ? "A mentor picked up your idea" : "An expert is evaluating your idea", message: `${req.user.name} → "${idea.title}"`, link: `/app/ideas/${idea._id}` });
  emit("assignments", "create", a._id); emit("ideas", "update", idea._id);
  res.status(201).json(a);
};

export const requestMentor = async (req, res) => {
  if (!getConfig("features").mentorRequests) throw httpError(403, "Mentor requests are currently disabled");
  const idea = await Idea.findById(needId(req.params.id));
  if (!idea) throw httpError(404, "Idea not found");
  if (!isOwner(idea, req.user)) throw httpError(403, "Only the owner can request a mentor");
  if (idea.status === "draft") throw httpError(400, "Submit your idea before requesting a mentor");
  if (await Request.findOne({ idea: idea._id, type: "mentor_request", status: "pending" })) throw httpError(400, "You already have a pending mentor request for this idea");
  const r = await Request.create({ type: "mentor_request", requester: req.user._id, idea: idea._id, note: str(req.body.note, 600) });
  audit(req.user, "request.mentor", idea.title);
  notify(await adminIds("ideas.assign"), { type: "warning", title: "Mentor requested", message: `${req.user.name} wants a mentor for "${idea.title}".`, link: "/app/requests" });
  emit("requests", "create", r._id); emit("ideas", "update", idea._id);
  res.status(201).json(r);
};

