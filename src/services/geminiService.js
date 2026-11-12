// Talks to the Gemini REST API. Falls back to a demo report if no API key is set.

const buildPrompt = ({ title, description, industry, budget, teamSize }) => `
You are a startup analyst. Evaluate this startup idea for the Indian market.
Title: ${title}
Description: ${description}
Industry: ${industry}
Budget: ${budget}
Team: ${teamSize}

Return ONLY valid JSON with exactly this shape (all metrics are integers 0-100, higher is better):
{
  "metrics": { "marketDemand": 0, "competition": 0, "feasibility": 0, "financial": 0, "risk": 0 },
  "marketResearch": "2-3 sentences",
  "feasibilityNote": "2 sentences",
  "swot": { "strengths": [], "weaknesses": [], "opportunities": [], "threats": [] },
  "targetCustomers": [],
  "competitors": [],
  "risks": [],
  "recommendations": []
}
"competition" means 100 = very little competition. "risk" means 100 = very low risk.
Keep every list to 3 short items.`;

const callGemini = async (idea) => {
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(idea) }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API error ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.candidates[0].content.parts[0].text);
};

// Simple demo report so the app works without an API key
const demoReport = ({ description, industry }) => {
  const base = Math.min(85, 45 + Math.floor(description.length / 12));
  return {
    metrics: { marketDemand: base + 5, competition: base - 12, feasibility: base, financial: base - 6, risk: base - 4 },
    marketResearch: `The ${industry} space shows steady growth, with rising digital adoption among Indian consumers.`,
    feasibilityNote: "Technically achievable with an MVP. Financial viability depends on early customer traction.",
    swot: {
      strengths: ["Clear problem statement", "Growing market demand", "Low MVP cost"],
      weaknesses: ["No brand recognition", "Limited initial funding", "Unproven business model"],
      opportunities: ["Underserved niche segments", "Partnerships", "AI-driven automation"],
      threats: ["Established competitors", "Changing regulations", "Fast followers"],
    },
    targetCustomers: ["Young urban professionals", "College students", "Small businesses"],
    competitors: ["Large established platforms", "Local offline alternatives", "Emerging startups"],
    risks: ["Customer acquisition cost", "Cash runway", "Execution speed"],
    recommendations: ["Build an MVP in 8-12 weeks", "Interview 15 potential customers", "Run a small paid pilot"],
  };
};

const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

export const analyzeIdea = async (idea) => {
  let raw;
  try {
    raw = process.env.GEMINI_API_KEY ? await callGemini(idea) : demoReport(idea);
  } catch (err) {
    console.error("Gemini failed, using demo report:", err.message);
    raw = demoReport(idea);
  }

  const m = raw.metrics || {};
  const metrics = {
    marketDemand: clamp(m.marketDemand), competition: clamp(m.competition),
    feasibility: clamp(m.feasibility), financial: clamp(m.financial), risk: clamp(m.risk),
  };
  // Weighted validation score
  const score = Math.round(
    metrics.marketDemand * 0.3 + metrics.competition * 0.15 + metrics.feasibility * 0.2 +
    metrics.financial * 0.2 + metrics.risk * 0.15
  );
  const verdict = score >= 70 ? "GO" : score >= 50 ? "IMPROVE" : "AVOID";

  return { ...raw, metrics, score, verdict };
};
