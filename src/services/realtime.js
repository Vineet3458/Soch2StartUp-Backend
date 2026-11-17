// Server-Sent Events hub. Every mutation calls emit(); browsers then re-fetch what changed.
// Events carry only { topic, action, id } - never private data - so broadcasting is safe.
const clients = new Set(); // { res, userId, role, isPublic }

export const addClient = (res, user) => {
  const client = { res, userId: user ? String(user._id) : null, role: user?.role || null, isPublic: !user };
  clients.add(client);
  return () => clients.delete(client);
};

const write = (client, event, data) => {
  try { client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { clients.delete(client); }
};

// Public (logged-out) clients only ever receive "config" changes so the landing page stays live.
export const emit = (topic, action = "update", id = null) => {
  for (const c of clients) {
    if (c.isPublic && topic !== "config") continue;
    write(c, "change", { topic, action, id: id ? String(id) : null, at: Date.now() });
  }
};

export const emitTo = (userIds, event, data) => {
  const set = new Set([].concat(userIds).filter(Boolean).map(String));
  for (const c of clients) if (c.userId && set.has(c.userId)) write(c, event, data);
};

export const heartbeat = () => { for (const c of clients) { try { c.res.write(": ping\n\n"); } catch { clients.delete(c); } } };
setInterval(heartbeat, 25000).unref();

export const clientCount = () => clients.size;
export const onlineUserIds = () => [...new Set([...clients].map((c) => c.userId).filter(Boolean))];
