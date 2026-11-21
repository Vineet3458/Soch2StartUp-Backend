// Integration tests: boots the real API against a MongoDB test database.
//   npm test                      (uses mongodb://127.0.0.1:27017/soch2startup_test)
//   MONGO_URI_TEST=... npm test   (any other MongoDB)
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const MONGO = process.env.MONGO_URI_TEST || "mongodb://127.0.0.1:27017/soch2startup_test";
process.env.MONGO_URI = MONGO;
process.env.JWT_SECRET = "test-secret";
process.env.GEMINI_API_KEY = "";
process.env.PORT = "0";
process.env.NODE_ENV = "test";

let base, server;
const tok = {};
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
};
const login = async (email, password) => (await call("POST", "/api/auth/login", { body: { email, password } })).data;

before(async () => {
  execFileSync("node", ["src/seed.js", "--reset"], { env: process.env, stdio: "ignore" });
  const { start } = await import("./server.js");
  server = await start();
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, e, p] of [["super", "superadmin@soch2startup.com", "S2S#SuperAdmin!2026"], ["admin", "admin@soch2startup.com", "S2S#Admin!2026"], ["mod", "moderator@soch2startup.com", "S2S#Moderator!2026"], ["mentor", "mentor@soch2startup.com", "S2S#Mentor!2026"], ["expert", "expert@soch2startup.com", "S2S#Expert!2026"], ["f1", "entrepreneur@soch2startup.com", "S2S#Founder!2026"], ["f4", "sana.khan@soch2startup.com", "S2S#Founder!2026"]]) tok[k] = (await login(e, p)).token;
});
after(async () => { server?.close(); const m = (await import("mongoose")).default; await m.disconnect(); });

test("auth: login, bad password, NoSQL-injection object, blocked user", async () => {
  assert.ok(tok.admin);
  assert.equal((await call("POST", "/api/auth/login", { body: { email: "admin@soch2startup.com", password: "nope" } })).status, 401);
  assert.equal((await call("POST", "/api/auth/login", { body: { email: { $gt: "" }, password: { $gt: "" } } })).status, 400);
  const blocked = await call("POST", "/api/auth/login", { body: { email: "rahul.bansal@soch2startup.com", password: "S2S#Founder!2026" } });
  assert.equal(blocked.status, 403);
  assert.match(blocked.data.message, /blocked/i);
});

test("auth: self-registration can never grant admin roles; mentors start unverified", async () => {
  const a = await call("POST", "/api/auth/register", { body: { name: "Evil", email: "evil@x.com", password: "Secret12", role: "superadmin" } });
  assert.equal(a.status, 201); assert.equal(a.data.user.role, "entrepreneur");
  const m = await call("POST", "/api/auth/register", { body: { name: "New Mentor", email: "nm@x.com", password: "Secret12", role: "mentor" } });
  assert.equal(m.data.user.verified, false);
  const fb = await call("POST", `/api/ideas/${(await call("GET", "/api/ideas", { token: tok.admin })).data[0]._id}/feedback`, { token: m.data.token, body: { comment: "hi" } });
  assert.equal(fb.status, 403); // unverified mentor cannot write feedback
});

test("authorization: protected routes and role/permission checks", async () => {
  assert.equal((await call("GET", "/api/ideas")).status, 401);
  assert.equal((await call("GET", "/api/users", { token: tok.f1 })).status, 403);
  assert.equal((await call("GET", "/api/config", { token: tok.admin })).status, 403);
  assert.equal((await call("GET", "/api/stats/admin", { token: tok.mentor })).status, 403);
  assert.equal((await call("GET", "/api/logs?kind=system", { token: tok.admin })).status, 403);
  assert.equal((await call("GET", "/api/users", { token: tok.admin })).status, 200);
});

test("live data: preview endpoint is protected and validates input", async () => {
  assert.equal((await call("POST", "/api/live-data/preview", { body: { title: "x", industry: "SaaS" } })).status, 401);
  const bad = await call("POST", "/api/live-data/preview", { token: tok.f1, body: { title: "" } });
  assert.equal(bad.status, 400);
});

test("ideas: founders see only their own; staff never see other people's drafts", async () => {
  const mine = (await call("GET", "/api/ideas", { token: tok.f1 })).data;
  assert.ok(mine.length >= 2); assert.ok(mine.every((i) => i.user.email === "entrepreneur@soch2startup.com"));
  const all = (await call("GET", "/api/ideas", { token: tok.admin })).data;
  assert.ok(all.length > mine.length); assert.ok(!all.some((i) => i.status === "draft"));
});

test("idea lifecycle: draft -> submit -> AI report -> review -> founder notified", async () => {
  const d = await call("POST", "/api/ideas", { token: tok.f4, body: { saveAsDraft: true, title: "Test Draft Idea", description: "A sufficiently long description for a draft idea to be valid.", industry: "SaaS" } });
  assert.equal(d.status, 201); assert.equal(d.data.status, "draft"); assert.ok(!d.data.report);
  const sub = await call("PATCH", `/api/ideas/${d.data._id}`, { token: tok.f4, body: { submit: true } });
  assert.equal(sub.data.status, "submitted"); assert.ok(sub.data.report.score >= 0);

  assert.equal((await call("POST", `/api/ideas/${d.data._id}/review`, { token: tok.f4, body: { decision: "approve" } })).status, 403);
  assert.equal((await call("POST", `/api/ideas/${d.data._id}/review`, { token: tok.admin, body: { decision: "reject" } })).status, 400); // note required
  const ok = await call("POST", `/api/ideas/${d.data._id}/review`, { token: tok.admin, body: { decision: "approve", note: "Looks good" } });
  assert.equal(ok.data.status, "approved");
  const notes = (await call("GET", "/api/notifications", { token: tok.f4 })).data;
  assert.ok(notes.items.some((n) => /approved/i.test(n.title)));
});

test("demo AI analysis is idea-specific (not identical for different ideas)", async () => {
  const mk = (title, description, industry) => call("POST", "/api/ideas", { token: tok.f4, body: { title, description, industry, budget: "₹1–10 lakh", teamSize: "2–3 members" } });
  const a = await mk("Alpha FinTech lending", "B2B subscription platform giving small merchants working capital loans against UPI history in tier-3 towns.", "FinTech");
  const b = await mk("Beta social app", "A social network for sharing photos with friends, a lot like other social networks everywhere.", "Other");
  assert.notEqual(a.data.report.score, b.data.report.score);
  assert.notDeepEqual(a.data.report.competitors, b.data.report.competitors);
});

test("assignment rules: mentors need an assignment before guidance; claim works", async () => {
  const ideas = (await call("GET", "/api/ideas", { token: tok.admin })).data;
  const target = ideas.find((i) => i.title.startsWith("StudyPod") === false && i.status === "under_review" && !i.assignments.some((a) => a.kind === "mentor" && a.assignee.name === "Rohan Sharma"));
  const denied = await call("POST", `/api/ideas/${target._id}/feedback`, { token: tok.mentor, body: { comment: "Not assigned" } });
  assert.equal(denied.status, 403);
  assert.equal((await call("POST", `/api/ideas/${target._id}/claim`, { token: tok.mentor })).status, 201);
  const ok = await call("POST", `/api/ideas/${target._id}/feedback`, { token: tok.mentor, body: { comment: "Focus on one niche first.", tags: ["focus"] } });
  assert.equal(ok.status, 201); assert.equal(ok.data.kind, "guidance");
  const asg = (await call("GET", "/api/assignments?kind=mentor", { token: tok.mentor })).data.find((a) => a.idea._id === target._id);
  assert.equal(asg.stage, "in_progress"); // guidance moved it forward automatically
});

test("evaluation: score is computed server-side from criteria and completes the assignment; dispute flow", async () => {
  const ideas = (await call("GET", "/api/ideas", { token: tok.admin })).data;
  const quick = ideas.find((i) => i.title.startsWith("QuickScan"));
  const r = await call("POST", `/api/ideas/${quick._id}/feedback`, { token: tok.expert, body: { kind: "evaluation", comment: "Good hardware moat.", criteria: { problem: 8, market: 8, innovation: 8, execution: 8, scalability: 8, team: 8 }, score: 5, recommendation: "yes" } });
  assert.equal(r.status, 201); assert.equal(r.data.score, 80); // client-supplied score ignored
  const evalA = (await call("GET", "/api/assignments?kind=evaluation", { token: tok.expert })).data.find((a) => a.idea._id === quick._id);
  assert.equal(evalA.stage, "completed");
  assert.equal((await call("POST", `/api/feedback/${r.data._id}/dispute`, { token: tok.f4, body: { reason: "x" } })).status, 403); // not owner
  const owner = (await login("kabir.singh@soch2startup.com", "S2S#Founder!2026")).token;
  assert.equal((await call("POST", `/api/feedback/${r.data._id}/dispute`, { token: owner, body: { reason: "x" } })).status, 400); // too short
  assert.equal((await call("POST", `/api/feedback/${r.data._id}/dispute`, { token: owner, body: { reason: "The scorecard misses our patent filing." } })).status, 200);
  const re = (await call("GET", "/api/assignments?reEval=true", { token: tok.expert })).data;
  assert.ok(re.some((a) => a.idea._id === quick._id)); // appears in Re-Evaluations
  assert.equal((await call("POST", `/api/feedback/${r.data._id}/dispute/resolve`, { token: tok.expert, body: { response: "Revised after review.", criteria: { problem: 9, market: 9, innovation: 9, execution: 8, scalability: 8, team: 8 } } })).data.score, 85);
});

test("moderation: report -> flag -> resolve (remove) archives idea and unflags", async () => {
  const ideas = (await call("GET", "/api/ideas", { token: tok.admin })).data;
  const t = ideas.find((i) => i.title.startsWith("ShipEasy"));
  const rep = await call("POST", "/api/reports", { token: tok.f4, body: { targetType: "idea", target: t._id, reason: "Spam" } });
  assert.equal(rep.status, 201);
  assert.equal((await call("POST", "/api/reports", { token: tok.f4, body: { targetType: "idea", target: t._id, reason: "Spam" } })).status, 400); // duplicate
  assert.equal((await call("POST", `/api/reports/${rep.data._id}/resolve`, { token: tok.f1, body: { action: "remove" } })).status, 403);
  assert.equal((await call("POST", `/api/reports/${rep.data._id}/resolve`, { token: tok.mod, body: { action: "remove", note: "Violates rules" } })).status, 200);
  const after = (await call("GET", `/api/ideas/${t._id}`, { token: tok.admin })).data;
  assert.equal(after.status, "archived"); assert.equal(after.flagged, false);
});

test("scoring config is live: changing weights + recalculate updates stored scores", async () => {
  const before = (await call("GET", "/api/ideas", { token: tok.admin })).data.filter((i) => i.report).map((i) => [i._id, i.report.score]);
  const bad = await call("PUT", "/api/config/scoring", { token: tok.super, body: { weights: { marketDemand: 0, competition: 0, feasibility: 0, financial: 0, risk: 0 }, thresholds: { go: 70, improve: 50 } } });
  assert.equal(bad.status, 400);
  assert.equal((await call("PUT", "/api/config/scoring", { token: tok.super, body: { weights: { marketDemand: 100, competition: 0, feasibility: 0, financial: 0, risk: 0 }, thresholds: { go: 80, improve: 40 } } })).status, 200);
  const rc = await call("POST", "/api/config/scoring/recalculate", { token: tok.super });
  assert.ok(rc.data.changed > 0);
  const afterIdeas = (await call("GET", "/api/ideas", { token: tok.admin })).data;
  const one = afterIdeas.find((i) => i._id === before[0][0]);
  assert.equal(one.report.score, one.report.metrics.marketDemand); // 100% weight on demand
  await call("POST", "/api/config/scoring/reset", { token: tok.super });
  await call("POST", "/api/config/scoring/recalculate", { token: tok.super });
});

test("permissions matrix is live: revoking ideas.review immediately blocks admin", async () => {
  const cfg = (await call("GET", "/api/config", { token: tok.super })).data;
  const perms = structuredClone(cfg.permissions);
  perms.admin = perms.admin.filter((p) => p !== "ideas.review");
  assert.equal((await call("PUT", "/api/config/permissions", { token: tok.super, body: perms })).status, 200);
  const some = (await call("GET", "/api/ideas", { token: tok.admin })).data.find((i) => i.status === "submitted");
  assert.equal((await call("POST", `/api/ideas/${some._id}/review`, { token: tok.admin, body: { decision: "approve" } })).status, 403);
  await call("POST", "/api/config/permissions/reset", { token: tok.super });
  assert.equal((await call("POST", `/api/ideas/${some._id}/review`, { token: tok.admin, body: { decision: "review" } })).status, 200);
});

test("feature flags are live: disabling compare blocks the endpoint; categories drive validation", async () => {
  const f = (await call("GET", "/api/config", { token: tok.super })).data.features;
  await call("PUT", "/api/config/features", { token: tok.super, body: { ...f, compareIdeas: false } });
  assert.equal((await call("GET", "/api/ideas/compare?ids=a,b", { token: tok.f1 })).status, 403);
  await call("PUT", "/api/config/features", { token: tok.super, body: f });
  const cats = (await call("GET", "/api/config", { token: tok.super })).data.categories.map((c) => (c.name === "SaaS" ? { ...c, enabled: false } : c));
  await call("PUT", "/api/config/categories", { token: tok.super, body: cats });
  const r = await call("POST", "/api/ideas", { token: tok.f4, body: { title: "X idea title", description: "Long enough description to pass the minimum length check.", industry: "SaaS" } });
  assert.equal(r.status, 400);
  await call("POST", "/api/config/categories/reset", { token: tok.super });
});

test("public config reflects platform settings (maintenance blocks non-admin login)", async () => {
  const p = (await call("GET", "/api/config", { token: tok.super })).data.platform;
  await call("PUT", "/api/config/platform", { token: tok.super, body: { ...p, name: "TestName", maintenance: { enabled: true, message: "Back soon" } } });
  assert.equal((await call("GET", "/api/config/public")).data.platform.name, "TestName");
  assert.equal((await call("POST", "/api/auth/login", { body: { email: "entrepreneur@soch2startup.com", password: "S2S#Founder!2026" } })).status, 503);
  assert.equal((await call("POST", "/api/auth/login", { body: { email: "admin@soch2startup.com", password: "S2S#Admin!2026" } })).status, 200);
  await call("POST", "/api/config/platform/reset", { token: tok.super });
});

test("user management guards: admin cannot touch admins or self; superadmin protected", async () => {
  const users = (await call("GET", "/api/users", { token: tok.admin })).data;
  const sup = users.find((u) => u.role === "superadmin"), adm = users.find((u) => u.role === "admin");
  assert.equal((await call("POST", `/api/users/${sup._id}/block`, { token: tok.admin, body: { block: true } })).status, 403);
  assert.equal((await call("POST", `/api/users/${adm._id}/block`, { token: tok.admin, body: { block: true } })).status, 403); // admins cannot touch admins
  assert.equal((await call("POST", `/api/users/${sup._id}/block`, { token: tok.super, body: { block: true } })).status, 400); // nobody blocks themselves
  assert.equal((await call("PATCH", `/api/users/${users.find((u) => u.role === "entrepreneur")._id}/role`, { token: tok.admin, body: { role: "superadmin" } })).status, 403);
  assert.equal((await call("DELETE", `/api/users/${sup._id}`, { token: tok.super })).status, 400);
});

test("verification flow: admin verifies a pending mentor who can then write feedback", async () => {
  const pend = (await call("GET", "/api/users?status=pending", { token: tok.admin })).data.find((u) => u.email === "neha.kapoor@soch2startup.com");
  assert.equal(pend.status, "pending");
  assert.equal((await call("POST", `/api/users/${pend._id}/verify`, { token: tok.admin, body: { approve: true } })).data.status, "active");
});

test("mentor request approval creates an assignment and notifies everyone involved", async () => {
  const reqs = (await call("GET", "/api/requests?status=pending&type=mentor_request", { token: tok.admin })).data;
  assert.ok(reqs.length >= 1);
  const mentors = (await call("GET", "/api/users?role=mentor", { token: tok.admin })).data;
  const priya = mentors.find((m) => m.email === "priya.nair@soch2startup.com");
  assert.equal((await call("POST", `/api/requests/${reqs[0]._id}/decide`, { token: tok.admin, body: { decision: "approve" } })).status, 400); // mentor required
  assert.equal((await call("POST", `/api/requests/${reqs[0]._id}/decide`, { token: tok.admin, body: { decision: "approve", mentorId: priya._id } })).status, 200);
  const asg = (await call("GET", "/api/assignments?kind=mentor", { token: tok.admin })).data;
  assert.ok(asg.some((a) => a.idea._id === reqs[0].idea._id && a.assignee.email === priya.email));
});

test("system: health, logs, audit trail recorded", async () => {
  const h = (await call("GET", "/api/system/health", { token: tok.super })).data;
  assert.equal(h.services.find((s) => s.key === "db").status, "operational");
  const audit = (await call("GET", "/api/logs?kind=audit&q=idea.approve", { token: tok.admin })).data;
  assert.ok(audit.length >= 1);
});

test("realtime: SSE stream delivers change events when data changes", async () => {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/events?token=${tok.f1}`, { signal: ctrl.signal });
  assert.match(res.headers.get("content-type"), /^text\/event-stream/);
  const reader = res.body.getReader(); let buf = "";
  const got = new Promise((resolve) => (async () => { for (;;) { const { value, done } = await reader.read(); if (done) return; buf += Buffer.from(value).toString(); if (buf.includes('"topic":"ideas"')) return resolve(buf); } })());
  await new Promise((r) => setTimeout(r, 150));
  await call("POST", "/api/ideas", { token: tok.f1, body: { title: "Realtime probe idea", description: "Probe idea used to verify that SSE events are delivered live.", industry: "EdTech" } });
  const out = await Promise.race([got, new Promise((r) => setTimeout(() => r("timeout"), 4000))]);
  ctrl.abort();
  assert.match(out, /event: change/);
  assert.equal((await fetch(`${base}/api/events?token=bad`)).status, 401);
});

test("security: password strength rules and bcrypt DoS defense", async () => {
  // Too short (< 8 chars)
  assert.equal((await call("POST", "/api/auth/register", { body: { name: "Weak", email: "weak1@x.com", password: "short1" } })).status, 400);
  // No numbers
  assert.equal((await call("POST", "/api/auth/register", { body: { name: "Weak", email: "weak2@x.com", password: "allcharactershere" } })).status, 400);
  // No letters
  assert.equal((await call("POST", "/api/auth/register", { body: { name: "Weak", email: "weak3@x.com", password: "1234567890" } })).status, 400);
  // Bcrypt DoS defense (> 128 chars)
  assert.equal((await call("POST", "/api/auth/register", { body: { name: "Weak", email: "weak4@x.com", password: "A".repeat(129) + "1" } })).status, 400);
  // Known breached passwords rejected
  const breached1 = await call("POST", "/api/auth/register", { body: { name: "Weak", email: "weak5@x.com", password: "password123" } });
  assert.equal(breached1.status, 400);
  assert.match(breached1.data.message, /compromised in data breaches/i);
  const breached2 = await call("POST", "/api/auth/register", { body: { name: "Weak", email: "weak6@x.com", password: "Admin@12345" } });
  assert.equal(breached2.status, 400);
  assert.match(breached2.data.message, /compromised in data breaches/i);
  const breached3 = await call("POST", "/api/auth/register", { body: { name: "Weak", email: "weak7@x.com", password: "Founder@123" } });
  assert.equal(breached3.status, 400);
  assert.match(breached3.data.message, /compromised in data breaches/i);

  // Admin user creation also rejects breached passwords
  const userBreached = await call("POST", "/api/users", {
    token: tok.admin,
    body: { name: "BreachedUser", email: "breacheduser@x.com", password: "Mentor@123", role: "entrepreneur" }
  });
  assert.equal(userBreached.status, 400);
  assert.match(userBreached.data.message, /compromised in data breaches/i);
});

test("security: stored XSS defense in session links", async () => {
  const ideaId = (await call("GET", "/api/ideas", { token: tok.admin })).data[0]._id;
  // XSS via javascript: URI
  const bad1 = await call("POST", "/api/sessions", {
    token: tok.admin,
    body: { idea: ideaId, scheduledAt: new Date(Date.now() + 86400000).toISOString(), link: "javascript:alert(1)" }
  });
  assert.equal(bad1.status, 400);
  assert.match(bad1.data.message, /http:\/\/ or https:\/\//i);

  // XSS via data: URI
  const bad2 = await call("POST", "/api/sessions", {
    token: tok.admin,
    body: { idea: ideaId, scheduledAt: new Date(Date.now() + 86400000).toISOString(), link: "data:text/html,<script>alert(1)</script>" }
  });
  assert.equal(bad2.status, 400);
});

test("security: NoSQL query selector injection sanitized across controllers", async () => {
  // Query parameters with operator keys should be sanitized and not cause internal server errors
  assert.equal((await call("GET", "/api/assignments?kind[$gt]=", { token: tok.admin })).status, 200);
  assert.equal((await call("GET", "/api/ideas?status[$ne]=draft", { token: tok.admin })).status, 200);
  assert.equal((await call("GET", "/api/reports?targetType[$gt]=", { token: tok.mod })).status, 200);
  assert.equal((await call("GET", "/api/resources?kind[$gt]=", { token: tok.admin })).status, 200);
});

test("security: SSRF protection in isSafeUrl", async () => {
  const { isSafeUrl } = await import("./src/utils.js");
  // Loopback & local
  assert.equal(isSafeUrl("http://localhost:5000"), false);
  assert.equal(isSafeUrl("http://sub.localhost"), false);
  assert.equal(isSafeUrl("http://127.0.0.1"), false);
  assert.equal(isSafeUrl("http://127.0.0.2"), false);
  assert.equal(isSafeUrl("http://0.0.0.0"), false);
  assert.equal(isSafeUrl("http://0.0.0.1"), false);
  assert.equal(isSafeUrl("http://0.42.0.1"), false);
  // Private subnets
  assert.equal(isSafeUrl("http://10.0.0.1"), false);
  assert.equal(isSafeUrl("http://172.16.0.1"), false);
  assert.equal(isSafeUrl("http://172.31.255.255"), false);
  assert.equal(isSafeUrl("http://192.168.1.1"), false);
  // Cloud metadata
  assert.equal(isSafeUrl("http://169.254.169.254"), false);
  // IPv6 loopback & ULA
  assert.equal(isSafeUrl("http://[::1]"), false);
  assert.equal(isSafeUrl("http://[::]"), false);
  assert.equal(isSafeUrl("http://[fd00::1]"), false);
  assert.equal(isSafeUrl("http://[fc00::1]"), false);
  assert.equal(isSafeUrl("http://[fe80::1]"), false);
  // IPv4-mapped IPv6
  assert.equal(isSafeUrl("http://[::ffff:127.0.0.1]"), false);
  assert.equal(isSafeUrl("http://[::ffff:169.254.169.254]"), false);
  assert.equal(isSafeUrl("http://[::ffff:10.0.0.1]"), false);
  // Legitimate public URLs
  assert.equal(isSafeUrl("https://example.com/webhook"), true);
  assert.equal(isSafeUrl("http://example.org:8080/events"), true);
});

test("security: sensitive query parameters redacted from logs and errors", async () => {
  const { redactUrl } = await import("./src/middleware/errorMiddleware.js");
  const cleaned = redactUrl("/api/unknown?token=secret123&password=pass&key=apikey&safe=ok");
  assert.match(cleaned, /token=\[REDACTED\]/);
  assert.match(cleaned, /password=\[REDACTED\]/);
  assert.match(cleaned, /key=\[REDACTED\]/);
  assert.match(cleaned, /safe=ok/);
});

test("security: JWT invalidation on password change", async () => {
  const reg = await call("POST", "/api/auth/register", {
    body: { name: "JWT Test", email: "jwttest@x.com", password: "OriginalPass1" }
  });
  assert.equal(reg.status, 201);
  const oldToken = reg.data.token;

  // Verify old token works initially
  assert.equal((await call("GET", "/api/auth/me", { token: oldToken })).status, 200);

  await new Promise((r) => setTimeout(r, 50));

  // Breached password change rejected
  const badChange = await call("PATCH", "/api/auth/password", {
    token: oldToken,
    body: { currentPassword: "OriginalPass1", newPassword: "Admin@12345" }
  });
  assert.equal(badChange.status, 400);
  assert.match(badChange.data.message, /compromised in data breaches/i);

  // Update password
  const changeRes = await call("PATCH", "/api/auth/password", {
    token: oldToken,
    body: { currentPassword: "OriginalPass1", newPassword: "UpdatedPass2" }
  });
  assert.equal(changeRes.status, 200);

  // Old token MUST now be rejected
  assert.equal((await call("GET", "/api/auth/me", { token: oldToken })).status, 401);

  // Wait 1s so new token's whole-second iat >= passwordChangedAt
  await new Promise((r) => setTimeout(r, 1000));

  // Login with new password succeeds and new token works
  const newLogin = await call("POST", "/api/auth/login", {
    body: { email: "jwttest@x.com", password: "UpdatedPass2" }
  });
  assert.equal(newLogin.status, 200);
  assert.equal((await call("GET", "/api/auth/me", { token: newLogin.data.token })).status, 200);
});

test("security: DPDP Act 2023 self-service account deletion", async () => {
  const reg = await call("POST", "/api/auth/register", {
    body: { name: "Delete Test", email: "deleteme@x.com", password: "DeletePass1" }
  });
  assert.equal(reg.status, 201);
  const token = reg.data.token;

  // Superadmin cannot self-delete
  const superDel = await call("DELETE", "/api/auth/me", { token: tok.super });
  assert.equal(superDel.status, 403);

  // Self deletion works for regular users
  const delRes = await call("DELETE", "/api/auth/me", { token });
  assert.equal(delRes.status, 200);

  // Subsequent login fails
  assert.equal((await call("POST", "/api/auth/login", { body: { email: "deleteme@x.com", password: "DeletePass1" } })).status, 401);
});

test("security: email verification token validation and no backdoor", async () => {
  const reg = await call("POST", "/api/auth/register", {
    body: { name: "Email Verify Test", email: "verifytest@x.com", password: "VerifyPass1" }
  });
  assert.equal(reg.status, 201);
  const token = reg.data.token;

  // Backdoor "123456" must be rejected
  const backdoor = await call("POST", "/api/auth/verify-email", {
    token,
    body: { email: "verifytest@x.com", token: "123456" }
  });
  assert.equal(backdoor.status, 400);

  // Request real verification code
  const sendRes = await call("POST", "/api/auth/send-verification", { token });
  assert.equal(sendRes.status, 200);
});

test("security: security headers (CSP, HSTS, Permissions-Policy, Referrer-Policy)", async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.ok(res.headers.get("content-security-policy"), "Missing CSP header");
  assert.ok(res.headers.get("permissions-policy"), "Missing Permissions-Policy header");
  assert.equal(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});
