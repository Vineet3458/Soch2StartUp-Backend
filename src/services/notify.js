import Notification from "../models/Notification.js";
import { emitTo } from "./realtime.js";

// Creates a persisted notification AND pushes it to the user's open browser tabs instantly
export const notify = async (userIds, { type = "info", title, message = "", link = "" }) => {
  const ids = [...new Set([].concat(userIds).filter(Boolean).map(String))];
  if (!ids.length) return;
  const docs = await Notification.insertMany(ids.map((user) => ({ user, type, title, message, link })));
  emitTo(ids, "change", { topic: "notifications", action: "create" });
  for (const d of docs) emitTo(String(d.user), "toast", { id: String(d._id), type, title, message, link });
};
