// ───────────────────────────────────────────────────────────────
// api/story.js  —  Serverless proxy using GOOGLE GEMINI (free tier).
//
// Runs on the SERVER (Vercel), never in the browser. The only place
// your secret GEMINI_API_KEY lives. The game sends Anthropic-style
// { system, messages }; this proxy translates to Gemini's format,
// calls Gemini, and returns { text } — so the game needs no changes.
// ───────────────────────────────────────────────────────────────

const hits = new Map();
function rateLimited(ip, max = 30, windowMs = 60_000) {
  const now = Date.now();
  const rec = hits.get(ip) || { count: 0, reset: now + windowMs };
  if (now > rec.reset) { rec.count = 0; rec.reset = now + windowMs; }
  rec.count++;
  hits.set(ip, rec);
  return rec.count > max;
}

export default async function handler(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = (req.headers["x-forwarded-for"] || "unknown").toString().split(",")[0].trim();
  if (rateLimited(ip)) return res.status(429).json({ error: "Slow down a moment — too many actions too fast." });

  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) return res.status(500).json({ error: "Server missing GEMINI_API_KEY. Set it in your host's environment variables." });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { system, messages } = body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }

    // ---- translate Anthropic-style request -> Gemini format ----
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "") }],
    }));

    // Try several known model names; some keys/API versions only expose
    // certain ones. First that works wins.
    const models = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-flash-latest", "gemini-pro"];
    let data = null, lastErr = "", okModel = "";
    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
      const upstream = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: system ? { parts: [{ text: String(system) }] } : undefined,
          generationConfig: { temperature: 0.9, maxOutputTokens: 800 },
        }),
      });
      const j = await upstream.json();
      if (upstream.ok) { data = j; okModel = model; break; }
      lastErr = j?.error?.message || `HTTP ${upstream.status}`;
      // 404 = model not found for this key; try next. Other errors: stop.
      if (upstream.status !== 404) { return res.status(upstream.status).json({ error: `Gemini: ${lastErr}` }); }
    }
    if (!data) return res.status(502).json({ error: `Gemini: no model available. Last error: ${lastErr}` });

    // ---- pull the text out of Gemini's response shape ----
    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map((p) => (p && typeof p.text === "string" ? p.text : ""))
      .join("")
      .trim();

    if (!text) return res.status(502).json({ error: "Empty response from Gemini." });
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: "Proxy error: " + (e?.message || "unknown") });
  }
}
