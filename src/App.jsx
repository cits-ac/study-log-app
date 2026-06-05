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
  return { ...log, nextReview: log.next_review, reviewCount: log.review_count };
}

function toDB(log) {
  return {
    id: log.id,
    date: log.date,
    subject: log.subject,
    content: log.content,
    tags: log.tags,
    interval: log.interval,
    ef: log.ef,
    next_review: log.nextReview,
    review_count: log.reviewCount,
  };
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

async function apiFetchSubjects(token) {
  const res = await fetch("/api/subjects", { headers: authHeaders(token) });
  if (!res.ok) return [];
  return res.json();
}

async function apiAddSubject(name, token) {
  const res = await fetch("/api/subjects", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `追加に失敗しました (${res.status})`);
  return data;
}

async function apiEditSubject(id, name, token) {
  const res = await fetch("/api/subjects", {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ id, name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `更新に失敗しました (${res.status})`);
  return data;
}

async function apiDeleteSubject(id, token) {
  await fetch(`/api/subjects?id=${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
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
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>{log.subject}</span>
          <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)", marginTop: 2, lineHeight: 1.45 }}>{log.content}</div>
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
  const subjectCounts = logs.reduce((acc, l) => {
    acc[l.subject] = (acc[l.subject] || 0) + 1;
    return acc;
  }, {});
  const subjects = Object.entries(subjectCounts).sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(...subjects.map(([, v]) => v), 1);

  const subjectEFs = logs.reduce((acc, l) => {
    if (!acc[l.subject]) acc[l.subject] = [];
    acc[l.subject].push(l.ef);
    return acc;
  }, {});
  const subjectRetention = Object.entries(subjectEFs).map(([subj, efs]) => ({
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
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 10 }}>科目別記録数</div>
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
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 6 }}>EF: 1.3（低）→ 3.0（高）。高いほど定着している科目</div>
        </div>
      )}
    </div>
  );
}

// ─── Subjects Settings ────────────────────────────────────────────────────────
function SubjectsSettings({ token, subjects, onRefresh }) {
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
      await apiAddSubject(newName.trim(), token);
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
      await apiEditSubject(id, editName.trim(), token);
      setEditingId(null);
      await onRefresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("この科目を削除しますか？")) return;
    try {
      await apiDeleteSubject(id, token);
      await onRefresh();
    } catch {
      setError("削除に失敗しました");
    }
  };

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 12 }}>科目管理</div>
      {error && (
        <div style={{ fontSize: 13, color: "#a32d2d", background: "#fcebeb", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>{error}</div>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="新しい科目名"
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
      {subjects.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", textAlign: "center", padding: "20px 0" }}>
          科目がまだありません。上から追加してください。
        </div>
      ) : (
        subjects.map((s) => (
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
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ratedToday, setRatedToday] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLog, setNewLog] = useState({ subject: "", content: "", tags: "" });
  const [savedMsg, setSavedMsg] = useState("");
  const [notifEnabled, setNotifEnabled] = useState(false);

  const token = auth?.token;
  const user = auth?.user;
  const isAdmin = user?.role === "admin";

  const refreshSubjects = useCallback(async () => {
    if (!token) return [];
    const data = await apiFetchSubjects(token);
    setSubjects(data);
    return data;
  }, [token]);

  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    setLoading(true);
    Promise.all([apiFetchLogs(token), apiFetchSubjects(token)])
      .then(([fetchedLogs, fetchedSubjects]) => {
        setLogs(fetchedLogs);
        setSubjects(fetchedSubjects);
        if (fetchedSubjects.length > 0) {
          setNewLog((p) => ({ ...p, subject: fetchedSubjects[0].name }));
        }
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
    setSubjects([]);
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
    if (!newLog.content.trim() || !newLog.subject) return;
    const entry = {
      date: today(),
      subject: newLog.subject,
      content: newLog.content.trim(),
      tags: newLog.tags ? newLog.tags.split(/[,、\s]+/).filter(Boolean) : [newLog.subject],
      interval: 1,
      ef: 2.5,
      nextReview: addDays(today(), 1),
      reviewCount: 0,
    };
    try {
      const created = await apiCreateLog(entry, token);
      setLogs((prev) => [created, ...prev]);
      setNewLog((p) => ({ ...p, content: "", tags: "" }));
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

  const subjectNames = subjects.map((s) => s.name);

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
      {/* Header */}
      <div style={{ padding: "20px 16px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>勉強ログ</div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>エビングハウス忘却曲線で最適復習</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 2, display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
              {user?.username}
              {isAdmin && <Badge color="teal">管理者</Badge>}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1d9e75" }}>{totalStreak}</div>
            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>連続日数</div>
            <button onClick={handleLogout} style={{ fontSize: 11, color: "var(--color-text-tertiary)", background: "none", border: "none", cursor: "pointer", marginTop: 2, padding: 0 }}>ログアウト</button>
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
            <div style={{ fontSize: 13, color: "#854f0b" }}>📚 今日の復習が <strong>{dueToday.length}件</strong> あります</div>
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
                <div style={{ fontSize: 32 }}>🎉</div>
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
                      <Badge color="gray">{log.subject}</Badge>
                      <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{log.nextReview}</span>
                    </div>
                    <div style={{ fontSize: 14, color: "var(--color-text-primary)", lineHeight: 1.4 }}>{log.content}</div>
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

            {showAddForm && (
              <div style={{ background: "var(--color-background-secondary)", borderRadius: 12, padding: "14px", marginBottom: 14, border: "0.5px solid var(--color-border-tertiary)" }}>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>科目</div>
                {subjectNames.length > 0 ? (
                  <select value={newLog.subject} onChange={(e) => setNewLog((p) => ({ ...p, subject: e.target.value }))} style={{ width: "100%", marginBottom: 10, padding: "8px 10px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 14, fontFamily: "inherit" }}>
                    {subjectNames.map((s) => <option key={s}>{s}</option>)}
                  </select>
                ) : (
                  <div style={{ fontSize: 13, color: "#854f0b", background: "#fff7ed", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
                    「設定」タブから科目を追加してください
                  </div>
                )}
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>今日の学習内容</div>
                <textarea value={newLog.content} onChange={(e) => setNewLog((p) => ({ ...p, content: e.target.value }))} placeholder="例: 英単語 p.30〜50、関係代名詞を復習した" rows={3} style={{ width: "100%", marginBottom: 10, padding: "8px 10px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 14, fontFamily: "inherit", resize: "none", boxSizing: "border-box" }} />
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>タグ（カンマ区切り・省略可）</div>
                <input value={newLog.tags} onChange={(e) => setNewLog((p) => ({ ...p, tags: e.target.value }))} placeholder="例: 単語, 試験, 文法" style={{ width: "100%", marginBottom: 12, padding: "8px 10px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
                <button onClick={handleAddLog} disabled={!newLog.subject || !newLog.content.trim()} style={{ width: "100%", padding: "10px", background: !newLog.subject || !newLog.content.trim() ? "#aaa" : "#1d9e75", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  記録して復習スケジュールを設定
                </button>
              </div>
            )}

            {allLogs.map((log) => (
              <div key={log.id} style={{ padding: "12px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Badge color="gray">{log.subject}</Badge>
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{log.date}</span>
                  </div>
                  <DueLabel nextReview={log.nextReview} />
                </div>
                <div style={{ fontSize: 14, color: "var(--color-text-primary)", lineHeight: 1.45, marginBottom: 6 }}>{log.content}</div>
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
          <SubjectsSettings
            token={token}
            subjects={subjects}
            onRefresh={async () => {
              const data = await refreshSubjects();
              if (data?.length > 0 && !newLog.subject) {
                setNewLog((p) => ({ ...p, subject: data[0].name }));
              }
            }}
          />
        )}

        {/* ADMIN */}
        {tab === "admin" && isAdmin && <AdminPanel token={token} />}
      </div>
    </div>
  );
}
