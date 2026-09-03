"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  TrendingUp, CalendarCheck, DollarSign, Loader2, ClipboardList, Clock, Users,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AppShell from "./components/AppShell";
import OrderTimeoutNotice from "./components/OrderTimeoutNotice";
import {
  STATUS_STYLE, OPEN_STATUSES, orderFromDb, fmtDate,
  orderChargeTotal, orderProfit, orderTechnicianCostTotal, isInRange, sortOrdersForDashboard, RANGE_LABELS,
} from "../lib/dataHelpers";

export default function DashboardPage() {
  return (
    <AppShell active="dashboard">
      <DashboardContent />
    </AppShell>
  );
}

function DashboardContent() {
  const [orders, setOrders] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("month");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data }, { data: technicianRows }, { data: clientRows }] = await Promise.all([
        supabase.from("orders").select("*, expense_records(*), visits(*, expense_records(*))"),
        supabase.from("technicians").select("*"),
        supabase.from("clients").select("*"),
      ]);
      setOrders((data || []).map(orderFromDb));
      setTechnicians(technicianRows || []);
      setClients(clientRows || []);
      setLoading(false);
    })();
  }, []);

  const openOrders = useMemo(
    () => sortOrdersForDashboard(orders.filter((o) => OPEN_STATUSES.includes(o.status))),
    [orders]
  );

  const stats = useMemo(() => {
    const inRangeCompleted = orders.filter(
      (o) => o.status === "已完成" && isInRange(o.completedAt, range)
    );
    const completedCount = inRangeCompleted.length;
    const completedCharge = inRangeCompleted.reduce((s, o) => s + orderChargeTotal(o), 0);
    const completedProfit = inRangeCompleted.reduce((s, o) => s + orderProfit(o), 0);
    return { completedCount, completedCharge, completedProfit };
  }, [orders, range]);

  if (loading) {
    return (
      <div style={styles.centerState}>
        <Loader2 size={22} color="#1F7A8C" style={{ animation: "spin 1s linear infinite" }} />
        <div style={{ marginTop: 10, color: "#4C6169", fontSize: 13 }}>加载中…</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <div style={styles.title}>总览</div>
          <div style={styles.subtitle}>实时掌握进行中的工单和整体经营情况</div>
        </div>
        <Link href="/orders" style={styles.linkBtn}>
          去工单列表 →
        </Link>
      </div>

      <div style={styles.statsGrid}>
        <div style={{ ...styles.statCard, borderColor: "#1F7A8C40" }}>
          <div style={{ ...styles.statIconWrap, background: "#E3F0F1" }}>
            <TrendingUp size={16} color="#1F7A8C" />
          </div>
          <div>
            <div style={styles.statNum}>{openOrders.length}</div>
            <div style={styles.statLabel}>进行中（不受时间筛选）</div>
          </div>
        </div>

        <div style={{ ...styles.statCard, borderColor: "#3E8F6340" }}>
          <div style={{ ...styles.statIconWrap, background: "#E4F3E9" }}>
            <CalendarCheck size={16} color="#3E8F63" />
          </div>
          <div>
            <div style={styles.statNum}>{stats.completedCount}</div>
            <div style={styles.statLabel}>{RANGE_LABELS[range]}已完成</div>
          </div>
        </div>

        <div style={{ ...styles.statCard, borderColor: "#E08E3340" }}>
          <div style={{ ...styles.statIconWrap, background: "#FBEEDD" }}>
            <DollarSign size={16} color="#E08E33" />
          </div>
          <div>
            <div style={styles.statNum}>¥{stats.completedCharge.toLocaleString()}</div>
            <div style={styles.statLabel}>{RANGE_LABELS[range]}报价总额</div>
          </div>
        </div>

        <div style={{ ...styles.statCard, borderColor: "#3E8F6340" }}>
          <div style={{ ...styles.statIconWrap, background: "#E4F3E9" }}>
            <DollarSign size={16} color="#3E8F63" />
          </div>
          <div>
            <div style={styles.statNum}>¥{stats.completedProfit.toLocaleString()}</div>
            <div style={styles.statLabel}>{RANGE_LABELS[range]}利润</div>
          </div>
        </div>
      </div>

      <div style={styles.rangeTabs}>
        {["week", "month", "year"].map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            style={{ ...styles.rangeTab, ...(range === r ? styles.rangeTabActive : {}) }}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      <div style={styles.sectionTitle}>未完成的工单（{openOrders.length}）</div>

      {openOrders.length === 0 ? (
        <div style={styles.emptyState}>
          <ClipboardList size={28} color="#C7D5D3" />
          <div style={{ marginTop: 8, color: "#4C6169", fontSize: 13 }}>目前没有进行中的工单</div>
        </div>
      ) : (
        <div style={styles.grid}>
          {openOrders.map((o) => {
            const st = STATUS_STYLE[o.status];
            const client = clients.find((item) => item.id === o.clientId);
            const technician = technicians.find((item) => item.id === o.assignedTechnicianId);
            const technicianCost = orderTechnicianCostTotal(o);
            const technicianFeeSettled = !!o.technicianSettled;
            return (
              <Link key={o.id} href={`/orders?open=${o.id}`} style={styles.card}>
                <div style={styles.cardTop}>
                  <span style={styles.ticketNo}>{o.ticketNo}</span>
                  <span style={{ ...styles.statusBadge, background: st.bg, color: st.fg }}>
                    <span style={{ ...styles.dot, background: st.dot }} />
                    {o.status}
                  </span>
                </div>
                <div style={styles.cardMall}>
                  {o.city ? `${o.city} · ` : ""}{o.mall}
                  {o.brand ? <span style={styles.cardBrand}> · {o.brand}</span> : null}
                </div>
                <div style={styles.cardIssue}>{o.issueDesc}</div>
                <OrderTimeoutNotice order={o} now={now} />
                <div style={styles.cardMeta}>
                  <Clock size={12} /> 报修时间：{fmtDate(o.reportTime)}
                </div>
                {(client || technician || technicianCost > 0) && (
                  <div style={styles.cardMetaRow}>
                    {client && <span style={styles.cardMeta}>甲方：{client.name}</span>}
                    <span style={{ ...styles.cardMeta, ...(technicianCost > 0 ? { color: technicianFeeSettled ? "#2C6B45" : "#A5661A" } : {}) }}>
                      <Users size={12} /> {technician ? `指派：${technician.name}` : "师傅：未指派"}
                      {technicianCost > 0 ? ` - ${technicianFeeSettled ? "已结算" : `¥${technicianCost}`}` : ""}
                    </span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { padding: "28px 32px", maxWidth: 1100 },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22 },
  subtitle: { fontSize: 12.5, color: "#8FA1A8", marginTop: 4 },
  linkBtn: { fontSize: 12.5, fontWeight: 600, color: "#1F7A8C", textDecoration: "none" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 },
  statCard: { display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid", borderRadius: 12, padding: "14px 16px" },
  statIconWrap: { width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  statNum: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 19, lineHeight: 1.1 },
  statLabel: { fontSize: 11, color: "#8FA1A8", marginTop: 2 },
  rangeTabs: { display: "flex", gap: 6, marginBottom: 24 },
  rangeTab: { background: "#F4F7F6", border: "1px solid #E2E9E8", borderRadius: 7, padding: "6px 14px", fontSize: 12.5, fontWeight: 600, color: "#4C6169" },
  rangeTabActive: { background: "#E3F0F1", borderColor: "#1F7A8C55", color: "#145560" },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: "#16262B", marginBottom: 12 },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", padding: "50px 0", background: "#fff", border: "1px dashed #E2E9E8", borderRadius: 12 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, paddingBottom: 32 },
  card: { textAlign: "left", background: "#fff", border: "1px solid #E2E9E8", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 6, textDecoration: "none", color: "inherit" },
  cardTop: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  ticketNo: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: "#8FA1A8" },
  statusBadge: { display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20 },
  dot: { width: 6, height: 6, borderRadius: "50%", display: "inline-block" },
  cardMall: { fontWeight: 700, fontSize: 14.5 },
  cardBrand: { fontWeight: 700, color: "#16262B", fontSize: 14.5 },
  cardMetaRow: { display: "flex", gap: 12, marginTop: 2, flexWrap: "wrap" },
  cardIssue: { fontSize: 12.5, color: "#4C6169", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
  cardMeta: { fontSize: 11, color: "#8FA1A8", display: "flex", alignItems: "center", gap: 4 },
  centerState: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0" },
};
