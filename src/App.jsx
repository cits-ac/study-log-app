import { useState, useEffect, useCallback } from "react";

// ─── SM-2 algorithm ───────────────────────────────────────────────────────────
function sm2NextInterval(prevInterval, prevEF, quality) {
  const qMap = { 1: 0, 2: 2, 3: 3, 4: 5 };
  const q = qMap[quality] ?? 3;
  let ef = Math.max(1.3, prevEF + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  let interval;
  if (q < 3) {
    interval = 1;
  } else if (prevInterval <= 1) {
    interval = 1;
  } else if (prevInterval === 2) {
    interval = 6;
  } else {
    interval = Math.round(prevInterval * ef);
  }
  return { interval, ef };
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function daysUntil(dateStr) {
  const diff = new Date(dateStr) - new Date(today());
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ─── DB <-> App 変換 ──────────────────────────────────────────────────────────
function fromDB(log) {
  return {
    ...log,
    nextReview: log.next_review,
    reviewCount: log.review_count,
    pageFrom: log.page_from,
    pageTo: log.page_to,
  };
}

function toDB(log) {
  return {
    id: log.id,
    date: log.date,
    subject: log.subject,
    content: log.content,
    book: log.book,
    topic: log.topic,
    page_from: log.pageFrom,
    page_to: log.pageTo,
    tags: log.tags,
    interval: log.interval,
    ef: log.ef,
    next_review: log.nextReview,
    review_count: log.reviewCount,
  };
}

// 書籍名・ページ範囲を読みやすい文字列に
function pageRangeLabel(log) {
  if (log.pageFrom && log.pageTo) return `p.${log.pageFrom}–${log.pageTo}`;
  if (log.pageFrom) return `p.${log.pageFrom}〜`;
  if (log.pageTo) return `〜p.${log.pageTo}`;
  return "";
}

// 書籍が必須・項目名が任意になったため、項目名があればそれを主表示、無ければ書籍名を主表示にする
function logMainText(log) {
  return log.topic || log.book || log.content;
}
// 書籍名を補助行に出すのは、主表示が項目名のとき（重複回避）
function logBookSub(log) {
  return log.topic ? log.book : "";
}

// ─── Auth persistence ─────────────────────────────────────────────────────────
function loadAuth() {
  try { return JSON.parse(localStorage.getItem("studylog_auth") || "null"); }
  catch { return null; }
}
function saveAuth(auth) {
  if (auth) localStorage.setItem("studylog_auth", JSON.stringify(auth));
  else localStorage.removeItem("studylog_auth");
}

// ─── API helpers ──────────────────────────────────────────────────────────────
function authHeaders(token) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function apiLogin(username, password) {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "ログインに失敗しました");
  return data;
}

async function apiFetchLogs(token) {
  const res = await fetch("/api/logs", { headers: authHeaders(token) });
  if (!res.ok) throw new Error("fetch failed");
  return (await res.json()).map(fromDB);
}

async function apiCreateLog(log, token) {
  const res = await fetch("/api/logs", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(toDB(log)),
  });
  if (!res.ok) throw new Error("create failed");
  return fromDB(await res.json());
}

async function apiUpdateLog(log, token) {
  await fetch("/api/logs", {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(toDB(log)),
  });
}

async function apiFetchBooks(token) {
  const res = await fetch("/api/books", { headers: authHeaders(token) });
  if (!res.ok) return [];
  return res.json();
}

async function apiAddBook(name, token) {
  const res = await fetch("/api/books", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `追加に失敗しました (${res.status})`);
  return data;
}

async function apiEditBook(id, name, token) {
  const res = await fetch("/api/books", {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ id, name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `更新に失敗しました (${res.status})`);
  return data;
}

async function apiDeleteBook(id, token) {
  await fetch(`/api/books?id=${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

async function apiFetchTags(token) {
  const res = await fetch("/api/tags", { headers: authHeaders(token) });
  if (!res.ok) return [];
  return res.json();
}

async function apiAddTag(name, token) {
  const res = await fetch("/api/tags", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `追加に失敗しました (${res.status})`);
  return data;
}

async function apiEditTag(id, name, token) {
  const res = await fetch("/api/tags", {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ id, name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `更新に失敗しました (${res.status})`);
  return data;
}

async function apiDeleteTag(id, token) {
  await fetch(`/api/tags?id=${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

async function apiChangePassword(currentPassword, newPassword, token) {
  const res = await fetch("/api/password", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `変更に失敗しました (${res.status})`);
  return data;
}

async function apiFetchUsers(token) {
  const res = await fetch("/api/users", { headers: authHeaders(token) });
  if (!res.ok) throw new Error("fetch failed");
  return res.json();
}

async function apiCreateUser(username, password, role, token) {
  const res = await fetch("/api/users", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ username, password, role }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "作成に失敗しました");
  return data;
}

async function apiDeleteUser(id, token) {
  const res = await fetch(`/api/users?id=${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("削除に失敗しました");
}

// ─── Components ───────────────────────────────────────────────────────────────
function Badge({ children, color = "gray" }) {
  const colors = {
    gray: { bg: "#f0ede8", text: "#5f5e5a" },
    green: { bg: "#e3f5d0", text: "#3b6d11" },
    amber: { bg: "#faeeda", text: "#854f0b" },
    red: { bg: "#fcebeb", text: "#a32d2d" },
    teal: { bg: "#d6f5ec", text: "#0f6e56" },
    blue: { bg: "#e6f1fb", text: "#185fa5" },
  };
  const c = colors[color] || colors.gray;
  return (
    <span style={{ background: c.bg, color: c.text, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, display: "inline-block", letterSpacing: "0.02em" }}>
      {children}
    </span>
  );
}

function DueLabel({ nextReview }) {
  const d = daysUntil(nextReview);
  if (d <= 0) return <Badge color="red">今日が復習日</Badge>;
  if (d === 1) return <Badge color="amber">明日</Badge>;
  if (d <= 3) return <Badge color="amber">{d}日後</Badge>;
  return <Badge color="gray">{d}日後</Badge>;
}

function ReviewCard({ log, onRate }) {
  return (
    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 14, padding: "16px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)", lineHeight: 1.45 }}>{logMainText(log)}</div>
          {(logBookSub(log) || pageRangeLabel(log)) && (
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {logBookSub(log) && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><IcBook />{logBookSub(log)}</span>}
              {pageRangeLabel(log) && <span>{pageRangeLabel(log)}</span>}
            </div>
          )}
        </div>
        <DueLabel nextReview={log.nextReview} />
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
        {log.tags.map((t) => <Badge key={t}>{t}</Badge>)}
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginLeft: 4, alignSelf: "center" }}>学習日: {log.date} · {log.reviewCount}回復習済</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>どれくらい覚えていましたか？</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
        {[
          { q: 1, label: "全然", sub: "1日後", color: "#e24b4a" },
          { q: 2, label: "少し", sub: "1日後", color: "#ef9f27" },
          { q: 3, label: "まあまあ", sub: "~3日後", color: "#639922" },
          { q: 4, label: "完璧", sub: "~7日後", color: "#1d9e75" },
        ].map(({ q, label, sub, color }) => (
          <button key={q} onClick={() => onRate(log.id, q)} style={{ padding: "8px 4px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, background: "var(--color-background-primary)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color }}>{q}</span>
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{label}</span>
            <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) { setError("IDとパスワードを入力してください"); return; }
    setLoading(true);
    setError("");
    try {
      const data = await apiLogin(username.trim(), password);
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", padding: "0 16px", fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>勉強ログ</div>
        <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4 }}>エビングハウス忘却曲線で最適復習</div>
      </div>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>ID</div>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ユーザーID"
            autoComplete="username"
            style={{ width: "100%", padding: "10px 12px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 15, fontFamily: "inherit", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" }}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>パスワード</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード"
            autoComplete="current-password"
            style={{ width: "100%", padding: "10px 12px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 15, fontFamily: "inherit", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" }}
          />
        </div>
        {error && (
          <div style={{ fontSize: 13, color: "#a32d2d", background: "#fcebeb", border: "0.5px solid #f5a5a5", borderRadius: 8, padding: "8px 12px" }}>{error}</div>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 4, padding: "11px", background: loading ? "#aaa" : "#1d9e75", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: loading ? "default" : "pointer", fontFamily: "inherit" }}
        >
          {loading ? "ログイン中..." : "ログイン"}
        </button>
      </form>
    </div>
  );
}

// ─── Analytics View ───────────────────────────────────────────────────────────
function AnalyticsView({ logs }) {
  // タグ単位で集計（1つの記録が複数タグに寄与）
  const tagCounts = logs.reduce((acc, l) => {
    (l.tags || []).forEach((t) => { acc[t] = (acc[t] || 0) + 1; });
    return acc;
  }, {});
  const subjects = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(...subjects.map(([, v]) => v), 1);

  const tagEFs = logs.reduce((acc, l) => {
    (l.tags || []).forEach((t) => {
      if (!acc[t]) acc[t] = [];
      acc[t].push(l.ef);
    });
    return acc;
  }, {});
  const subjectRetention = Object.entries(tagEFs).map(([subj, efs]) => ({
    subject: subj,
    avgEF: efs.reduce((s, v) => s + v, 0) / efs.length,
  })).sort((a, b) => b.avgEF - a.avgEF);

  const studyDates = new Set(logs.map((l) => l.date));
  const calDays = Array.from({ length: 28 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (27 - i));
    return d.toISOString().split("T")[0];
  });

  if (logs.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-text-tertiary)", fontSize: 14 }}>
        学習記録を追加すると分析が表示されます
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 20 }}>
        {[
          { val: logs.length, label: "総記録数" },
          { val: new Set(logs.map((l) => l.date)).size, label: "学習日数" },
          { val: (logs.reduce((s, l) => s + l.reviewCount, 0) / logs.length).toFixed(1), label: "平均復習回数" },
        ].map(({ val, label }) => (
          <div key={label} style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1d9e75" }}>{val}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 8 }}>学習カレンダー（直近4週）</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
          {["日", "月", "火", "水", "木", "金", "土"].map((d) => (
            <div key={d} style={{ fontSize: 10, color: "var(--color-text-tertiary)", textAlign: "center", marginBottom: 2 }}>{d}</div>
          ))}
          {calDays.map((date) => (
            <div
              key={date}
              title={date}
              style={{
                aspectRatio: "1",
                background: studyDates.has(date) ? "#1d9e75" : "var(--color-background-secondary)",
                borderRadius: 3,
                opacity: studyDates.has(date) ? 1 : 0.6,
              }}
            />
          ))}
        </div>
      </div>

      {subjects.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 10 }}>タグ別記録数</div>
          {subjects.map(([subj, count]) => (
            <div key={subj} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <div style={{ width: 56, fontSize: 12, color: "var(--color-text-secondary)", textAlign: "right", flexShrink: 0 }}>{subj}</div>
              <div style={{ flex: 1, background: "var(--color-background-secondary)", borderRadius: 4, height: 16, overflow: "hidden" }}>
                <div style={{ width: `${(count / maxCount) * 100}%`, background: "#1d9e75", height: "100%", borderRadius: 4 }} />
              </div>
              <div style={{ width: 20, fontSize: 12, color: "var(--color-text-secondary)", textAlign: "right" }}>{count}</div>
            </div>
          ))}
        </div>
      )}

      {subjectRetention.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 10 }}>定着スコア（EF平均）</div>
          {subjectRetention.map(({ subject, avgEF }) => (
            <div key={subject} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <div style={{ width: 56, fontSize: 12, color: "var(--color-text-secondary)", textAlign: "right", flexShrink: 0 }}>{subject}</div>
              <div style={{ flex: 1, background: "var(--color-background-secondary)", borderRadius: 4, height: 16, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, ((avgEF - 1.3) / (3.0 - 1.3)) * 100)}%`, background: avgEF >= 2.5 ? "#1d9e75" : avgEF >= 2.0 ? "#ef9f27" : "#e24b4a", height: "100%", borderRadius: 4 }} />
              </div>
              <div style={{ width: 36, fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "right" }}>{avgEF.toFixed(2)}</div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 6 }}>EF: 1.3（低）→ 3.0（高）。高いほど定着しているタグ</div>
        </div>
      )}
    </div>
  );
}

// ─── Account Menu ─────────────────────────────────────────────────────────────
function AccountMenuItem({ icon, label, danger, onClick }) {
  const [hover, setHover] = useState(false);
  const accent = danger ? "#e24b4a" : "#1d9e75";
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 12, textAlign: "left",
        padding: "10px 12px", margin: "2px 8px", borderRadius: 10, boxSizing: "border-box",
        width: "calc(100% - 16px)",
        background: hover ? (danger ? "rgba(226,75,74,0.10)" : "rgba(29,158,117,0.10)") : "transparent",
        border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500, fontFamily: "inherit",
        color: danger ? "#e24b4a" : "var(--color-text-primary)", transition: "background 0.12s",
      }}
    >
      <span style={{ width: 30, height: 30, borderRadius: 9, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: hover ? (danger ? "rgba(226,75,74,0.16)" : "rgba(29,158,117,0.16)") : "var(--color-background-secondary)", color: accent, transition: "background 0.12s" }}>{icon}</span>
      {label}
    </button>
  );
}

const IconKey = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7.5" cy="15.5" r="4.5" /><path d="M10.7 12.3 21 2" /><path d="m16 7 3 3" /><path d="m18 5 2 2" />
  </svg>
);
const IconLogout = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

function IcBook({ size = 13, style: s = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...s }}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function IcCheck({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle" }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IcCircleCheck({ size = 48, color = "#1d9e75" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

// ─── Edit Log Modal ───────────────────────────────────────────────────────────
function EditLogModal({ log, books, tagNames, token, onClose, onSave }) {
  const [form, setForm] = useState({
    book: log.book || "",
    topic: log.topic || "",
    pageFrom: log.pageFrom != null ? String(log.pageFrom) : "",
    pageTo: log.pageTo != null ? String(log.pageTo) : "",
    content: log.content || "",
    tags: log.tags || [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleTag = (name) => setForm((p) => ({
    ...p,
    tags: p.tags.includes(name) ? p.tags.filter((t) => t !== name) : [...p.tags, name],
  }));

  const handleSave = async () => {
    if (!form.book) { setError("教科書・書籍名は必須です"); return; }
    setSaving(true);
    setError("");
    try {
      const updated = {
        ...log,
        book: form.book.trim(),
        topic: form.topic.trim() || null,
        pageFrom: form.pageFrom ? parseInt(form.pageFrom, 10) : null,
        pageTo: form.pageTo ? parseInt(form.pageTo, 10) : null,
        content: form.content.trim() || form.topic.trim() || form.book.trim(),
        tags: form.tags,
      };
      await apiUpdateLog(updated, token);
      onSave(updated);
      onClose();
    } catch {
      setError("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const fieldStyle = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" };
  const labelStyle = { fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4, marginTop: 12 };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,28,0.55)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto", background: "var(--color-background-primary, #ffffff)", border: "0.5px solid var(--color-border-secondary, #e3e0da)", boxShadow: "0 20px 56px rgba(0,0,0,0.36)", borderRadius: 16, padding: 20, fontFamily: "inherit" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>記録を編集</div>
          <button onClick={onClose} style={{ fontSize: 20, color: "var(--color-text-tertiary)", background: "none", border: "none", cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 16 }}>学習日: {log.date}</div>

        {error && <div style={{ fontSize: 13, color: "#a32d2d", background: "#fcebeb", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>{error}</div>}

        <div style={{ ...labelStyle, marginTop: 0 }}>教科書・書籍名 <span style={{ color: "#e24b4a" }}>*</span></div>
        {books.length > 0 ? (
          <select value={form.book} onChange={(e) => setForm((p) => ({ ...p, book: e.target.value }))} style={fieldStyle}>
            <option value="">（選択してください）</option>
            {books.map((b) => <option key={b}>{b}</option>)}
          </select>
        ) : (
          <input value={form.book} onChange={(e) => setForm((p) => ({ ...p, book: e.target.value }))} style={fieldStyle} />
        )}

        <div style={labelStyle}>項目名（省略可）</div>
        <input value={form.topic} onChange={(e) => setForm((p) => ({ ...p, topic: e.target.value }))} placeholder="例: 関係代名詞 / 第3章 化学結合" style={fieldStyle} />

        <div style={labelStyle}>ページ範囲（省略可）</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="number" inputMode="numeric" value={form.pageFrom} onChange={(e) => setForm((p) => ({ ...p, pageFrom: e.target.value }))} placeholder="開始" style={{ ...fieldStyle, textAlign: "center" }} />
          <span style={{ color: "var(--color-text-tertiary)", fontSize: 14 }}>〜</span>
          <input type="number" inputMode="numeric" value={form.pageTo} onChange={(e) => setForm((p) => ({ ...p, pageTo: e.target.value }))} placeholder="終了" style={{ ...fieldStyle, textAlign: "center" }} />
          <span style={{ color: "var(--color-text-tertiary)", fontSize: 13, whiteSpace: "nowrap" }}>ページ</span>
        </div>

        <div style={labelStyle}>メモ（省略可）</div>
        <textarea value={form.content} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} placeholder="覚えにくかった点、間違えた箇所など" rows={2} style={{ ...fieldStyle, resize: "none" }} />

        <div style={labelStyle}>タグ（複数選択可・省略可）</div>
        {tagNames.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {tagNames.map((t) => {
              const active = form.tags.includes(t);
              return (
                <button key={t} type="button" onClick={() => toggleTag(t)} style={{ padding: "5px 12px", borderRadius: 99, fontSize: 13, fontFamily: "inherit", cursor: "pointer", border: active ? "1px solid #1d9e75" : "0.5px solid var(--color-border-secondary)", background: active ? "#e3f5d0" : "var(--color-background-primary)", color: active ? "#3b6d11" : "var(--color-text-secondary)", fontWeight: active ? 600 : 400 }}>
                  {active ? <><IcCheck />{" "}</> : null}{t}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#854f0b", background: "#fff7ed", borderRadius: 8, padding: "8px 12px" }}>
            「設定」タブからタグを登録すると選べます
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", background: "none", color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>キャンセル</button>
          <button onClick={handleSave} disabled={saving || !form.book} style={{ flex: 2, padding: "10px", background: saving || !form.book ? "#aaa" : "#1d9e75", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saving || !form.book ? "default" : "pointer", fontFamily: "inherit" }}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Password Change ──────────────────────────────────────────────────────────
function PasswordModal({ token, onClose, onDone }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!current || !next) { setError("すべての項目を入力してください"); return; }
    if (next.length < 6) { setError("新しいパスワードは6文字以上にしてください"); return; }
    if (next !== confirm) { setError("新しいパスワードが一致しません"); return; }
    setSaving(true);
    try {
      await apiChangePassword(current, next, token);
      onDone("パスワードを変更しました");
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { width: "100%", padding: "10px 12px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 15, fontFamily: "inherit", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,28,0.55)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 360, background: "var(--color-background-primary, #ffffff)", border: "0.5px solid var(--color-border-secondary, #e3e0da)", boxShadow: "0 20px 56px rgba(0,0,0,0.36)", borderRadius: 16, padding: 20, fontFamily: "inherit" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>パスワード変更</div>
          <button onClick={onClose} style={{ fontSize: 20, color: "var(--color-text-tertiary)", background: "none", border: "none", cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {error && <div style={{ fontSize: 13, color: "#a32d2d", background: "#fcebeb", borderRadius: 8, padding: "8px 12px" }}>{error}</div>}
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="現在のパスワード" autoComplete="current-password" style={inputStyle} />
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="新しいパスワード（6文字以上）" autoComplete="new-password" style={inputStyle} />
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="新しいパスワード（確認）" autoComplete="new-password" onKeyDown={(e) => e.key === "Enter" && handleSubmit()} style={inputStyle} />
          <button onClick={handleSubmit} disabled={saving} style={{ marginTop: 4, padding: "11px", background: saving ? "#aaa" : "#1d9e75", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: saving ? "default" : "pointer", fontFamily: "inherit" }}>
            {saving ? "変更中..." : "パスワードを変更"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Master List Settings（科目・書籍など汎用のCRUDリスト） ──────────────────────
function MasterListSettings({ token, title, label, items, onAdd, onEdit, onDelete, onRefresh }) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    setError("");
    try {
      await onAdd(newName.trim(), token);
      setNewName("");
      await onRefresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (id) => {
    if (!editName.trim()) return;
    setSaving(true);
    setError("");
    try {
      await onEdit(id, editName.trim(), token);
      setEditingId(null);
      await onRefresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(`この${label}を削除しますか？`)) return;
    try {
      await onDelete(id, token);
      await onRefresh();
    } catch {
      setError("削除に失敗しました");
    }
  };

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 12 }}>{title}</div>
      {error && (
        <div style={{ fontSize: 13, color: "#a32d2d", background: "#fcebeb", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>{error}</div>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder={`新しい${label}名`}
          style={{ flex: 1, padding: "8px 10px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
        />
        <button
          onClick={handleAdd}
          disabled={saving || !newName.trim()}
          style={{ padding: "8px 14px", background: saving || !newName.trim() ? "#aaa" : "#1d9e75", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
        >
          追加
        </button>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", textAlign: "center", padding: "20px 0" }}>
          {label}がまだありません。上から追加してください。
        </div>
      ) : (
        items.map((s) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
            {editingId === s.id ? (
              <>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleEdit(s.id); if (e.key === "Escape") setEditingId(null); }}
                  autoFocus
                  style={{ flex: 1, padding: "6px 8px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 6, fontSize: 14, fontFamily: "inherit", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                />
                <button onClick={() => handleEdit(s.id)} style={{ fontSize: 12, color: "#1d9e75", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: "2px 6px" }}>保存</button>
                <button onClick={() => setEditingId(null)} style={{ fontSize: 12, color: "var(--color-text-tertiary)", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}>キャンセル</button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: 14, color: "var(--color-text-primary)" }}>{s.name}</span>
                <button onClick={() => { setEditingId(s.id); setEditName(s.name); }} style={{ fontSize: 12, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}>編集</button>
                <button onClick={() => handleDelete(s.id)} style={{ fontSize: 12, color: "#e24b4a", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}>削除</button>
              </>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
function AdminPanel({ token }) {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "user" });
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const loadUsers = useCallback(async () => {
    try {
      const data = await apiFetchUsers(token);
      setUsers(data);
    } catch {
      setError("ユーザ取得に失敗しました");
    } finally {
      setLoadingUsers(false);
    }
  }, [token]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleCreate = async () => {
    if (!newUser.username || !newUser.password) { setError("IDとパスワードは必須です"); return; }
    setError("");
    try {
      await apiCreateUser(newUser.username, newUser.password, newUser.role, token);
      setNewUser({ username: "", password: "", role: "user" });
      setShowForm(false);
      setMsg("ユーザを作成しました");
      setTimeout(() => setMsg(""), 3000);
      await loadUsers();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async (id, username) => {
    if (!window.confirm(`「${username}」を削除しますか？`)) return;
    try {
      await apiDeleteUser(id, token);
      await loadUsers();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}>ユーザ管理</div>
        <button onClick={() => setShowForm(!showForm)} style={{ fontSize: 13, fontWeight: 600, color: "#1d9e75", background: "none", border: "0.5px solid #1d9e75", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" }}>
          {showForm ? "キャンセル" : "+ ユーザ追加"}
        </button>
      </div>

      {error && <div style={{ fontSize: 13, color: "#a32d2d", background: "#fcebeb", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>{error}</div>}
      {msg && <div style={{ fontSize: 13, color: "#3b6d11", background: "#e3f5d0", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>{msg}</div>}

      {showForm && (
        <div style={{ background: "var(--color-background-secondary)", borderRadius: 12, padding: 14, marginBottom: 14, border: "0.5px solid var(--color-border-tertiary)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input value={newUser.username} onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))} placeholder="ID" style={{ padding: "8px 10px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
            <input value={newUser.password} onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))} type="password" placeholder="パスワード" style={{ padding: "8px 10px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
            <select value={newUser.role} onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))} style={{ padding: "8px 10px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}>
              <option value="user">一般ユーザ</option>
              <option value="admin">管理者</option>
            </select>
            <button onClick={handleCreate} style={{ padding: "10px", background: "#1d9e75", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>作成</button>
          </div>
        </div>
      )}

      {loadingUsers ? (
        <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", textAlign: "center", padding: "20px 0" }}>読み込み中...</div>
      ) : (
        users.map((u) => (
          <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 14, color: "var(--color-text-primary)", fontWeight: 500 }}>{u.username}</span>
              <span style={{ marginLeft: 8 }}>
                <Badge color={u.role === "admin" ? "teal" : "blue"}>{u.role === "admin" ? "管理者" : "一般"}</Badge>
              </span>
            </div>
            <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{u.created_at?.split("T")[0]}</span>
            <button onClick={() => handleDelete(u.id, u.username)} style={{ fontSize: 12, color: "#e24b4a", background: "none", border: "0.5px solid #e24b4a", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit" }}>削除</button>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [auth, setAuth] = useState(loadAuth);
  const [tab, setTab] = useState("today");
  const [logs, setLogs] = useState([]);
  const [books, setBooks] = useState([]);
  const [tagList, setTagList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ratedToday, setRatedToday] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLog, setNewLog] = useState({ book: "", topic: "", pageFrom: "", pageTo: "", content: "", tags: [] });
  const [savedMsg, setSavedMsg] = useState("");
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [editingLog, setEditingLog] = useState(null);

  const token = auth?.token;
  const user = auth?.user;
  const isAdmin = user?.role === "admin";

  const refreshBooks = useCallback(async () => {
    if (!token) return [];
    const data = await apiFetchBooks(token);
    setBooks(data);
    return data;
  }, [token]);

  const refreshTags = useCallback(async () => {
    if (!token) return [];
    const data = await apiFetchTags(token);
    setTagList(data);
    return data;
  }, [token]);

  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    setLoading(true);
    Promise.all([apiFetchLogs(token), apiFetchBooks(token), apiFetchTags(token)])
      .then(([fetchedLogs, fetchedBooks, fetchedTags]) => {
        setLogs(fetchedLogs);
        setBooks(fetchedBooks);
        setTagList(fetchedTags);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [auth, token]);

  const handleLogin = (data) => {
    const authData = { token: data.access_token, user: data.user };
    saveAuth(authData);
    setAuth(authData);
  };

  const handleLogout = () => {
    saveAuth(null);
    setAuth(null);
    setLogs([]);
    setBooks([]);
    setTagList([]);
    setTab("today");
    setLoading(true);
  };

  const dueToday = logs.filter((l) => daysUntil(l.nextReview) <= 0 && !ratedToday[l.id]);
  const upcoming = logs.filter((l) => daysUntil(l.nextReview) > 0).sort((a, b) => new Date(a.nextReview) - new Date(b.nextReview));
  const allLogs = [...logs].sort((a, b) => new Date(b.date) - new Date(a.date));

  const handleRate = async (id, quality) => {
    const log = logs.find((l) => l.id === id);
    if (!log) return;
    const { interval, ef } = sm2NextInterval(log.interval, log.ef, quality);
    const updated = { ...log, interval, ef, nextReview: addDays(today(), interval), reviewCount: (log.reviewCount || 0) + 1 };
    setLogs((prev) => prev.map((l) => (l.id === id ? updated : l)));
    setRatedToday((p) => ({ ...p, [id]: true }));
    try { await apiUpdateLog(updated, token); } catch {}
  };

  const handleAddLog = async () => {
    if (!newLog.book) return;
    const topic = newLog.topic.trim();
    const book = newLog.book.trim();
    const pageFrom = newLog.pageFrom ? parseInt(newLog.pageFrom, 10) : null;
    const pageTo = newLog.pageTo ? parseInt(newLog.pageTo, 10) : null;
    const entry = {
      date: today(),
      subject: null,
      book: book || null,
      topic: topic || null,
      pageFrom,
      pageTo,
      content: newLog.content.trim() || topic || book,
      tags: newLog.tags,
      interval: 1,
      ef: 2.5,
      nextReview: addDays(today(), 1),
      reviewCount: 0,
    };
    try {
      const created = await apiCreateLog(entry, token);
      setLogs((prev) => [created, ...prev]);
      // 書籍名は次の記録でも使い回せるよう残す
      setNewLog((p) => ({ ...p, topic: "", pageFrom: "", pageTo: "", content: "", tags: [] }));
      setShowAddForm(false);
      setSavedMsg("記録しました！次回復習: 明日");
      setTimeout(() => setSavedMsg(""), 3000);
    } catch {}
  };

  const requestNotif = async () => {
    if (!("Notification" in window)) { alert("このブラウザはプッシュ通知に対応していません。"); return; }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      setNotifEnabled(true);
      new Notification("勉強ログ", { body: `今日の復習: ${dueToday.length}件あります！` });
    }
  };

  const totalStreak = (() => {
    const dates = [...new Set(logs.map((l) => l.date))].sort().reverse();
    let streak = 0;
    let d = today();
    for (const date of dates) {
      if (date === d) { streak++; d = addDays(d, -1); }
      else break;
    }
    return streak;
  })();

  if (!auth) return <LoginScreen onLogin={handleLogin} />;

  if (loading) {
    return (
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "60px 16px", fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>読み込み中...</div>
      </div>
    );
  }

  const bookNames = books.map((b) => b.name);
  const tagNames = tagList.map((t) => t.name);
  const toggleTag = (name) => setNewLog((p) => ({
    ...p,
    tags: p.tags.includes(name) ? p.tags.filter((t) => t !== name) : [...p.tags, name],
  }));

  const tabs = [
    { key: "today", label: `今日${dueToday.length > 0 ? `(${dueToday.length})` : ""}` },
    { key: "schedule", label: "予定" },
    { key: "log", label: "記録" },
    { key: "analytics", label: "分析" },
    { key: "settings", label: "設定" },
    ...(isAdmin ? [{ key: "admin", label: "管理" }] : []),
  ];

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "0 0 40px", fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif" }}>
      {showPasswordModal && (
        <PasswordModal
          token={token}
          onClose={() => setShowPasswordModal(false)}
          onDone={(m) => { setSavedMsg(m); setTimeout(() => setSavedMsg(""), 3000); }}
        />
      )}
      {editingLog && (
        <EditLogModal
          log={editingLog}
          books={bookNames}
          tagNames={tagNames}
          token={token}
          onClose={() => setEditingLog(null)}
          onSave={(updated) => {
            setLogs((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
            setSavedMsg("記録を更新しました");
            setTimeout(() => setSavedMsg(""), 3000);
          }}
        />
      )}
      {/* Header */}
      <div style={{ padding: "20px 16px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>勉強ログ</div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>エビングハウス忘却曲線で最適復習</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ position: "relative", display: "inline-block" }}>
              <button
                onClick={() => setAccountMenuOpen((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", background: accountMenuOpen ? "var(--color-background-secondary)" : "none", border: "0.5px solid", borderColor: accountMenuOpen ? "var(--color-border-secondary)" : "transparent", borderRadius: 99, cursor: "pointer", fontFamily: "inherit", padding: "4px 8px 4px 10px", marginLeft: "auto", color: "var(--color-text-secondary)", transition: "background 0.12s" }}
              >
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#1d9e75", color: "#fff", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {(user?.username || "?").charAt(0).toUpperCase()}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{user?.username}</span>
                <span style={{ fontSize: 8, color: "var(--color-text-tertiary)", transform: accountMenuOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▼</span>
              </button>
              {accountMenuOpen && (
                <>
                  <div onClick={() => setAccountMenuOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,28,0.45)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)", zIndex: 40 }} />
                  <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 10, background: "var(--color-background-primary, #ffffff)", border: "0.5px solid var(--color-border-secondary, #e3e0da)", borderRadius: 18, boxShadow: "0 16px 48px rgba(0,0,0,0.34)", zIndex: 50, width: 248, overflow: "hidden", textAlign: "left" }}>
                    <div style={{ padding: "16px 16px 14px", background: "linear-gradient(135deg, rgba(29,158,117,0.12), rgba(29,158,117,0.02))", display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ width: 42, height: 42, borderRadius: "50%", background: "linear-gradient(135deg, #25b386, #1d9e75)", color: "#fff", fontSize: 19, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 8px rgba(29,158,117,0.4)" }}>
                        {(user?.username || "?").charAt(0).toUpperCase()}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.username}</div>
                        <div style={{ marginTop: 3 }}>
                          <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: isAdmin ? "#d6f5ec" : "#e6f1fb", color: isAdmin ? "#0f6e56" : "#185fa5" }}>
                            {isAdmin ? "管理者" : "一般ユーザ"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ height: "0.5px", background: "var(--color-border-tertiary)" }} />
                    <div style={{ padding: "6px 0" }}>
                      <AccountMenuItem icon={IconKey} label="パスワード変更" onClick={() => { setShowPasswordModal(true); setAccountMenuOpen(false); }} />
                      <AccountMenuItem icon={IconLogout} label="ログアウト" danger onClick={() => { setAccountMenuOpen(false); handleLogout(); }} />
                    </div>
                  </div>
                </>
              )}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1d9e75", marginTop: 6 }}>{totalStreak}</div>
            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>連続日数</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, margin: "14px 0" }}>
          {[
            { val: dueToday.length, label: "今日の復習", color: dueToday.length > 0 ? "#e24b4a" : "#1d9e75" },
            { val: upcoming.length, label: "今後の予定", color: "#185fa5" },
            { val: logs.length, label: "総記録数", color: "var(--color-text-primary)" },
          ].map(({ val, label, color }) => (
            <div key={label} style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color }}>{val}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {dueToday.length > 0 && (
          <div style={{ background: "#fff7ed", border: "0.5px solid #fac775", borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, color: "#854f0b", display: "flex", alignItems: "center", gap: 6 }}><IcBook size={14} style={{ color: "#854f0b" }} />今日の復習が <strong>{dueToday.length}件</strong> あります</div>
            {!notifEnabled && (
              <button onClick={requestNotif} style={{ fontSize: 11, background: "#fac775", color: "#412402", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontWeight: 600 }}>通知ON</button>
            )}
          </div>
        )}

        {savedMsg && (
          <div style={{ background: "#e3f5d0", border: "0.5px solid #97c459", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#3b6d11", marginBottom: 10 }}>{savedMsg}</div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", padding: "0 16px", marginBottom: 14 }}>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{ flex: 1, padding: "9px 2px", border: "none", borderBottom: tab === key ? "2px solid #1d9e75" : "2px solid transparent", background: "none", fontSize: 12, fontWeight: tab === key ? 600 : 400, color: tab === key ? "#1d9e75" : "var(--color-text-secondary)", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap" }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: "0 16px" }}>
        {/* TODAY */}
        {tab === "today" && (
          <div>
            {dueToday.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-text-tertiary)" }}>
                <IcCircleCheck />
                <div style={{ fontSize: 15, marginTop: 8, fontWeight: 500, color: "var(--color-text-secondary)" }}>今日の復習は完了！</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>次の復習まで休憩してください</div>
              </div>
            ) : (
              dueToday.map((log) => <ReviewCard key={log.id} log={log} onRate={handleRate} />)
            )}
          </div>
        )}

        {/* SCHEDULE */}
        {tab === "schedule" && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 10 }}>復習スケジュール</div>
            <div style={{ background: "var(--color-background-secondary)", borderRadius: 12, padding: "14px", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 8 }}>忘却曲線イメージ</div>
              <svg viewBox="0 0 300 80" style={{ width: "100%", height: 80 }}>
                <path d="M0,10 C20,10 40,30 80,50 C120,65 180,70 300,74" fill="none" stroke="#e24b4a" strokeWidth="1.5" strokeDasharray="4 2" opacity="0.6" />
                <path d="M0,10 C10,10 20,12 30,10 C50,10 55,30 70,28 C90,26 95,28 110,25 C130,22 135,24 155,20 C180,16 185,18 220,14 C250,12 270,12 300,10" fill="none" stroke="#1d9e75" strokeWidth="2" />
                <text x="50" y="58" fontSize="9" fill="#e24b4a" opacity="0.8">復習なし</text>
                <text x="160" y="8" fontSize="9" fill="#1d9e75">最適復習</text>
              </svg>
            </div>
            {upcoming.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", textAlign: "center", padding: "20px 0" }}>予定されている復習はありません</div>
            ) : (
              upcoming.map((log) => (
                <div key={log.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <div style={{ minWidth: 44, textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: daysUntil(log.nextReview) <= 2 ? "#ef9f27" : "var(--color-text-primary)" }}>{daysUntil(log.nextReview)}</div>
                    <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>日後</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{log.nextReview}</span>
                    </div>
                    <div style={{ fontSize: 14, color: "var(--color-text-primary)", lineHeight: 1.4 }}>{logMainText(log)}</div>
                    {(logBookSub(log) || pageRangeLabel(log)) && (
                      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                        {logBookSub(log)}{logBookSub(log) && pageRangeLabel(log) ? " · " : ""}{pageRangeLabel(log)}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* LOG */}
        {tab === "log" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}>学習記録</div>
              <button onClick={() => setShowAddForm(!showAddForm)} style={{ fontSize: 13, fontWeight: 600, color: "#1d9e75", background: "none", border: "0.5px solid #1d9e75", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" }}>
                {showAddForm ? "キャンセル" : "+ 記録を追加"}
              </button>
            </div>

            {showAddForm && (() => {
              const fieldStyle = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" };
              const labelStyle = { fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4, marginTop: 12 };
              const canSubmit = !!newLog.book;
              return (
              <div style={{ background: "var(--color-background-secondary)", borderRadius: 12, padding: "14px", marginBottom: 14, border: "0.5px solid var(--color-border-tertiary)" }}>
                {/* 教科書・書籍名（必須・事前登録からプルダウン選択） */}
                <div style={{ ...labelStyle, marginTop: 0 }}>教科書・書籍名 <span style={{ color: "#e24b4a" }}>*</span></div>
                {bookNames.length > 0 ? (
                  <select value={newLog.book} onChange={(e) => setNewLog((p) => ({ ...p, book: e.target.value }))} style={fieldStyle}>
                    <option value="">（選択してください）</option>
                    {bookNames.map((b) => <option key={b}>{b}</option>)}
                  </select>
                ) : (
                  <div style={{ fontSize: 12, color: "#854f0b", background: "#fff7ed", borderRadius: 8, padding: "8px 12px" }}>
                    「設定」タブから書籍を登録すると選べます
                  </div>
                )}

                {/* 項目名（省略可） */}
                <div style={labelStyle}>項目名（省略可）</div>
                <input
                  value={newLog.topic}
                  onChange={(e) => setNewLog((p) => ({ ...p, topic: e.target.value }))}
                  placeholder="例: 関係代名詞 / 第3章 化学結合"
                  style={fieldStyle}
                />

                {/* ページ範囲 */}
                <div style={labelStyle}>ページ範囲（省略可）</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={newLog.pageFrom}
                    onChange={(e) => setNewLog((p) => ({ ...p, pageFrom: e.target.value }))}
                    placeholder="開始"
                    style={{ ...fieldStyle, textAlign: "center" }}
                  />
                  <span style={{ color: "var(--color-text-tertiary)", fontSize: 14 }}>〜</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={newLog.pageTo}
                    onChange={(e) => setNewLog((p) => ({ ...p, pageTo: e.target.value }))}
                    placeholder="終了"
                    style={{ ...fieldStyle, textAlign: "center" }}
                  />
                  <span style={{ color: "var(--color-text-tertiary)", fontSize: 13, whiteSpace: "nowrap" }}>ページ</span>
                </div>

                {/* メモ */}
                <div style={labelStyle}>メモ（省略可）</div>
                <textarea
                  value={newLog.content}
                  onChange={(e) => setNewLog((p) => ({ ...p, content: e.target.value }))}
                  placeholder="覚えにくかった点、間違えた箇所など"
                  rows={2}
                  style={{ ...fieldStyle, resize: "none" }}
                />

                {/* タグ（事前登録から複数選択） */}
                <div style={labelStyle}>タグ（複数選択可・省略可）</div>
                {tagNames.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {tagNames.map((t) => {
                      const active = newLog.tags.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => toggleTag(t)}
                          style={{ padding: "5px 12px", borderRadius: 99, fontSize: 13, fontFamily: "inherit", cursor: "pointer", border: active ? "1px solid #1d9e75" : "0.5px solid var(--color-border-secondary)", background: active ? "#e3f5d0" : "var(--color-background-primary)", color: active ? "#3b6d11" : "var(--color-text-secondary)", fontWeight: active ? 600 : 400 }}
                        >
                          {active ? <><IcCheck />{" "}</> : null}{t}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#854f0b", background: "#fff7ed", borderRadius: 8, padding: "8px 12px" }}>
                    「設定」タブからタグを登録すると選べます
                  </div>
                )}

                <button onClick={handleAddLog} disabled={!canSubmit} style={{ width: "100%", marginTop: 16, padding: "10px", background: !canSubmit ? "#aaa" : "#1d9e75", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: canSubmit ? "pointer" : "default", fontFamily: "inherit" }}>
                  記録して復習スケジュールを設定
                </button>
              </div>
              );
            })()}

            {allLogs.map((log) => (
              <div key={log.id} style={{ padding: "12px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{log.date}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button onClick={() => setEditingLog(log)} style={{ fontSize: 11, color: "var(--color-text-secondary)", background: "none", border: "0.5px solid var(--color-border-secondary)", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit" }}>編集</button>
                    <DueLabel nextReview={log.nextReview} />
                  </div>
                </div>
                <div style={{ fontSize: 14, color: "var(--color-text-primary)", lineHeight: 1.45, marginBottom: 4 }}>{logMainText(log)}</div>
                {(logBookSub(log) || pageRangeLabel(log)) && (
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {logBookSub(log) && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><IcBook />{logBookSub(log)}</span>}
                    {pageRangeLabel(log) && <span>{pageRangeLabel(log)}</span>}
                  </div>
                )}
                {log.content && log.content !== log.topic && log.content !== log.book && (
                  <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 6, lineHeight: 1.4 }}>{log.content}</div>
                )}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {log.tags.map((t) => <Badge key={t}>{t}</Badge>)}
                  <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", alignSelf: "center", marginLeft: 4 }}>復習間隔: {log.interval}日 · {log.reviewCount}回済</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ANALYTICS */}
        {tab === "analytics" && <AnalyticsView logs={logs} />}

        {/* SETTINGS */}
        {tab === "settings" && (
          <div>
            <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
              <MasterListSettings
                token={token}
                title="タグ管理"
                label="タグ"
                items={tagList}
                onAdd={apiAddTag}
                onEdit={apiEditTag}
                onDelete={apiDeleteTag}
                onRefresh={refreshTags}
              />
            </div>
            <MasterListSettings
              token={token}
              title="書籍・教科書管理"
              label="書籍"
              items={books}
              onAdd={apiAddBook}
              onEdit={apiEditBook}
              onDelete={apiDeleteBook}
              onRefresh={refreshBooks}
            />
          </div>
        )}

        {/* ADMIN */}
        {tab === "admin" && isAdmin && <AdminPanel token={token} />}
      </div>
    </div>
  );
}
