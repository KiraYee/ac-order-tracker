"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Snowflake } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setErr("登录失败：邮箱或密码不正确，请联系管理员确认账号");
      return;
    }
    router.push("/");
  }

  return (
    <div style={styles.wrap}>
      <form style={styles.card} onSubmit={handleLogin}>
        <div style={styles.logoRow}>
          <div style={styles.logoMark}>
            <Snowflake size={18} color="#F5F9F8" strokeWidth={2.2} />
          </div>
          <div>
            <div style={styles.title}>空调维保工单台账</div>
            <div style={styles.sub}>登录你的团队账号</div>
          </div>
        </div>
        <input
          style={styles.input}
          type="email"
          placeholder="邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          style={styles.input}
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {err && <div style={styles.err}>{err}</div>}
        <button style={styles.btn} type="submit" disabled={loading}>
          {loading ? "登录中…" : "登录"}
        </button>
        <div style={styles.hint}>账号由管理员在 Supabase 后台创建，暂不支持自助注册</div>
      </form>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#EEF2F1",
    padding: 16,
  },
  card: {
    background: "#fff",
    padding: 32,
    borderRadius: 14,
    width: 340,
    maxWidth: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    boxShadow: "0 8px 24px rgba(20,60,66,0.08)",
    border: "1px solid #E2E9E8",
  },
  logoRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 },
  logoMark: {
    width: 34,
    height: 34,
    borderRadius: 9,
    background: "linear-gradient(135deg, #1F7A8C, #145560)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16 },
  sub: { fontSize: 11.5, color: "#8FA1A8", marginTop: 1 },
  input: {
    border: "1px solid #E2E9E8",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    outline: "none",
  },
  err: { color: "#C1443D", fontSize: 12 },
  btn: {
    background: "#1F7A8C",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px",
    fontWeight: 600,
    fontSize: 13,
    marginTop: 4,
  },
  hint: { fontSize: 11, color: "#B7C4C2", textAlign: "center", marginTop: 6 },
};
