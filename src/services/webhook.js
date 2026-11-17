import { getConfig } from "./configService.js";
import { syslog } from "./logger.js";

// Fire-and-forget outgoing webhook (configured by the superadmin under Integrations)
export const fireWebhook = async (event, payload) => {
  const cfg = getConfig("integrations")?.webhook;
  if (!cfg?.enabled || !cfg.url || !(cfg.events || []).includes(event)) return;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(cfg.url, {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "X-Soch2Startup-Event": event },
      body: JSON.stringify({ event, at: new Date().toISOString(), data: payload }),
    });
    clearTimeout(timer);
    syslog(res.ok ? "info" : "warn", "webhook.delivery", `${event} -> ${res.status}`, cfg.url);
  } catch (e) {
    syslog("error", "webhook.failed", `${event}: ${e.message}`, cfg.url);
  }
};

export const testWebhook = async (url) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "webhook.test", at: new Date().toISOString() }) });
    return { ok: res.ok, status: res.status, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, error: e.message };
  } finally { clearTimeout(timer); }
};
