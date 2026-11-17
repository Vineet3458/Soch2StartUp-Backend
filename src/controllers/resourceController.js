import Resource from "../models/Resource.js";
import User from "../models/User.js";
import { ROLES } from "../config/roles.js";
import { hasPermission } from "../services/configService.js";
import { audit } from "../services/logger.js";
import { notify } from "../services/notify.js";
import { emit } from "../services/realtime.js";
import { httpError, escapeRegex, str, needId } from "../utils.js";

const KINDS = ["guideline", "template", "playbook", "announcement", "article"];

export const listResources = async (req, res) => {
  const { kind, q, saved } = req.query;
  const filter = {};
  const manager = hasPermission(req.user.role, "resources.manage");
  if (!manager) filter.$or = [{ audience: { $size: 0 } }, { audience: req.user.role }];
  if (kind) filter.kind = kind;
  if (saved === "true") filter.savedBy = req.user._id;
  if (q) { const rx = new RegExp(escapeRegex(q), "i"); filter.$and = [{ $or: [{ title: rx }, { summary: rx }, { body: rx }] }]; }
  const rows = await Resource.find(filter).sort("-pinned -createdAt").limit(300);
  res.json(rows.map((r) => ({ ...r.toJSON(), saved: r.savedBy.some((u) => String(u) === String(req.user._id)), saveCount: r.savedBy.length, savedBy: undefined })));
};

const body = (b) => {
  const out = { title: str(b.title, 140), kind: KINDS.includes(b.kind) ? b.kind : "article", category: str(b.category, 40) || "General", summary: str(b.summary, 300), body: str(b.body, 8000), pinned: Boolean(b.pinned) };
  out.audience = [].concat(b.audience || []).filter((r) => Object.values(ROLES).includes(r));
  if (!out.title) throw httpError(400, "Title is required");
  return out;
};

export const createResource = async (req, res) => {
  const r = await Resource.create({ ...body(req.body), author: req.user._id, authorName: req.user.name });
  audit(req.user, "resource.created", r.title, r.kind);
  if (r.kind === "announcement") {
    const filter = { isActive: true, _id: { $ne: req.user._id } };
    if (r.audience.length) filter.role = { $in: r.audience };
    const users = await User.find(filter).select("_id");
    notify(users.map((u) => u._id), { type: "system", title: `📢 ${r.title}`, message: r.summary, link: "/app/resources?kind=announcement" });
  }
  emit("resources", "create", r._id);
  res.status(201).json(r);
};

export const updateResource = async (req, res) => {
  const r = await Resource.findByIdAndUpdate(needId(req.params.id), body(req.body), { new: true });
  if (!r) throw httpError(404, "Resource not found");
  audit(req.user, "resource.updated", r.title);
  emit("resources", "update", r._id);
  res.json(r);
};

export const deleteResource = async (req, res) => {
  const r = await Resource.findByIdAndDelete(needId(req.params.id));
  if (!r) throw httpError(404, "Resource not found");
  audit(req.user, "resource.deleted", r.title);
  emit("resources", "delete", r._id);
  res.json({ message: "Resource deleted" });
};

export const toggleSave = async (req, res) => {
  const r = await Resource.findById(needId(req.params.id));
  if (!r) throw httpError(404, "Resource not found");
  const has = r.savedBy.some((u) => String(u) === String(req.user._id));
  r.savedBy = has ? r.savedBy.filter((u) => String(u) !== String(req.user._id)) : [...r.savedBy, req.user._id];
  await r.save();
  emit("resources", "update", r._id);
  res.json({ saved: !has });
};
