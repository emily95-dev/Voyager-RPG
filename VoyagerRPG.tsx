import React, { useState, useEffect, useRef } from "react";

// ══════════════════════════════════════════════════════════════
// Voyager — Free-Play RPG. Purely user-led: type what you want to
// do. A Red Alert button injects an AI-generated crisis. Powered by
// Gemini via the /api/story proxy.
// ══════════════════════════════════════════════════════════════

const C = {
  bg: "#000000", panel: "#11131c", panel2: "#0a0c14",
  amber: "#ff9f1c", gold: "#ffcc66", rust: "#cc6644",
  lilac: "#cc99cc", blue: "#6699cc", ice: "#99ccff",
  red: "#cc4444", green: "#88bb66", pink: "#e89ab0",
  text: "#f5e6c8", dim: "#9a9080",
};

const STAT_INFO = { ENG: "Engineering", SEC: "Security", SCI: "Science", DIP: "Diplomacy", GRT: "Grit" };

const RACES = {
  Human: { blurb: "Adaptable and stubbornly hopeful.", mods: { DIP: 1, GRT: 1 }, color: C.ice },
  Vulcan: { blurb: "Logic over emotion. Mentally disciplined.", mods: { SCI: 2, DIP: -1, GRT: 1 }, color: C.green },
  Klingon: { blurb: "A warrior's heart. Honor above all.", mods: { SEC: 2, GRT: 1, DIP: -1 }, color: C.red },
  Bajoran: { blurb: "Spiritual, resilient, fiercely loyal.", mods: { GRT: 2, DIP: 1, SEC: -1 }, color: C.lilac },
  Betazoid: { blurb: "Empathic. Reads a room before it speaks.", mods: { DIP: 2, SCI: 1, SEC: -1 }, color: C.gold },
  "Half-Klingon": { blurb: "Two natures, doubled resolve.", mods: { ENG: 1, SEC: 1, GRT: 1 }, color: C.rust },
};

const ROLES = {
  Engineering: { blurb: "You keep Voyager flying when she shouldn't.", mods: { ENG: 3, SCI: 1 }, station: "Main Engineering", color: C.amber },
  Security: { blurb: "The shield between crew and the dark.", mods: { SEC: 3, GRT: 1 }, station: "Tactical", color: C.red },
  Science: { blurb: "You read the unknown and make it known.", mods: { SCI: 3, DIP: 1 }, station: "Science Lab", color: C.blue },
  Medical: { blurb: "Sickbay's heart.", mods: { SCI: 2, DIP: 2 }, station: "Sickbay", color: C.green },
  Command: { blurb: "You carry the weight of the call.", mods: { DIP: 2, GRT: 2 }, station: "The Bridge", color: C.gold },
  Operations: { blurb: "Eyes on every system, every contact.", mods: { SCI: 2, ENG: 1, DIP: 1 }, station: "Ops", color: C.lilac },
};

const NPCS = {
  Janeway: { name: "Capt. Janeway", role: "Commanding Officer", color: C.amber },
  Chakotay: { name: "Cmdr. Chakotay", role: "First Officer", color: C.rust },
  Torres: { name: "B'Elanna Torres", role: "Chief Engineer", color: C.rust },
  Kim: { name: "Harry Kim", role: "Operations Officer", color: C.blue },
  Seven: { name: "Seven of Nine", role: "Astrometrics", color: C.ice },
  Paris: { name: "Tom Paris", role: "Helmsman", color: C.gold },
  Tuvok: { name: "Tuvok", role: "Chief of Security", color: C.green },
  Doctor: { name: "The Doctor", role: "Chief Medical Officer", color: C.lilac },
};

const baseStats = () => ({ ENG: 2, SEC: 2, SCI: 2, DIP: 2, GRT: 2 });
function applyMods(stats, mods) { const o = { ...stats }; for (const k in mods) o[k] = Math.max(0, (o[k] || 0) + mods[k]); return o; }
const rank = (rep) => (rep >= 8 ? "Lieutenant Commander" : rep >= 5 ? "Lieutenant" : rep >= 2 ? "Lieutenant j.g." : "Ensign");
const clamp5 = (n) => Math.max(0, Math.min(5, n));

// ── JSON extraction (handles stray text / fences) ──
function extractJson(text) {
  if (!text) return null;
  let s = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(s); } catch (e) {}
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') inStr = !inStr;
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { try { return JSON.parse(s.slice(start, i + 1)); } catch (e) { return null; } } }
  }
  return null;
}

// ── Call the AI storyteller via the proxy ──
async function callStory({ character, ship, npcs, history, playerAction, mode }) {
  const sys = `You are the Game Master of an open-ended Star Trek: Voyager text RPG. The player is a single crew member aboard the U.S.S. Voyager, about a year into being stranded in the Delta Quadrant — the crew has adapted to the long journey home, formed routines and friendships. Tone: hopeful, character-driven, thoughtful, true to Star Trek: Voyager. Write in second person ("you").

PLAYER: ${character.name}, a ${character.race} ${character.role} officer, rank ${rank(ship.rep)}, posted to ${character.station}. Aptitudes (0-6+): ${Object.entries(character.stats).map(([k, v]) => `${STAT_INFO[k]} ${v}`).join(", ")}. Their strongest aptitudes make matching actions more likely to succeed; weak ones make those actions riskier. Don't state dice — show success or struggle in the narrative.

Recurring crew and current warmth (0-5): ${Object.entries(NPCS).map(([k, v]) => `${v.name} [key:${k}]=${npcs[k] || 0}`).join("; ")}.

THIS IS PURELY PLAYER-LED. The player types whatever they want to do — honor it. Improvise consequences that fit Star Trek. If something is impossible or absurd, let it fail gracefully in-world with light humor. Never present a numbered menu of choices; instead, end at a natural beat that invites the player's next free action. Romance with crew is allowed but must be gradual, consensual, tasteful, and fade-to-black — never explicit. Keep ship state plausible.

${mode === "redalert"
  ? `RED ALERT: Ignore any specific player action text and instead INVENT a fresh, urgent crisis confronting Voyager right now — e.g. a spatial anomaly, hostile vessel, system failure, medical emergency, first contact gone wrong, or temporal event. Make it vivid and immediate, set the alert to "red" (or "yellow" if tension rather than combat), and end by putting the player on the spot to respond.`
  : `Resolve the player's action and continue the scene.`}

Return ONLY valid JSON, nothing before { or after }:
{"narrative":"2-3 vivid paragraphs separated by \\n\\n","location":"current location","stardate":"like 49xxx.x","effects":{"hull":0,"morale":0,"rep":0,"alert":"none"},"npcDelta":{"Janeway":0,"Chakotay":0,"Torres":0,"Kim":0,"Seven":0,"Paris":0,"Tuvok":0,"Doctor":0},"romanceFlag":"","item":""}
Notes: effects.hull/morale are -1..1, rep 0..2, alert is "none"|"yellow"|"red". npcDelta values usually 0 or 1. romanceFlag = an NPC key only if a clearly romantic moment just occurred. item = short name only if the player acquired something.`;

  const convo = history.map((h) => `${h.role === "user" ? "PLAYER" : "STORY"}: ${h.text}`).join("\n\n");
  const userMsg = `${convo ? convo + "\n\n" : ""}${mode === "redalert" ? "PLAYER PRESSED RED ALERT — invent a crisis now." : `PLAYER ACTION: ${playerAction}`}`;

  async function once() {
    const endpoint = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_STORY_ENDPOINT) || "/api/story";
    const resp = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ max_tokens: 900, system: sys, messages: [{ role: "user", content: userMsg }] }),
    });
    if (!resp.ok) { let m = "API " + resp.status; try { const e = await resp.json(); if (e && e.error) m = e.error; } catch (_) {} throw new Error(m); }
    const data = await resp.json();
    const raw = typeof data.text === "string" ? data.text.trim() : (data.content || []).map((b) => (b && typeof b.text === "string" ? b.text : "")).join("").trim();
    const parsed = extractJson(raw);
    if (!parsed || !parsed.narrative) throw new Error("Could not read the story reply.");
    return {
      narrative: String(parsed.narrative),
      location: typeof parsed.location === "string" ? parsed.location : "",
      stardate: typeof parsed.stardate === "string" ? parsed.stardate : "",
      effects: { hull: Number(parsed.effects?.hull) || 0, morale: Number(parsed.effects?.morale) || 0, rep: Number(parsed.effects?.rep) || 0, alert: ["none","yellow","red"].includes(parsed.effects?.alert) ? parsed.effects.alert : undefined },
      npcDelta: parsed.npcDelta && typeof parsed.npcDelta === "object" ? parsed.npcDelta : {},
      romanceFlag: typeof parsed.romanceFlag === "string" ? parsed.romanceFlag : "",
      item: typeof parsed.item === "string" ? parsed.item : "",
    };
  }
  let lastErr;
  for (let i = 0; i < 3; i++) { try { return await once(); } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 350 * (i + 1))); } }
  throw lastErr || new Error("story failed");
}

// ══════════════════════════════════════════════════════════════
// UI atoms
// ══════════════════════════════════════════════════════════════
function StatBar({ k, v, max = 6, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 84, fontSize: 10, letterSpacing: ".15em", color: C.gold, fontWeight: 700, textTransform: "uppercase" }}>{STAT_INFO[k]}</span>
      <div style={{ display: "flex", gap: 3, flex: 1 }}>
        {Array.from({ length: max }).map((_, i) => <div key={i} style={{ height: 9, flex: 1, borderRadius: 2, background: i < v ? (color || C.amber) : "#2a2a33", transition: "background .3s" }} />)}
      </div>
      <span style={{ width: 18, textAlign: "right", fontSize: 13, fontWeight: 800, color: C.ice }}>{v}</span>
    </div>
  );
}
function OptionCard({ active, color, title, blurb, mods, onClick }) {
  return (
    <button onClick={onClick} className="opt" style={{ textAlign: "left", cursor: "pointer", width: "100%", background: active ? "#1c1f2b" : C.panel, border: `2px solid ${active ? color : "#23252f"}`, borderRadius: "6px 18px 18px 6px", padding: "14px 16px", transition: "border-color .15s, background .15s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
        <span style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{title}</span>
      </div>
      <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.4, marginBottom: mods ? 8 : 0 }}>{blurb}</div>
      {mods && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Object.entries(mods).map(([k, val]) => <span key={k} style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", padding: "2px 8px", borderRadius: 999, background: val > 0 ? "#1f3320" : "#33201f", color: val > 0 ? C.green : C.rust, border: `1px solid ${val > 0 ? "#2f5030" : "#552f2c"}` }}>{k} {val > 0 ? `+${val}` : val}</span>)}
        </div>
      )}
    </button>
  );
}
function Header({ alert, title }) {
  const ac = alert === "red" ? C.red : alert === "yellow" ? C.amber : C.blue;
  const al = alert === "red" ? "Red Alert" : alert === "yellow" ? "Yellow Alert" : "Condition Green";
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
      <div style={{ width: 70, background: C.amber, borderRadius: "28px 0 0 0", height: 42 }} />
      <div style={{ flex: 1, background: C.rust, height: 42, display: "flex", alignItems: "center", paddingLeft: 16, overflow: "hidden" }}>
        <span style={{ fontWeight: 800, letterSpacing: ".18em", color: "#000", fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
      </div>
      <div style={{ background: ac, borderRadius: "0 28px 0 0", height: 42, display: "flex", alignItems: "center", padding: "0 16px", animation: alert === "red" ? "blink 1s infinite" : "none" }}>
        <span style={{ fontWeight: 800, color: "#000", fontSize: 10.5, letterSpacing: ".1em", whiteSpace: "nowrap" }}>{al.toUpperCase()}</span>
      </div>
    </div>
  );
}
function StatusBox({ label, value, color, grow }) {
  return (
    <div style={{ background: C.panel, border: "1px solid #23252f", borderRadius: 8, padding: "8px 12px", flex: grow ? "1 1 140px" : "0 0 auto", minWidth: 0 }}>
      <div style={{ fontSize: 9, letterSpacing: ".16em", color: C.gold, fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 800, color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </div>
  );
}
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 8, marginBottom: 24 };
const SectionLabel = ({ children }) => <div style={{ fontSize: 11, letterSpacing: ".18em", color: C.gold, fontWeight: 700, textTransform: "uppercase", margin: "0 0 10px" }}>{children}</div>;

function CharacterCreator({ onComplete }) {
  const [name, setName] = useState(""), [race, setRace] = useState(null), [role, setRole] = useState(null);
  const preview = (() => { let s = baseStats(); if (race) s = applyMods(s, RACES[race].mods); if (role) s = applyMods(s, ROLES[role].mods); return s; })();
  const ready = name.trim() && race && role;
  return (
    <div style={{ width: "100%", maxWidth: 760 }}>
      <Header alert="none" title="PERSONNEL FILE · NEW" />
      <div style={{ background: C.panel2, border: "1px solid #23252f", borderRadius: 10, padding: 24, marginBottom: 8 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 28, fontWeight: 800, color: C.gold }}>Create Your Officer</h1>
        <p style={{ margin: "0 0 22px", color: C.dim, fontSize: 14, lineHeight: 1.5 }}>You're a member of Voyager's crew, a year into the long journey home through the Delta Quadrant. This is your story — you decide what to do. Type any action; press Red Alert any time to face a fresh crisis.</p>
        <SectionLabel>Name</SectionLabel>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mara Sefall" maxLength={28} style={{ width: "100%", boxSizing: "border-box", background: "#05060b", border: `2px solid ${name ? C.amber : "#23252f"}`, borderRadius: 8, color: C.text, fontSize: 16, padding: "12px 14px", marginBottom: 24, outline: "none" }} />
        <SectionLabel>Choose your species</SectionLabel>
        <div style={grid}>{Object.entries(RACES).map(([k, v]) => <OptionCard key={k} title={k} blurb={v.blurb} mods={v.mods} color={v.color} active={race === k} onClick={() => setRace(k)} />)}</div>
        <SectionLabel>Choose your role</SectionLabel>
        <div style={grid}>{Object.entries(ROLES).map(([k, v]) => <OptionCard key={k} title={k} blurb={v.blurb} mods={v.mods} color={v.color} active={role === k} onClick={() => setRole(k)} />)}</div>
        <SectionLabel>Aptitudes</SectionLabel>
        <div style={{ background: C.panel, border: "1px solid #23252f", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 9 }}>
          {Object.keys(preview).map((k) => <StatBar key={k} k={k} v={preview[k]} />)}
        </div>
      </div>
      <button onClick={() => onComplete({ name: name.trim(), race, role, station: ROLES[role].station, stats: preview })} disabled={!ready} className="lcars-btn" style={{ width: "100%", background: ready ? C.amber : "#1a1c24", color: ready ? "#000" : "#555", border: "none", borderRadius: "6px 22px 22px 6px", padding: 16, fontWeight: 800, fontSize: 15, letterSpacing: ".12em", textTransform: "uppercase", cursor: ready ? "pointer" : "default" }}>
        {ready ? "Report for Duty ▸" : "Complete your file to continue"}
      </button>
    </div>
  );
}

function SidePanel({ ch, ship, npcs, inventory, romances }) {
  const [tab, setTab] = useState("crew");
  const TabBtn = ({ id, label }) => (
    <button onClick={() => setTab(id)} style={{ flex: 1, cursor: "pointer", border: "none", background: tab === id ? C.amber : C.panel, color: tab === id ? "#000" : C.dim, fontWeight: 800, fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", padding: "9px 4px", borderRadius: 6, transition: "background .15s, color .15s" }}>{label}</button>
  );
  return (
    <div style={{ background: C.panel2, border: "1px solid #23252f", borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}><TabBtn id="crew" label="Crew" /><TabBtn id="stats" label="Stats" /><TabBtn id="gear" label="Gear" /></div>
      {tab === "crew" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(NPCS).map(([k, v]) => {
            const w = npcs[k] || 0; const isR = romances.includes(k);
            return (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: v.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.name}{isR && <span style={{ color: C.pink }}> ♥</span>}</span>
                <div style={{ display: "flex", gap: 2 }}>{[0,1,2,3,4].map((i) => <span key={i} style={{ width: 7, height: 7, borderRadius: 999, background: i < w ? (isR ? C.pink : v.color) : "#2a2a33" }} />)}</div>
              </div>
            );
          })}
        </div>
      )}
      {tab === "stats" && (
        <div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.gold }}>{ch.name}</div>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{rank(ship.rep)} · {ch.race} {ch.role}</div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 1 }}>Posted to {ch.station}</div>
          </div>
          <SectionLabel>Aptitudes</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>{Object.keys(ch.stats).map((k) => <StatBar key={k} k={k} v={ch.stats[k]} max={6} color={ROLES[ch.role].color} />)}</div>
          <SectionLabel>Service Record</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <MiniMeter label="Reputation" value={ship.rep} max={10} color={C.gold} />
            <MiniMeter label="Hull" value={ship.hull} max={5} color={ship.hull <= 2 ? C.red : C.amber} />
            <MiniMeter label="Crew Morale" value={ship.morale} max={5} color={C.lilac} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginTop: 2 }}>
              <span style={{ color: C.dim, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700 }}>Bonds</span>
              <span style={{ color: C.pink, fontWeight: 700 }}>{romances.length ? `♥ ${NPCS[romances[romances.length - 1]].name}` : "—"}</span>
            </div>
          </div>
        </div>
      )}
      {tab === "gear" && (
        inventory.length ? <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{inventory.map((it, i) => <div key={i} style={{ fontSize: 12.5, color: C.text, background: C.panel, border: "1px solid #23252f", borderRadius: 6, padding: "8px 10px" }}>▪ {it}</div>)}</div> : <div style={{ fontSize: 12.5, color: "#555", padding: "8px 2px" }}>No equipment acquired yet.</div>
      )}
    </div>
  );
}
function MiniMeter({ label, value, max, color }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: C.dim, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color }}>{value}/{max}</span>
      </div>
      <div style={{ height: 6, background: "#2a2a33", borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${(value / max) * 100}%`, height: "100%", background: color, transition: "width .4s" }} /></div>
    </div>
  );
}

function Game({ ch, onRestart }) {
  const [ship, setShip] = useState({ hull: 5, morale: 3, alert: "none", rep: 0 });
  const [npcs, setNpcs] = useState({});
  const [romances, setRomances] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loc, setLoc] = useState("Crew Quarters, Deck 6");
  const [stardate, setStardate] = useState("49021.4");
  const [scene, setScene] = useState({
    text: "It's been just over a year since Voyager was thrown 70,000 light-years from home. You've stopped counting the distance and started counting the people — the crew has become something like a family.\n\nYou wake in your quarters to the soft chime of the early-shift alarm. The deck hums under you, alive and familiar. Somewhere out there the Delta Quadrant waits, but right now the day is yours to begin.\n\nWhat do you do?",
    kind: "intro",
  });
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [shown, setShown] = useState(0);
  const scrollRef = useRef(null);

  const character = { ...ch, rank: rank(ship.rep) };
  const paragraphs = scene.text.split("\n\n");

  useEffect(() => {
    setShown(0);
    const t = setInterval(() => setShown((s) => (s >= paragraphs.length ? (clearInterval(t), s) : s + 1)), 430);
    return () => clearInterval(t);
  }, [scene]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [scene]);

  function applyResult(r) {
    setShip((s) => ({
      hull: clamp5(s.hull + (r.effects.hull || 0)),
      morale: clamp5(s.morale + (r.effects.morale || 0)),
      rep: Math.min(10, s.rep + (r.effects.rep || 0)),
      alert: r.effects.alert !== undefined ? r.effects.alert : s.alert,
    }));
    if (r.npcDelta) setNpcs((n) => { const o = { ...n }; for (const k in r.npcDelta) { const d = r.npcDelta[k] || 0; if (d) o[k] = Math.max(0, Math.min(5, (o[k] || 0) + d)); } return o; });
    if (r.romanceFlag && NPCS[r.romanceFlag]) setRomances((rm) => rm.includes(r.romanceFlag) ? rm : [...rm, r.romanceFlag]);
    if (r.item) setInventory((inv) => inv.includes(r.item) ? inv : [...inv, r.item]);
    if (r.location) setLoc(r.location);
    if (r.stardate) setStardate(r.stardate);
  }

  async function go(mode, actionText) {
    if (loading) return;
    const action = (actionText !== undefined ? actionText : input).trim();
    if (mode === "action" && !action) return;
    const prev = input;
    setLoading(true); setError(null); if (mode === "action") setInput("");
    try {
      const r = await callStory({ character, ship, npcs, history, playerAction: action, mode });
      applyResult(r);
      setScene({ text: r.narrative, kind: mode === "redalert" ? "alert" : "story", action: mode === "redalert" ? "RED ALERT" : action });
      setHistory((h) => [...h, { role: "user", text: mode === "redalert" ? "[Red Alert triggered]" : action }, { role: "assistant", text: r.narrative }].slice(-12));
    } catch (e) {
      if (mode === "action") setInput(prev || action);
      setError("Couldn't reach the storyteller.\n\nDetails: " + ((e && e.message) ? e.message : "unknown"));
    } finally { setLoading(false); }
  }

  const allShown = shown >= paragraphs.length;

  return (
    <div style={{ width: "100%", maxWidth: 980 }}>
      <Header alert={ship.alert} title={`VOYAGER · ${rank(ship.rep).toUpperCase()} ${character.name.toUpperCase()}`} />

      <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
        <StatusBox label="Hull" value={`${ship.hull}/5`} color={ship.hull <= 2 ? C.red : C.amber} />
        <StatusBox label="Morale" value={`${ship.morale}/5`} color={C.lilac} />
        <StatusBox label="Rep" value={`${ship.rep}/10`} color={C.gold} />
        <StatusBox label="Location" value={loc} color={C.ice} grow />
        <StatusBox label="Stardate" value={stardate} color={C.ice} />
      </div>

      <div className="layout" style={{ display: "grid", gridTemplateColumns: "1fr 250px", gap: 6, alignItems: "start" }}>
        <div>
          <div ref={scrollRef} style={{ background: "linear-gradient(180deg,#0a0c14,#06070d)", border: "1px solid #23252f", borderRadius: 10, padding: 24, minHeight: 320 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 30, height: 6, background: scene.kind === "alert" ? C.red : C.amber, borderRadius: 3 }} />
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: scene.kind === "alert" ? C.red : C.gold, lineHeight: 1.1 }}>
                {scene.kind === "alert" ? "⚠ Red Alert" : scene.kind === "intro" ? "One Year Out" : "Captain's Log"}
              </h1>
            </div>

            {scene.action && scene.kind === "story" && (
              <div style={{ fontSize: 11, letterSpacing: ".1em", color: C.lilac, fontWeight: 800, textTransform: "uppercase", marginBottom: 12 }}>You: {scene.action}</div>
            )}

            {paragraphs.slice(0, shown).map((p, i) => (
              <p key={i} style={{ fontSize: 16, lineHeight: 1.66, margin: "0 0 15px", color: i === 0 ? C.text : "#d8cdb4", animation: "fadeUp .45s ease both" }}>{p}</p>
            ))}
            {!allShown && <span style={{ color: C.amber, animation: "blink 1s infinite", fontWeight: 800 }}>▌</span>}

            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, color: C.amber }}>
                <span className="spin" style={{ display: "inline-block", width: 14, height: 14, border: `2px solid ${C.amber}`, borderTopColor: "transparent", borderRadius: 999 }} />
                <span style={{ fontSize: 13, letterSpacing: ".1em" }}>The story unfolds…</span>
              </div>
            )}
            {error && <div style={{ marginTop: 14, background: "#260f0f", border: `1px solid ${C.red}`, borderRadius: 8, padding: "10px 14px", color: "#e89a9a", fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{error}</div>}
          </div>

          {/* Action bar */}
          <div style={{ marginTop: 6 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go("action"); }}
                placeholder="What do you do?" disabled={loading}
                style={{ flex: 1, background: "#05060b", border: `2px solid ${input ? C.amber : "#23252f"}`, borderRadius: "6px 4px 4px 16px", color: C.text, fontSize: 15, padding: "13px 16px", outline: "none" }} />
              <button className="lcars-btn" onClick={() => go("action")} disabled={!input.trim() || loading}
                style={{ background: (input.trim() && !loading) ? C.amber : "#1a1c24", color: (input.trim() && !loading) ? "#000" : "#555", border: "none", borderRadius: "4px 16px 16px 4px", padding: "0 22px", fontWeight: 800, fontSize: 13, letterSpacing: ".1em", cursor: (input.trim() && !loading) ? "pointer" : "default", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                Act ▸
              </button>
            </div>
            <button className="lcars-btn" onClick={() => go("redalert")} disabled={loading}
              style={{ width: "100%", marginTop: 6, background: loading ? "#1a1c24" : C.red, color: loading ? "#555" : "#fff", border: "none", borderRadius: "6px 6px 16px 16px", padding: "13px", fontWeight: 800, fontSize: 13.5, letterSpacing: ".14em", cursor: loading ? "default" : "pointer", textTransform: "uppercase", animation: ship.alert === "red" ? "blink 1.2s infinite" : "none" }}>
              ⚠ Trigger Red Alert — Generate a Crisis
            </button>
            <div style={{ fontSize: 10.5, color: C.dim, marginTop: 8, letterSpacing: ".04em" }}>Type anything you want to do, or hit Red Alert to face a fresh emergency. The story responds to you.</div>
          </div>
        </div>

        <SidePanel ch={character} ship={ship} npcs={npcs} inventory={inventory} romances={romances} />
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button onClick={onRestart} style={{ background: C.lilac, color: "#000", border: "none", borderRadius: "16px 4px 4px 16px", padding: "10px 18px", fontWeight: 800, fontSize: 11, letterSpacing: ".12em", cursor: "pointer", textTransform: "uppercase" }}>New Officer</button>
        <div style={{ flex: 1 }} />
        <span style={{ alignSelf: "center", fontSize: 11, color: C.dim, letterSpacing: ".08em" }}>{character.race} {character.role} · {STAT_INFO[Object.keys(ch.stats).reduce((a, b) => ch.stats[a] >= ch.stats[b] ? a : b)]} specialist</span>
      </div>
    </div>
  );
}

export default function VoyagerRPG() {
  const [character, setCharacter] = useState(null);
  const [seed, setSeed] = useState(0);
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Helvetica Neue', Arial, sans-serif", display: "flex", justifyContent: "center", padding: 16 }}>
      <style>{`
        @keyframes fadeUp { from {opacity:0; transform:translateY(8px);} to {opacity:1; transform:none;} }
        @keyframes blink { 0%,100%{opacity:1;} 50%{opacity:.4;} }
        @keyframes spin { to { transform: rotate(360deg);} }
        .spin { animation: spin .8s linear infinite; }
        .lcars-btn { transition: transform .12s, filter .12s; }
        .lcars-btn:hover { filter: brightness(1.12); }
        .lcars-btn:active { transform: scale(.99); }
        .opt:hover { filter: brightness(1.08); }
        button:focus-visible, input:focus-visible { outline: 3px solid ${C.ice}; outline-offset: 2px; }
        input::placeholder { color:#5a564c; }
        @media (max-width: 720px){ .layout { grid-template-columns: 1fr !important; } }
        @media (prefers-reduced-motion: reduce){ *{animation:none !important; transition:none !important;} }
      `}</style>
      {character ? <Game key={seed} ch={character} onRestart={() => { setCharacter(null); setSeed((s) => s + 1); }} /> : <CharacterCreator onComplete={setCharacter} />}
    </div>
  );
}
