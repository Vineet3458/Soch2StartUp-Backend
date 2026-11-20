// Pure unit tests for the multi-model council + live-data collector.
// No database or network access is needed for these.
import test from "node:test";
import assert from "node:assert/strict";
import { computeScore, aggregateReports, normalizeReport } from "./src/services/aiService.js";
import { parseModelJson } from "./src/services/modelProviders.js";
import { buildQueries, parseDuckDuckGo, parseGoogleNews, parseBing } from "./src/services/liveDataService.js";

const SCORING = { weights: { marketDemand: 30, competition: 15, feasibility: 20, financial: 20, risk: 15 }, thresholds: { go: 70, improve: 50 } };
const DEMO = {
  metrics: { marketDemand: 60, competition: 50, feasibility: 60, financial: 60, risk: 60 },
  marketResearch: "Demo research", feasibilityNote: "Demo feasibility",
  swot: { strengths: ["Demo strength"], weaknesses: ["Demo weakness"], opportunities: ["Demo opp"], threats: ["Demo threat"] },
  targetCustomers: ["Demo customer"], competitors: ["Demo competitor"], risks: ["Demo risk"], recommendations: ["Demo rec"],
};

const report = (over = {}) => normalizeReport({
  metrics: { marketDemand: 70, competition: 60, feasibility: 70, financial: 70, risk: 70 },
  marketResearch: "A detailed research finding based on live signals.",
  feasibilityNote: "A detailed feasibility finding for the team.",
  swot: { strengths: ["Strong team"], weaknesses: ["Low funding"], opportunities: ["News coverage"], threats: ["Incumbents"] },
  targetCustomers: ["Small merchants"], competitors: ["Paytm"], risks: ["CAC"], recommendations: ["Pilot first"],
  ...over,
}, DEMO);

test("computeScore: weighted score and verdict thresholds", () => {
  const perfect = computeScore({ marketDemand: 100, competition: 100, feasibility: 100, financial: 100, risk: 100 }, SCORING);
  assert.deepEqual(perfect, { score: 100, verdict: "GO" });
  const mid = computeScore({ marketDemand: 60, competition: 60, feasibility: 60, financial: 60, risk: 60 }, SCORING);
  assert.deepEqual(mid, { score: 60, verdict: "IMPROVE" });
  const low = computeScore({ marketDemand: 20, competition: 20, feasibility: 20, financial: 20, risk: 20 }, SCORING);
  assert.deepEqual(low, { score: 20, verdict: "AVOID" });
});

test("aggregateReports: trims outliers, merges lists and reports confidence", () => {
  const entry = (id, metrics, over = {}) => ({ id, weight: 1, report: report({ ...over, metrics }) });
  const r1 = entry("a", { marketDemand: 70, competition: 60, feasibility: 70, financial: 70, risk: 70 });
  const r2 = entry("b", { marketDemand: 74, competition: 64, feasibility: 72, financial: 68, risk: 71 });
  const r3 = entry("c", { marketDemand: 72, competition: 62, feasibility: 71, financial: 69, risk: 70 });
  const r4 = entry("d", { marketDemand: 2, competition: 2, feasibility: 2, financial: 2, risk: 2 }); // outlier
  const agg = aggregateReports([r1, r2, r3, r4], { models: new Array(4).fill({ enabled: true }) }, DEMO);

  assert.ok(agg.metrics.marketDemand > 60, "outlier should be trimmed");
  assert.ok(agg.confidence > 0 && agg.confidence <= 100);
  assert.equal(agg.consensus.modelsUsed, 4);
  assert.deepEqual(agg.competitors, ["Paytm"]);
  assert.equal(agg.swot.strengths[0], "Strong team");
  assert.equal(agg.score, computeScore(agg.metrics, SCORING).score);
});

test("aggregateReports: mean / median / weighted produce distinct valid scores", () => {
  const entries = [
    { id: "a", weight: 3, report: report({ metrics: { marketDemand: 90, competition: 90, feasibility: 90, financial: 90, risk: 90 } }) },
    { id: "b", weight: 1, report: report({ metrics: { marketDemand: 50, competition: 50, feasibility: 50, financial: 50, risk: 50 } }) },
  ];
  const weighted = aggregateReports(entries, { aggregation: "weighted" }, DEMO).metrics.marketDemand;
  const mean = aggregateReports(entries, { aggregation: "mean" }, DEMO).metrics.marketDemand;
  const median = aggregateReports(entries, { aggregation: "median" }, DEMO).metrics.marketDemand;
  assert.equal(weighted, 80); // (90*3 + 50*1) / 4
  assert.equal(mean, 70);
  assert.equal(median, 70);
});

test("normalizeReport: clamps metrics and falls back to demo text", () => {
  const n = normalizeReport({ metrics: { marketDemand: 999, competition: -20 } }, DEMO);
  assert.equal(n.metrics.marketDemand, 100);
  assert.equal(n.metrics.competition, 0);
  assert.equal(n.marketResearch, "Demo research"); // no text supplied -> demo fallback
  assert.equal(normalizeReport({ marketResearch: "A detailed research finding based on live signals." }, DEMO).marketResearch, "A detailed research finding based on live signals.");
});

test("parseModelJson: handles fenced output and rejects garbage", () => {
  assert.deepEqual(parseModelJson('```json\n{"metrics":{"marketDemand":80}}\n```'), { metrics: { marketDemand: 80 } });
  assert.deepEqual(parseModelJson('Here you go: {"ok":true} thanks'), { ok: true });
  assert.throws(() => parseModelJson("not json at all"), /invalid JSON/i);
});

test("buildQueries: industry-aware and market-aware", () => {
  const q = buildQueries({ title: "Crop advisory bot", industry: "AgriTech" }, "India");
  assert.equal(q.length, 3);
  assert.ok(q.every((s) => s.length > 10));
  assert.ok(q.some((s) => /AgriTech/.test(s)));
  assert.ok(q.some((s) => /India/.test(s)));
});

test("parseGoogleNews: reads dated funding items and publisher site", () => {
  const xml = `<rss><channel><item>
    <title>Agri startup raises $3M - Business Standard</title>
    <link>https://news.google.com/rss/articles/abc</link>
    <pubDate>Tue, 10 Mar 2026 07:00:00 GMT</pubDate>
    <source url="https://www.business-standard.com/">Business Standard</source>
    <description>&lt;a href="https://news.google.com"&gt;Read&lt;/a&gt;</description>
  </item></channel></rss>`;
  const out = parseGoogleNews(xml);
  assert.equal(out.length, 1);
  assert.match(out[0].snippet, /10 Mar 2026/);
  assert.equal(out[0].sourceUrl, "https://www.business-standard.com/");
  assert.equal(out[0].kind, "news");
});

test("parseBing: decodes redirect links and skips Bing's own cards", () => {
  const real = "https://example.com/market";
  const encoded = Buffer.from(real).toString("base64url");
  const html = `<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?u=a1${encoded}">Market report</a></h2><p>A live market report.</p></li>
    <li class="b_algo"><h2><a href="https://www.bing.com/entity">Entity card</a></h2></li>`;
  const out = parseBing(html);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, real);
  assert.equal(out[0].title, "Market report");
});

test("parseDuckDuckGo: extracts safe result links", () => {
  const html = `
    <div class="result">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Ffunding">Example funding</a>
      <div class="result__snippet">A startup raised a round this week.</div>
    </div>
    <div class="result"><a class="result__a" href="http://127.0.0.1/secret">Local</a></div>`;
  const out = parseDuckDuckGo(html);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, "https://example.com/funding");
  assert.match(out[0].snippet, /raised a round/);
});
