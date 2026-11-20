// Collects *current* market signals from the open web so the AI council predicts
// against live data instead of only the text in the idea form.
//
// Default mode needs no API key: Bing web results + Google News RSS (funding
// news) + direct scraping of the official sites that appear. DuckDuckGo is a
// last resort. If TAVILY_API_KEY or SERPER_API_KEY is set, those structured
// search APIs are preferred. Every failure is non-fatal - the report is still
// produced, it simply records which sources were available.
import * as cheerio from "cheerio";
import { syslog } from "./logger.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36 Soch2Startup/2.0";
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

const isSafeUrl = (value) => {
  try {
    const u = new URL(value);
    if (!["http:", "https:"].includes(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h === "::1" || h.endsWith(".localhost")) return false;
    if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    return true;
  } catch { return false; }
};

const fetchWithTimeout = async (url, options = {}, ms = 8000) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally { clearTimeout(timer); }
};

const domain = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
const textOf = (html) => clean(String(html || "").replace(/<[^>]+>/g, " "));

/* ------------------------------ queries ------------------------------ */

export const buildQueries = (idea = {}, market = "India") => {
  const year = new Date().getFullYear();
  const industry = clean(idea.industry).slice(0, 40) || "startup";
  const keywords = clean(idea.title).split(/\s+/).filter((w) => w.length > 3 && !/^(the|for|and|with|that|this)$/i.test(w)).slice(0, 4).join(" ");
  const q = [
    `${industry} startup funding rounds ${market} ${year}`,
    `${industry} market size growth ${market} ${year}`,
    keywords ? `${keywords} ${industry} startup` : `${industry} trends ${market} ${year}`,
  ];
  return [...new Set(q)].slice(0, 3);
};

/* --------------------------- no-key parsers -------------------------- */

const decodeBingUrl = (raw) => {
  try {
    const u = new URL(raw, "https://www.bing.com");
    const enc = u.searchParams.get("u");
    if (enc) {
      const decoded = Buffer.from(enc.replace(/^a1/, ""), "base64url").toString("utf8");
      if (isSafeUrl(decoded)) return decoded;
    }
    return raw;
  } catch { return raw; }
};

export const parseBing = (html) => {
  const $ = cheerio.load(html);
  const out = [];
  $("li.b_algo").each((_, el) => {
    if (out.length >= 12) return;
    const a = $(el).find("h2 a").first();
    const url = decodeBingUrl(clean(a.attr("href")));
    const d = domain(url);
    if (/bing\.com|microsoft\.com|msn\.com/.test(d)) return; // entity cards / ads
    const snippet = clean($(el).find(".b_caption p").first().text() || $(el).find("p").first().text());
    if (a.text().trim() && isSafeUrl(url)) out.push({ title: clean(a.text()), url, snippet, kind: "search" });
  });
  return out;
};

export const parseGoogleNews = (xml) => {
  const $ = cheerio.load(xml, { xmlMode: true });
  const out = [];
  $("item").each((_, el) => {
    if (out.length >= 12) return;
    const title = clean($(el).find("title").first().text());
    const url = clean($(el).find("link").first().text());
    const pub = clean($(el).find("pubDate").first().text());
    const srcEl = $(el).find("source").first();
    const source = clean(srcEl.text());
    let sourceUrl = clean(srcEl.attr("url"));
    try { sourceUrl = sourceUrl ? `${new URL(sourceUrl).origin}/` : ""; } catch { sourceUrl = ""; }
    const desc = textOf($(el).find("description").first().text()).slice(0, 220);
    if (title && isSafeUrl(url)) out.push({ title, url, snippet: [pub, source, desc].filter(Boolean).join(" · ").slice(0, 400), kind: "news", sourceUrl });
  });
  return out;
};

export const parseDuckDuckGo = (html) => {
  const $ = cheerio.load(html);
  const out = [];
  $(".result").each((_, el) => {
    if (out.length >= 12) return;
    const a = $(el).find("a.result__a").first();
    let url = clean(a.attr("href"));
    try {
      const u = new URL(url, "https://duckduckgo.com");
      const uddg = u.searchParams.get("uddg");
      if (uddg) url = decodeURIComponent(uddg);
    } catch { /* keep original */ }
    const title = clean(a.text());
    const snippet = clean($(el).find(".result__snippet").first().text());
    if (title && isSafeUrl(url)) out.push({ title, url, snippet, kind: "search" });
  });
  return out;
};

const viaNoKey = async (queries, maxResults, timeoutMs, errors = []) => {
  const headers = { "User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9" };
  let results = [];

  // Google News RSS is the most reliable key-free source of *current* funding
  // and market news (and it is not usually challenged on server IPs).
  try {
    const seen = new Set();
    for (const q of queries.slice(0, 2)) {
      const xml = await (await fetchWithTimeout(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`, { headers }, timeoutMs)).text();
      for (const r of parseGoogleNews(xml)) {
        if (seen.has(r.url)) continue;
        seen.add(r.url); results.push(r);
      }
    }
  } catch (e) { errors.push(`googleNews: ${e.name === "AbortError" ? "timeout" : e.message}`); }
  results = results.slice(0, maxResults);

  // Fallback 1: Bing web results (some hosts serve bot-degraded junk - skip if news worked).
  if (!results.length) {
    try {
      for (const q of queries) {
        const html = await (await fetchWithTimeout(`https://www.bing.com/search?q=${encodeURIComponent(q)}&count=8`, { headers }, timeoutMs)).text();
        for (const r of parseBing(html)) if (!results.some((x) => x.url === r.url)) results.push(r);
      }
      results = results.slice(0, maxResults);
    } catch (e) { errors.push(`bing: ${e.name === "AbortError" ? "timeout" : e.message}`); }
  }

  // Fallback 2: DuckDuckGo (often shows a bot challenge from server IPs).
  if (!results.length) {
    try {
      for (const q of queries) {
        const html = await (await fetchWithTimeout(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, { headers }, timeoutMs)).text();
        for (const r of parseDuckDuckGo(html)) if (!results.some((x) => x.url === r.url)) results.push(r);
      }
      results = results.slice(0, maxResults);
    } catch (e) { errors.push(`duckduckgo: ${e.name === "AbortError" ? "timeout" : e.message}`); }
  }
  return results;
};

/* -------------------------- optional search APIs ---------------------- */

const viaTavily = async (queries, maxResults, timeoutMs) => {
  const out = [];
  for (const q of queries) {
    const res = await fetchWithTimeout("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query: q, max_results: Math.min(maxResults, 10), search_depth: "basic", include_answer: false }),
    }, timeoutMs);
    const data = await res.json();
    for (const r of data.results || []) {
      if (r.url && isSafeUrl(r.url)) out.push({ title: clean(r.title), url: r.url, snippet: clean(r.content), kind: "search" });
    }
  }
  return out.slice(0, maxResults);
};

const viaSerper = async (queries, maxResults, timeoutMs) => {
  const out = [];
  for (const q of queries) {
    const res = await fetchWithTimeout("https://google.serper.dev/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": process.env.SERPER_API_KEY },
      body: JSON.stringify({ q, num: Math.min(maxResults, 10) }),
    }, timeoutMs);
    const data = await res.json();
    for (const r of data.organic || []) {
      if (r.link && isSafeUrl(r.link)) out.push({ title: clean(r.title), url: r.link, snippet: clean(r.snippet), kind: "search" });
    }
  }
  return out.slice(0, maxResults);
};

/* ------------------------ official-site scraping ---------------------- */

export const scrapeOfficialSite = async (url, timeoutMs = 7000) => {
  const html = await (await fetchWithTimeout(url, { headers: { "User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9" } }, timeoutMs)).text();
  const $ = cheerio.load(html.slice(0, 600000));
  $("script, style, nav, footer, header, form, iframe, noscript, svg").remove();
  const title = clean($("title").first().text());
  const body = clean($("body").text()).slice(0, 2500);
  return { title, text: body };
};

const scrapeSites = async (results, maxPages, timeoutMs, errors = []) => {
  const seen = new Set();
  const picked = [];
  for (const r of results) {
    const target = r.kind === "news" && r.sourceUrl ? r.sourceUrl : r.url;
    const d = domain(target);
    if (!d || seen.has(d)) continue;
    if (/duckduckgo|google|bing|serper|tavily|yahoo/.test(d)) continue;
    seen.add(d); picked.push({ ...r, scrapeUrl: target });
    if (picked.length >= maxPages * 3) break; // several publishers block bots; try a few
  }
  const out = [];
  for (const r of picked) {
    try {
      const page = await scrapeOfficialSite(r.scrapeUrl || r.url, timeoutMs);
      if (page.text.length > 40) {
        out.push({ ...r, kind: "officialSite", siteTitle: page.title, siteText: page.text, siteDomain: domain(r.scrapeUrl) });
        if (out.length >= maxPages) break;
      }
    } catch (e) { errors.push(`${domain(r.scrapeUrl)}: ${e.message}`); }
  }
  return out;
};

/* -------------------------------- summary ---------------------------- */

const buildSummary = (idea, market, sources, queries) => {
  const search = sources.filter((s) => s.kind !== "officialSite").slice(0, 8);
  const sites = sources.filter((s) => s.kind === "officialSite").slice(0, 3);
  const parts = [
    `LIVE MARKET SIGNALS — collected ${new Date().toISOString()}. Target market: ${market}.`,
    `Searches run: ${queries.join(" | ")}`,
    "",
    "Recent web findings:",
    ...search.map((s, i) => `[${i + 1}] ${s.title} (${domain(s.url)})\n    ${s.snippet || "No snippet available."}`),
  ];
  if (sites.length) {
    parts.push("", "Official / company site highlights:");
    for (const s of sites) parts.push(`- ${s.siteDomain || domain(s.url)}: ${s.siteText.slice(0, 600)}`);
  }
  return parts.join("\n").slice(0, 7000);
};

/* -------------------------------- public ----------------------------- */

export const collectLiveData = async (idea = {}, engine = {}) => {
  const cfg = engine.liveData || {};
  const market = engine.market || "India";
  const maxResults = Math.max(1, Math.min(Number(cfg.maxResults) || 8, 20));
  const maxPages = Math.max(0, Math.min(Number(cfg.maxPages) ?? 3, 8));
  const timeoutMs = Math.max(2000, Math.min(Number(cfg.timeoutMs) || 8000, 20000));
  const wantSites = !Array.isArray(cfg.sources) || cfg.sources.includes("officialSites");
  const queries = buildQueries(idea, market);
  const errors = [];
  let mode = "google-news";
  let searchResults = [];

  const searchModes = [];
  if (process.env.TAVILY_API_KEY) searchModes.push(["tavily", viaTavily]);
  if (process.env.SERPER_API_KEY) searchModes.push(["serper", viaSerper]);
  searchModes.push(["google-news", viaNoKey]);

  for (const [name, fn] of searchModes) {
    try {
      searchResults = await fn(queries, maxResults, timeoutMs, errors);
      if (searchResults.length) { mode = name; break; }
    } catch (e) {
      errors.push(`${name}: ${e.name === "AbortError" ? "timeout" : e.message}`);
    }
  }

  let sources = searchResults;
  if (wantSites && sources.length) {
    try {
      const siteSources = await scrapeSites(sources, maxPages, timeoutMs, errors);
      sources = [...sources.filter((s) => !siteSources.some((x) => x.url === s.url)), ...siteSources];
    } catch (e) { errors.push(`officialSites: ${e.message}`); }
  }

  const payload = {
    mode,
    collectedAt: new Date(),
    queries,
    sources: sources.slice(0, maxResults + maxPages).map((s) => ({
      title: clean(s.title).slice(0, 200),
      url: s.url,
      domain: s.siteDomain || domain(s.url),
      snippet: clean(s.snippet).slice(0, 400),
      kind: s.kind,
      ...(s.siteText ? { siteText: s.siteText, siteTitle: s.siteTitle } : {}),
    })),
    summary: sources.length ? buildSummary(idea, market, sources, queries) : "",
    errors,
  };

  if (errors.length) syslog("warn", "live_data.partial", errors.join("; "), idea.title || "");
  return payload;
};
