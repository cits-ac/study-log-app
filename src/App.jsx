import { useState, useEffect, useCallback } from "react";

// ─── SM-2 algorithm ───────────────────────────────────────────────────────────
function sm2NextInterval(prevInterval, prevEF, quality) {
  // quality: 0-5 (we map user 1-4 → 0,2,3,5)
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

// ─── Initial demo data ────────────────────────────────────────────────────────
const DEMO_LOGS = [
  {
    id: "1",
    date: addDays(today(), -8),
    subject: "英語",
    content: "英単語 p.30〜50 / 副詞の使い方を復習",
    tags: ["英語", "単語"],
    interval: 8,
    ef: 2.5,
    nextReview: today(),
    reviewCount: 1,
  },
  {
    id: "2",
    date: addDays(today(), -3),
    subject: "Python",
    content: "リスト内包表記・ラムダ関数・mapの使い方",
    tags: ["Python", "プログラミング"],
    interval: 3,
    ef: 2.5,
    nextReview: today(),
    reviewCount: 1,
  },
  {
    id: "3",
    date: addDays(today(), -1),
    subject: "世界史",
    content: "フランス革命の流れ・主要人物まとめ",
    tags: ["世界史", "試験"],
    interval: 1,
    ef: 2.5,
    nextReview: addDays(today(), 1),
    reviewCount: 0,
  },
  {
    id: "4",
    date: addDays(today(), -14),
    subject: "英語",
    content: "関係代名詞の総復習・that vs which",
    tags: ["英語", "文法"],
    interval: 14,
    ef: 2.6,
    nextReview: addDays(today(), 2),
    reviewCount: 2,
  },
];

const SUBJECTS = ["英語", "Python", "世界史", "数学", "化学", "その他"];

// ─── AI feedback via Anthropic API ───────────────────────────────────────────
async function getAIFeedback(log) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `あなたは学習コーチです。以下の学習記録に対して、復習のポイントと覚えておくべき重要事項を2〜3文で日本語でアドバイスしてください。簡潔に。\n\n科目: ${log.subject}\n学習内容: ${log.content}\nタグ: ${log.tags.join(", ")}`,
        },
      ],
    }),
  });
  const d = await res.json();
  return d.content?.map((b) => b.text || "").join("") || "フィードバックを取得できませんでした。";
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

function ReviewCard({ log, onRate, onAI, aiText, aiLoading }) {
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

      {!aiText && (
        <button onClick={() => onAI(log)} disabled={aiLoading} style={{ fontSize: 12, color: "var(--color-text-info, #185fa5)", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 10, opacity: aiLoading ? 0.5 : 1 }}>
          {aiLoading ? "AIアドバイス取得中..." : "✦ AIアドバイスを見る"}
        </button>
      )}
      {aiText && (
        <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.65, marginBottom: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-info, #185fa5)", marginRight: 6, letterSpacing: "0.05em" }}>AI</span>
          {aiText}
        </div>
      )}

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

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("today");
  const [logs, setLogs] = useState(DEMO_LOGS);
  const [aiMap, setAiMap] = useState({});
  const [aiLoading, setAiLoading] = useState(null);
  const [ratedToday, setRatedToday] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLog, setNewLog] = useState({ subject: "英語", content: "", tags: "" });
  const [savedMsg, setSavedMsg] = useState("");
  const [notifEnabled, setNotifEnabled] = useState(false);

  // Load from storage
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("study-logs");
        if (r) setLogs(JSON.parse(r.value));
      } catch {}
    })();
  }, []);

  const saveLogs = useCallback(async (updated) => {
    setLogs(updated);
    try { await window.storage.set("study-logs", JSON.stringify(updated)); } catch {}
  }, []);

  const dueToday = logs.filter((l) => daysUntil(l.nextReview) <= 0 && !ratedToday[l.id]);
  const upcoming = logs.filter((l) => daysUntil(l.nextReview) > 0).sort((a, b) => new Date(a.nextReview) - new Date(b.nextReview));
  const allLogs = [...logs].sort((a, b) => new Date(b.date) - new Date(a.date));

  const handleRate = (id, quality) => {
    const log = logs.find((l) => l.id === id);
    if (!log) return;
    const { interval, ef } = sm2NextInterval(log.interval, log.ef, quality);
    const updated = logs.map((l) =>
      l.id === id ? { ...l, interval, ef, nextReview: addDays(today(), interval), reviewCount: (l.reviewCount || 0) + 1 } : l
    );
    saveLogs(updated);
    setRatedToday((p) => ({ ...p, [id]: true }));
  };

  const handleAI = async (log) => {
    setAiLoading(log.id);
    try {
      const text = await getAIFeedback(log);
      setAiMap((p) => ({ ...p, [log.id]: text }));
    } catch {
      setAiMap((p) => ({ ...p, [log.id]: "取得に失敗しました。" }));
    }
    setAiLoading(null);
  };

  const handleAddLog = () => {
    if (!newLog.content.trim()) return;
    const entry = {
      id: Date.now().toString(),
      date: today(),
      subject: newLog.subject,
      content: newLog.content.trim(),
      tags: newLog.tags ? newLog.tags.split(/[,、\s]+/).filter(Boolean) : [newLog.subject],
      interval: 1,
      ef: 2.5,
      nextReview: addDays(today(), 1),
      reviewCount: 0,
    };
    saveLogs([entry, ...logs]);
    setNewLog({ subject: "英語", content: "", tags: "" });
    setShowAddForm(false);
    setSavedMsg("記録しました！次回復習: 明日");
    setTimeout(() => setSavedMsg(""), 3000);
  };

  const requestNotif = async () => {
    if (!("Notification" in window)) { alert("このブラウザはプッシュ通知に対応していません。"); return; }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      setNotifEnabled(true);
      new Notification("勉強ログ", { body: `今日の復習: ${dueToday.length}件あります！`, icon: "📚" });
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

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "0 0 40px", fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ padding: "20px 16px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>勉強ログ</div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>エビングハウス忘却曲線で最適復習</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1d9e75" }}>{totalStreak}</div>
            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>連続日数</div>
          </div>
        </div>

        {/* Stats row */}
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

        {/* Notification banner */}
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
      <div style={{ display: "flex", gap: 0, padding: "0 16px", marginBottom: 14 }}>
        {[
          { key: "today", label: `今日の復習 ${dueToday.length > 0 ? `(${dueToday.length})` : ""}` },
          { key: "schedule", label: "スケジュール" },
          { key: "log", label: "学習記録" },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: "9px 4px", border: "none", borderBottom: tab === key ? "2px solid #1d9e75" : "2px solid transparent", background: "none", fontSize: 13, fontWeight: tab === key ? 600 : 400, color: tab === key ? "#1d9e75" : "var(--color-text-secondary)", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: "0 16px" }}>

        {/* TODAY TAB */}
        {tab === "today" && (
          <div>
            {dueToday.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-text-tertiary)" }}>
                <div style={{ fontSize: 32 }}>🎉</div>
                <div style={{ fontSize: 15, marginTop: 8, fontWeight: 500, color: "var(--color-text-secondary)" }}>今日の復習は完了！</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>次の復習まで休憩してください</div>
              </div>
            ) : (
              dueToday.map((log) => (
                <ReviewCard key={log.id} log={log} onRate={handleRate} onAI={handleAI} aiText={aiMap[log.id]} aiLoading={aiLoading === log.id} />
              ))
            )}
          </div>
        )}

        {/* SCHEDULE TAB */}
        {tab === "schedule" && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 10 }}>復習スケジュール</div>
            {/* Forgetting curve mini-viz */}
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

        {/* LOG TAB */}
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
                <select value={newLog.subject} onChange={(e) => setNewLog((p) => ({ ...p, subject: e.target.value }))} style={{ width: "100%", marginBottom: 10, padding: "8px 10px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 14, fontFamily: "inherit" }}>
                  {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
                </select>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>今日の学習内容</div>
                <textarea value={newLog.content} onChange={(e) => setNewLog((p) => ({ ...p, content: e.target.value }))} placeholder="例: 英単語 p.30〜50、関係代名詞を復習した" rows={3} style={{ width: "100%", marginBottom: 10, padding: "8px 10px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 14, fontFamily: "inherit", resize: "none", boxSizing: "border-box" }} />
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>タグ（カンマ区切り・省略可）</div>
                <input value={newLog.tags} onChange={(e) => setNewLog((p) => ({ ...p, tags: e.target.value }))} placeholder="例: 単語, 試験, 文法" style={{ width: "100%", marginBottom: 12, padding: "8px 10px", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
                <button onClick={handleAddLog} style={{ width: "100%", padding: "10px", background: "#1d9e75", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
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
      </div>
    </div>
  );
}
