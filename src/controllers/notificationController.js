import Notification from "../models/Notification.js";
import { emitTo } from "../services/realtime.js";
import { needId } from "../utils.js";

const touch = (userId) => emitTo(String(userId), "change", { topic: "notifications", action: "update" });

export const listNotifications = async (req, res) => {
  const items = await Notification.find({ user: req.user._id }).sort("-createdAt").limit(100);
  res.json({ items, unread: items.filter((n) => !n.read).length });
};
export const markRead = async (req, res) => {
  await Notification.updateOne({ _id: needId(req.params.id), user: req.user._id }, { read: true });
  touch(req.user._id); res.json({ ok: true });
};
export const markAllRead = async (req, res) => { await Notification.updateMany({ user: req.user._id, read: false }, { read: true }); touch(req.user._id); res.json({ ok: true }); };
export const removeOne = async (req, res) => { await Notification.deleteOne({ _id: needId(req.params.id), user: req.user._id }); touch(req.user._id); res.json({ ok: true }); };
export const clearRead = async (req, res) => { await Notification.deleteMany({ user: req.user._id, read: true }); touch(req.user._id); res.json({ ok: true }); };
