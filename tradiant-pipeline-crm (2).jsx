import { useState, useEffect, useRef } from "react";

// ----- Brand tokens -----
const C = {
  cream: "#FBF7EF",
  card: "#FFFFFF",
  ink: "#2A2118",
  sub: "#7A6E5E",
  line: "#EBE1D2",
  orange: "#E8590C",
  orangeSoft: "#FBE3D4",
  green: "#2E7D4F",
  greenSoft: "#DCEEE3",
  red: "#B3402E",
  redSoft: "#F6DFDA",
};

const STAGES = [
  { id: "open", label: "Open", color: C.orange, soft: C.orangeSoft, outline: true },
  { id: "progress", label: "In Progress", color: C.orange, soft: C.orangeSoft, outline: false },
  { id: "won", label: "Closed Won", color: C.green, soft: C.greenSoft, outline: false },
  { id: "lost", label: "Closed Lost", color: C.red, soft: C.redSoft, outline: false },
];

const STORAGE_KEY = "tradiant-pipeline-team-board";
const SHARED = true; // one board shared by everyone using this artifact

// SHA-256 hash of the team access code (plaintext is never stored in this file)
const PASS_HASH = "130392eafb9b1082c1367b0891a6d12a6baa7a5b5f6a8a7523b7de56931fe713";
const USERS_KEY = "tradiant-pipeline-users";   // shared: profiles for the whole team
const SESSION_KEY = "tradiant-pipeline-session"; // personal: keeps each user signed in

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const fmtMoney = (n) =>
  "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const stamp = () =>
  new Date().toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

const blankForm = { company: "", contact: "", value: "", closeDate: "", note: "" };

export default function TradiantPipeline() {
  const [deals, setDeals] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [checkingLock, setCheckingLock] = useState(true);
  const [mode, setMode] = useState("signup"); // 'signup' | 'signin'
  const [auth, setAuth] = useState({ first: "", last: "", email: "", pin: "", code: "" });
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const saveTimer = useRef(null);

  // ---- Restore session (personal storage, per user/device) ----
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(SESSION_KEY); // personal scope
        if (res && res.value) setCurrentUser(JSON.parse(res.value));
      } catch (e) {
        // Not signed in yet
      }
      setCheckingLock(false);
    })();
  }, []);

  const getUsers = async () => {
    try {
      const res = await window.storage.get(USERS_KEY, SHARED);
      return res && res.value ? JSON.parse(res.value) : {};
    } catch (e) {
      return {};
    }
  };

  const submitAuth = async () => {
    if (authBusy) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      const email = auth.email.trim().toLowerCase();
      const pin = auth.pin;
      if (!email || !email.includes("@") || !pin) {
        setAuthError("Enter a valid email and passcode.");
        return;
      }
      const users = await getUsers();

      if (mode === "signup") {
        const first = auth.first.trim();
        const last = auth.last.trim();
        if (!first || !last) {
          setAuthError("First and last name are required.");
          return;
        }
        const codeHash = await sha256(auth.code.trim());
        if (codeHash !== PASS_HASH) {
          setAuthError("Team access code is incorrect.");
          return;
        }
        if (users[email]) {
          setAuthError("A profile with that email already exists — switch to Sign in.");
          return;
        }
        users[email] = { first, last, pinHash: await sha256(pin) };
        await window.storage.set(USERS_KEY, JSON.stringify(users), SHARED);
        const session = { email, first, last };
        setCurrentUser(session);
        try { await window.storage.set(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
      } else {
        const u = users[email];
        if (!u || u.pinHash !== (await sha256(pin))) {
          setAuthError("Email or passcode doesn't match a profile.");
          return;
        }
        const session = { email, first: u.first, last: u.last };
        setCurrentUser(session);
        try { await window.storage.set(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    setCurrentUser(null);
    setAuth({ first: "", last: "", email: "", pin: "", code: "" });
    setMode("signin");
    try { await window.storage.delete(SESSION_KEY); } catch (e) {}
  };

  const me = () => (currentUser ? currentUser.first : "Someone");

  // ---- Load / refresh shared board ----
  const loadBoard = async () => {
    try {
      const res = await window.storage.get(STORAGE_KEY, SHARED);
      if (res && res.value) setDeals(JSON.parse(res.value));
    } catch (e) {
      // No saved data yet — start fresh
    }
    setLoaded(true);
  };

  useEffect(() => { if (currentUser) loadBoard(); }, [currentUser]);

  // ---- Save on change (debounced) ----
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify(deals), SHARED);
      } catch (e) {
        console.error("Save failed", e);
      }
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [deals, loaded]);

  // ---- Derived ----
  const byStage = (id) => deals.filter((d) => d.stage === id);
  const stageValue = (id) => byStage(id).reduce((s, d) => s + Number(d.value || 0), 0);
  const activeValue = stageValue("open") + stageValue("progress");
  const totalValue = deals.reduce((s, d) => s + Number(d.value || 0), 0);

  // ---- Actions ----
  const openAdd = () => { setForm(blankForm); setEditingId(null); setShowForm(true); };

  const openEdit = (d) => {
    setForm({ company: d.company, contact: d.contact, value: String(d.value), closeDate: d.closeDate, note: "" });
    setEditingId(d.id);
    setShowForm(true);
  };

  const saveForm = () => {
    if (!form.company.trim()) return;
    if (editingId) {
      setDeals((ds) => ds.map((d) => d.id === editingId
        ? { ...d, company: form.company.trim(), contact: form.contact.trim(), value: Number(form.value || 0), closeDate: form.closeDate }
        : d));
    } else {
      const deal = {
        id: "d" + Date.now(),
        company: form.company.trim(),
        contact: form.contact.trim(),
        value: Number(form.value || 0),
        closeDate: form.closeDate,
        stage: "open",
        notes: [
          ...(form.note.trim() ? [{ ts: stamp(), text: `${me()}: ${form.note.trim()}` }] : []),
          { ts: stamp(), text: `${me()} created this deal in Open` },
        ],
      };
      setDeals((ds) => [deal, ...ds]);
    }
    setShowForm(false);
  };

  const moveDeal = (id, stageId) => {
    const label = STAGES.find((s) => s.id === stageId).label;
    setDeals((ds) => ds.map((d) => d.id === id
      ? { ...d, stage: stageId, notes: [{ ts: stamp(), text: `${me()} moved to ${label}` }, ...d.notes] }
      : d));
  };

  const deleteDeal = (id) => {
    setDeals((ds) => ds.filter((d) => d.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const addNote = (id) => {
    if (!noteDraft.trim()) return;
    setDeals((ds) => ds.map((d) => d.id === id
      ? { ...d, notes: [{ ts: stamp(), text: `${me()}: ${noteDraft.trim()}` }, ...d.notes] }
      : d));
    setNoteDraft("");
  };

  // ---- UI bits ----
  const input = {
    width: "100%", padding: "10px 12px", borderRadius: 8,
    border: `1px solid ${C.line}`, background: C.cream, color: C.ink,
    fontSize: 14, outline: "none", boxSizing: "border-box",
  };
  const label = { fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.sub, marginBottom: 4, display: "block" };

  // ---- Lock screen ----
  if (checkingLock) {
    return <div style={{ minHeight: "100vh", background: C.cream }} />;
  }
  if (!currentUser) {
    const authInput = { width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 10, border: `1px solid ${C.line}`, background: C.cream, color: C.ink, fontSize: 14, outline: "none" };
    const eyeBtn = { position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 4, color: C.sub, display: "flex", alignItems: "center" };
    const EyeIcon = ({ open }) => open ? (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
        <line x1="2" y1="2" x2="22" y2="22" />
      </svg>
    ) : (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
    const signup = mode === "signup";

    return (
      <div style={{ minHeight: "100vh", background: C.cream, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: "30px 26px", width: "100%", maxWidth: 400, boxShadow: "0 2px 10px rgba(42,33,24,0.06)" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", color: C.ink }}>
              tradiant<span style={{ color: C.orange }}>.</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: C.sub, marginTop: 4 }}>
              Deal Pipeline
            </div>
            <div style={{ fontSize: 14, color: C.sub, margin: "16px 0 18px" }}>
              {signup
                ? "Create your team profile to access the board."
                : "Sign in to your Tradiant profile."}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {signup && (
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={label}>First name</span>
                  <input style={authInput} value={auth.first} onChange={(e) => { setAuth({ ...auth, first: e.target.value }); setAuthError(""); }} placeholder="First name" />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={label}>Last name</span>
                  <input style={authInput} value={auth.last} onChange={(e) => { setAuth({ ...auth, last: e.target.value }); setAuthError(""); }} placeholder="Last name" />
                </div>
              </div>
            )}
            <div>
              <span style={label}>Email</span>
              <input style={authInput} type="email" value={auth.email} onChange={(e) => { setAuth({ ...auth, email: e.target.value }); setAuthError(""); }} placeholder="you@gotradiant.com" />
            </div>
            <div>
              <span style={label}>Passcode</span>
              <div style={{ position: "relative" }}>
                <input
                  style={{ ...authInput, paddingRight: 42 }}
                  type={showPin ? "text" : "password"}
                  value={auth.pin}
                  onChange={(e) => { setAuth({ ...auth, pin: e.target.value }); setAuthError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && !signup && submitAuth()}
                  placeholder={signup ? "Choose a passcode" : "Your passcode"}
                />
                <button type="button" style={eyeBtn} onClick={() => setShowPin((s) => !s)} aria-label={showPin ? "Hide passcode" : "Show passcode"}>
                  <EyeIcon open={showPin} />
                </button>
              </div>
            </div>
            {signup && (
              <div>
                <span style={label}>Team access code</span>
                <div style={{ position: "relative" }}>
                  <input
                    style={{ ...authInput, paddingRight: 42 }}
                    type={showCode ? "text" : "password"}
                    value={auth.code}
                    onChange={(e) => { setAuth({ ...auth, code: e.target.value }); setAuthError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && submitAuth()}
                    placeholder="Provided by your team lead"
                  />
                  <button type="button" style={eyeBtn} onClick={() => setShowCode((s) => !s)} aria-label={showCode ? "Hide access code" : "Show access code"}>
                    <EyeIcon open={showCode} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {authError && (
            <div style={{ fontSize: 12, color: C.red, marginTop: 10, textAlign: "center" }}>{authError}</div>
          )}

          <button
            onClick={submitAuth}
            disabled={authBusy}
            style={{ width: "100%", marginTop: 16, background: C.orange, color: "#fff", border: "none", borderRadius: 999, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: authBusy ? 0.6 : 1 }}
          >
            {authBusy ? "One moment\u2026" : signup ? "Create profile & enter" : "Sign in"}
          </button>

          <div style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: C.sub }}>
            {signup ? "Already have a profile? " : "New to the board? "}
            <button
              onClick={() => { setMode(signup ? "signin" : "signup"); setAuthError(""); }}
              style={{ background: "none", border: "none", color: C.orange, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}
            >
              {signup ? "Sign in" : "Create your profile"}
            </button>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div style={{ minHeight: "100vh", background: C.cream, color: C.ink, fontFamily: "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.line}`, background: C.cream, padding: "20px 20px 0" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em" }}>
                  tradiant<span style={{ color: C.orange }}>.</span>
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: C.sub }}>
                  Deal Pipeline · Shared Team Board
                </span>
              </div>
              <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
                Signed in as <b style={{ color: C.ink }}>{currentUser.first} {currentUser.last}</b>
                <button onClick={signOut} style={{ background: "none", border: "none", color: C.orange, fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0, marginLeft: 8 }}>
                  Sign out
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={loadBoard}
                title="Pull the latest changes from teammates"
                style={{ background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 999, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                ↻ Refresh
              </button>
              <button
                onClick={openAdd}
                style={{ background: C.orange, color: "#fff", border: "none", borderRadius: 999, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                + New deal
              </button>
            </div>
          </div>

          {/* Pipeline rail */}
          <div style={{ margin: "18px 0 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.sub, marginBottom: 6 }}>
              <span><b style={{ color: C.ink }}>{fmtMoney(activeValue)}</b> active in pipeline</span>
              <span>{fmtMoney(totalValue)} all-time tracked</span>
            </div>
            <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", background: "#F1E8DA" }}>
              {STAGES.map((s) => {
                const v = stageValue(s.id);
                const w = totalValue ? (v / totalValue) * 100 : 0;
                return w > 0 ? (
                  <div key={s.id} title={`${s.label}: ${fmtMoney(v)}`}
                    style={{ width: w + "%", background: s.outline ? "#F3A468" : s.color, transition: "width .3s" }} />
                ) : null;
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Board */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "16px 12px 40px", overflowX: "auto" }}>
        <div style={{ display: "flex", gap: 12, minWidth: 920, alignItems: "flex-start" }}>
          {STAGES.map((stage) => {
            const list = byStage(stage.id);
            return (
              <div key={stage.id} style={{ flex: 1, minWidth: 220 }}>
                {/* Column header */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 6px 10px" }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: 999,
                    background: stage.outline ? "transparent" : stage.color,
                    border: `2px solid ${stage.color}`,
                  }} />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{stage.label}</span>
                  <span style={{ fontSize: 12, color: C.sub }}>{list.length}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: stage.color }}>
                    {fmtMoney(stageValue(stage.id))}
                  </span>
                </div>

                {/* Cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {list.length === 0 && (
                    <div style={{ border: `1px dashed ${C.line}`, borderRadius: 10, padding: "18px 10px", textAlign: "center", fontSize: 12, color: C.sub }}>
                      No deals here yet
                    </div>
                  )}
                  {list.map((d) => {
                    const open = expandedId === d.id;
                    return (
                      <div key={d.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, boxShadow: "0 1px 2px rgba(42,33,24,0.04)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{d.company}</div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: stage.color, whiteSpace: "nowrap" }}>{fmtMoney(d.value)}</div>
                        </div>
                        {d.contact ? <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{d.contact}</div> : null}
                        <div style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>
                          Close: <b style={{ color: C.ink }}>{fmtDate(d.closeDate)}</b>
                        </div>

                        {/* Move controls */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                          {stage.id === "open" && (
                            <MiniBtn color={C.orange} onClick={() => moveDeal(d.id, "progress")}>Start →</MiniBtn>
                          )}
                          {stage.id === "progress" && (
                            <>
                              <MiniBtn color={C.green} onClick={() => moveDeal(d.id, "won")}>Won ✓</MiniBtn>
                              <MiniBtn color={C.red} onClick={() => moveDeal(d.id, "lost")}>Lost ✕</MiniBtn>
                              <MiniBtn color={C.sub} ghost onClick={() => moveDeal(d.id, "open")}>← Back</MiniBtn>
                            </>
                          )}
                          {(stage.id === "won" || stage.id === "lost") && (
                            <MiniBtn color={C.sub} ghost onClick={() => moveDeal(d.id, "progress")}>Reopen</MiniBtn>
                          )}
                          <MiniBtn color={C.sub} ghost onClick={() => { setExpandedId(open ? null : d.id); setNoteDraft(""); }}>
                            {open ? "Hide notes" : `Notes (${d.notes.length})`}
                          </MiniBtn>
                        </div>

                        {/* Notes / activity */}
                        {open && (
                          <div style={{ marginTop: 10, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <input
                                style={{ ...input, padding: "8px 10px", fontSize: 13 }}
                                placeholder="Add a note…"
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addNote(d.id)}
                              />
                              <MiniBtn color={C.orange} onClick={() => addNote(d.id)}>Add</MiniBtn>
                            </div>
                            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
                              {d.notes.map((n, i) => (
                                <div key={i} style={{ fontSize: 12 }}>
                                  <span style={{ color: C.sub }}>{n.ts} · </span>{n.text}
                                </div>
                              ))}
                            </div>
                            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                              <button onClick={() => openEdit(d)} style={{ background: "none", border: "none", color: C.orange, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>Edit deal</button>
                              <button onClick={() => deleteDeal(d.id)} style={{ background: "none", border: "none", color: C.red, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>Delete</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add / Edit modal */}
      {showForm && (
        <div
          onClick={() => setShowForm(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(42,33,24,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 22, width: "100%", maxWidth: 420 }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 16 }}>
              {editingId ? "Edit deal" : "New deal"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <span style={label}>Company *</span>
                <input style={input} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="e.g. Summit Beverage Co." />
              </div>
              <div>
                <span style={label}>Contact</span>
                <input style={input} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Name · email or phone" />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={label}>Deal value ($)</span>
                  <input style={input} type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="25000" />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={label}>Expected close</span>
                  <input style={input} type="date" value={form.closeDate} onChange={(e) => setForm({ ...form, closeDate: e.target.value })} />
                </div>
              </div>
              {!editingId && (
                <div>
                  <span style={label}>First note (optional)</span>
                  <input style={input} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="How did this opportunity come in?" />
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 999, padding: "9px 18px", fontSize: 13, fontWeight: 600, color: C.sub, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={saveForm} style={{ background: C.orange, color: "#fff", border: "none", borderRadius: 999, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: form.company.trim() ? 1 : 0.5 }}>
                {editingId ? "Save changes" : "Add to Open"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniBtn({ children, color, ghost, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: ghost ? "transparent" : color,
        color: ghost ? color : "#fff",
        border: ghost ? `1px solid ${color}40` : "none",
        borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
