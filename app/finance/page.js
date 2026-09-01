"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Wallet, Loader2, CircleDollarSign, Plus, X, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import AppShell from "../components/AppShell";
import { orderFromDb, fmtDateShort, orderChargeTotal, orderVisitCostTotal } from "../../lib/dataHelpers";

export default function FinancePage() {
  return (
    <AppShell active="finance">
      {(userEmail) => <FinanceView userEmail={userEmail} />}
    </AppShell>
  );
}

function FinanceView({ userEmail }) {
  const [orders, setOrders] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [tab, setTab] = useState("receivable"); // receivable | payable | advances
  const [showNewAdvance, setShowNewAdvance] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: ords }, { data: techs }, { data: advs }] = await Promise.all([
      supabase.from("orders").select("*, visits(*)"),
      supabase.from("technicians").select("*"),
      supabase.from("advances").select("*").order("created_at", { ascending: false }),
    ]);
    setOrders((ords || []).map(orderFromDb));
    setTechnicians(techs || []);
    setAdvances(advs || []);
    setLoading(false);
  }

  async function toggleClientSettled(order) {
    const next = !order.clientSettled;
    try {
      const { error } = await supabase
        .from("orders")
        .update({ client_settled: next, client_settled_at: next ? new Date().toISOString() : null })
        .eq("id", order.id);
      if (error) throw error;
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, clientSettled: next } : o)));
    } catch (e) {
      setErrorMsg("更新失败：" + (e.message || "未知错误"));
    }
  }

  async function toggleTechnicianSettled(order) {
    const next = !order.technicianSettled;
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          technician_settled: next,
          technician_settled_at: next ? new Date().toISOString() : null,
        })
        .eq("id", order.id);
      if (error) throw error;
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, technicianSettled: next } : o)));
    } catch (e) {
      setErrorMsg("更新失败：" + (e.message || "未知错误"));
    }
  }

  async function addAdvance(data) {
    try {
      const { data: row, error } = await supabase
        .from("advances")
        .insert({ ...data, created_by: userEmail })
        .select()
        .single();
      if (error) throw error;
      setAdvances((prev) => [row, ...prev]);
      setShowNewAdvance(false);
    } catch (e) {
      setErrorMsg("添加垫付记录失败：" + (e.message || "未知错误"));
    }
  }

  async function toggleReimbursed(advance) {
    const next = !advance.reimbursed;
    try {
      const { error } = await supabase
        .from("advances")
        .update({ reimbursed: next, reimbursed_at: next ? new Date().toISOString() : null })
        .eq("id", advance.id);
      if (error) throw error;
      setAdvances((prev) => prev.map((a) => (a.id === advance.id ? { ...a, reimbursed: next } : a)));
    } catch (e) {
      setErrorMsg("更新失败：" + (e.message || "未知错误"));
    }
  }

  // 应收：已完成但甲方未结算的工单
  const receivables = useMemo(
    () => orders.filter((o) => o.status === "已完成" && !o.clientSettled && orderChargeTotal(o) > 0),
    [orders]
  );
  const receivableTotal = receivables.reduce((s, o) => s + orderChargeTotal(o), 0);

  // 应付师傅：全部来自服务记录中的师傅费用，不读取报价成本
  const technicianPayableTotal = orders.reduce((sum, order) => sum + orderVisitCostTotal(order), 0);
  const technicianUnpaidTotal = orders.reduce(
    (sum, order) => sum + (!order.technicianSettled ? orderVisitCostTotal(order) : 0),
    0
  );
  const technicianPaidTotal = technicianPayableTotal - technicianUnpaidTotal;
  const payables = useMemo(() => {
    return orders
      .filter((o) => orderVisitCostTotal(o) > 0 && !o.technicianSettled)
      .map((o) => {
        const tech = technicians.find((t) => t.id === o.assignedTechnicianId);
        return { order: o, cost: orderVisitCostTotal(o), techName: tech?.name || "未指派师傅" };
      })
      .sort((a, b) => new Date(b.order.updatedAt) - new Date(a.order.updatedAt));
  }, [orders, technicians]);
  const payableTotal = payables.reduce((s, p) => s + p.cost, 0);

  // 垫付待报销
  const pendingAdvances = advances.filter((a) => !a.reimbursed);
  const pendingAdvanceTotal = pendingAdvances.reduce((s, a) => s + (Number(a.amount) || 0), 0);

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.centerState}>
          <Loader2 size={22} color="#1F7A8C" style={{ animation: "spin 1s linear infinite" }} />
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <div style={styles.title}>财务</div>
          <div style={styles.subtitle}>客户费用结算 / 师傅费用结算 / 垫付报销</div>
        </div>
      </div>

      {errorMsg && (
        <div style={styles.errorBar}>
          <AlertTriangle size={14} /> {errorMsg}
        </div>
      )}

      <div style={styles.statsGrid}>
        <div style={{ ...styles.statCard, borderColor: "#E08E3340" }}>
          <div style={styles.statNum}>¥{receivableTotal.toLocaleString()}</div>
          <div style={styles.statLabel}>应收甲方（{receivables.length} 单未结算）</div>
        </div>
        <div style={{ ...styles.statCard, borderColor: "#C1443D40" }}>
          <div style={styles.statNum}>¥{technicianPayableTotal.toLocaleString()}</div>
          <div style={styles.statLabel}>应付师傅（全部服务记录）</div>
        </div>
        <div style={{ ...styles.statCard, borderColor: "#A5661A40" }}>
          <div style={styles.statNum}>¥{technicianUnpaidTotal.toLocaleString()}</div>
          <div style={styles.statLabel}>未支付师傅款（{payables.length} 单）</div>
        </div>
        <div style={{ ...styles.statCard, borderColor: "#3E8F6340" }}>
          <div style={styles.statNum}>¥{technicianPaidTotal.toLocaleString()}</div>
          <div style={styles.statLabel}>已支付师傅款</div>
        </div>
        <div style={{ ...styles.statCard, borderColor: "#1F7A8C40" }}>
          <div style={styles.statNum}>¥{pendingAdvanceTotal.toLocaleString()}</div>
          <div style={styles.statLabel}>待报销（{pendingAdvances.length} 笔）</div>
        </div>
      </div>

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === "receivable" ? styles.tabActive : {}) }} onClick={() => setTab("receivable")}>
          客户费用结算
        </button>
        <button style={{ ...styles.tab, ...(tab === "payable" ? styles.tabActive : {}) }} onClick={() => setTab("payable")}>
          师傅费用结算
        </button>
        <button style={{ ...styles.tab, ...(tab === "advances" ? styles.tabActive : {}) }} onClick={() => setTab("advances")}>
          垫付报销
        </button>
      </div>

      {tab === "receivable" && (
        receivables.length === 0 ? (
          <EmptyState text="没有待结算的工单" />
        ) : (
          <div style={styles.list}>
            {receivables.map((o) => (
              <div key={o.id} style={styles.row}>
                <Link href={`/orders?open=${o.id}`} style={styles.rowMain}>
                  <span style={styles.ticketNo}>{o.ticketNo}</span>
                  <span style={styles.rowMall}>{o.mall}</span>
                  <span style={styles.rowDate}>{fmtDateShort(o.updatedAt)}</span>
                </Link>
                <div style={styles.rowRight}>
                  <span style={styles.amount}>¥{orderChargeTotal(o)}</span>
                  <button style={styles.settleBtn} onClick={() => toggleClientSettled(o)}>
                    <CheckCircle2 size={13} /> 标记已结算
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === "payable" && (
        payables.length === 0 ? (
          <EmptyState text="没有待付款的师傅费用" />
        ) : (
          <div style={styles.list}>
            {payables.map((p) => (
              <div key={p.order.id} style={styles.row}>
                <Link href={`/orders?open=${p.order.id}`} style={styles.rowMain}>
                  <span style={styles.ticketNo}>{p.order.ticketNo}</span>
                  <span style={styles.rowMall}>{p.order.mall} · {p.techName}</span>
                  <span style={styles.rowDate}>{fmtDateShort(p.order.updatedAt)}</span>
                </Link>
                <div style={styles.rowRight}>
                  <span style={styles.amount}>¥{p.cost}</span>
                  <button style={styles.settleBtn} onClick={() => toggleTechnicianSettled(p.order)}>
                    <CheckCircle2 size={13} /> 标记已付款
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === "advances" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button style={styles.primaryBtn} onClick={() => setShowNewAdvance(true)}>
              <Plus size={15} /> 登记垫付
            </button>
          </div>
          {advances.length === 0 ? (
            <EmptyState text="还没有垫付记录" />
          ) : (
            <div style={styles.list}>
              {advances.map((a) => {
                const relatedOrder = a.order_id ? orders.find((o) => o.id === a.order_id) : null;
                return (
                  <div key={a.id} style={styles.row}>
                    <div style={styles.rowMain}>
                      <span style={{ fontWeight: 700 }}>{a.employee_name}</span>
                      <span style={styles.rowMall}>{a.reason || "（无说明）"}</span>
                      {relatedOrder && (
                        <Link href={`/orders?open=${relatedOrder.id}`} style={styles.relatedTag}>
                          {relatedOrder.ticketNo}
                        </Link>
                      )}
                      <span style={styles.rowDate}>{fmtDateShort(a.created_at)}</span>
                    </div>
                    <div style={styles.rowRight}>
                      <span style={styles.amount}>¥{a.amount}</span>
                      <button
                        style={{ ...styles.settleBtn, ...(a.reimbursed ? styles.settleBtnDone : {}) }}
                        onClick={() => toggleReimbursed(a)}
                      >
                        <CircleDollarSign size={13} /> {a.reimbursed ? "已报销" : "标记已报销"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showNewAdvance && (
        <NewAdvanceModal orders={orders} onClose={() => setShowNewAdvance(false)} onSubmit={addAdvance} />
      )}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div style={styles.emptyState}>
      <Wallet size={26} color="#C7D5D3" />
      <div style={{ marginTop: 8, color: "#4C6169", fontSize: 13 }}>{text}</div>
    </div>
  );
}

function NewAdvanceModal({ orders, onClose, onSubmit }) {
  const [employeeName, setEmployeeName] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [relatedOrder, setRelatedOrder] = useState(null);
  const [err, setErr] = useState("");

  const results = orderSearch.trim()
    ? orders.filter((o) => `${o.mall} ${o.ticketNo}`.toLowerCase().includes(orderSearch.toLowerCase())).slice(0, 6)
    : [];

  function submit() {
    if (!employeeName.trim() || !amount) {
      setErr("请填写垫付人和金额");
      return;
    }
    onSubmit({
      employee_name: employeeName.trim(),
      amount: Number(amount) || 0,
      reason: reason.trim() || null,
      order_id: relatedOrder?.id || null,
    });
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>登记垫付</span>
          <button style={styles.iconBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={styles.modalBody}>
          <Field label="垫付人 *">
            <input style={styles.input} value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} placeholder="谁先垫的钱" />
          </Field>
          <Field label="金额 *">
            <input style={styles.input} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="原因说明">
            <input style={styles.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如：垫付配件钱" />
          </Field>
          <Field label="关联工单（选填）">
            {relatedOrder ? (
              <div style={styles.relatedChip}>
                <span>{relatedOrder.ticketNo} · {relatedOrder.mall}</span>
                <button style={{ background: "none", border: "none", color: "#145560" }} onClick={() => setRelatedOrder(null)}>
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div>
                <input style={styles.input} placeholder="搜索商场名或工单号" value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} />
                {results.length > 0 && (
                  <div style={styles.resultsBox}>
                    {results.map((o) => (
                      <button
                        key={o.id}
                        style={styles.resultItem}
                        onClick={() => {
                          setRelatedOrder(o);
                          setOrderSearch("");
                        }}
                      >
                        {o.ticketNo} · {o.mall}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Field>
          {err && <div style={styles.formErr}>{err}</div>}
          <div style={styles.formActions}>
            <button style={styles.ghostBtn} onClick={onClose}>取消</button>
            <button style={styles.primaryBtn} onClick={submit}>保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={styles.fieldLabel}>{label}</div>
      {children}
    </div>
  );
}

const styles = {
  page: { padding: "28px 32px", maxWidth: 1100 },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22 },
  subtitle: { fontSize: 12.5, color: "#8FA1A8", marginTop: 4 },
  errorBar: { background: "#F6E7E6", color: "#A23931", fontSize: 12.5, padding: "10px 14px", borderRadius: 8, display: "flex", alignItems: "center", gap: 6, marginBottom: 12 },
  centerState: { display: "flex", justifyContent: "center", padding: "60px 0" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 20 },
  statCard: { background: "#fff", border: "1px solid", borderRadius: 12, padding: "14px 16px" },
  statNum: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 19 },
  statLabel: { fontSize: 11, color: "#8FA1A8", marginTop: 4 },
  tabs: { display: "flex", gap: 6, marginBottom: 16 },
  tab: { background: "#F4F7F6", border: "1px solid #E2E9E8", borderRadius: 7, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, color: "#4C6169" },
  tabActive: { background: "#E3F0F1", borderColor: "#1F7A8C55", color: "#145560" },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", padding: "50px 0", background: "#fff", border: "1px dashed #E2E9E8", borderRadius: 12 },
  list: { display: "flex", flexDirection: "column", gap: 8, paddingBottom: 32 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: "1px solid #E2E9E8", borderRadius: 10, padding: "12px 14px", flexWrap: "wrap", gap: 10 },
  rowMain: { display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "#16262B", flexWrap: "wrap" },
  ticketNo: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#8FA1A8" },
  rowMall: { fontWeight: 600, fontSize: 13 },
  rowDate: { fontSize: 11, color: "#8FA1A8" },
  relatedTag: { fontSize: 10.5, background: "#E3F0F1", color: "#145560", padding: "2px 7px", borderRadius: 20, fontWeight: 600, textDecoration: "none" },
  rowRight: { display: "flex", alignItems: "center", gap: 10 },
  amount: { fontWeight: 700, fontSize: 14 },
  settleBtn: { display: "flex", alignItems: "center", gap: 4, background: "#F4F7F6", border: "1px solid #E2E9E8", borderRadius: 20, padding: "5px 10px", fontSize: 11.5, fontWeight: 600, color: "#4C6169" },
  settleBtnDone: { background: "#E4F3E9", borderColor: "#3E8F6355", color: "#2C6B45" },
  primaryBtn: { display: "flex", alignItems: "center", gap: 6, background: "#1F7A8C", color: "#fff", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 600 },
  ghostBtn: { background: "#fff", color: "#4C6169", border: "1px solid #E2E9E8", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600 },
  overlay: { position: "fixed", inset: 0, background: "rgba(18,32,36,0.35)", display: "flex", zIndex: 60 },
  modal: { background: "#fff", borderRadius: 14, width: 440, maxWidth: "92vw", maxHeight: "88vh", display: "flex", flexDirection: "column", margin: "auto" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", borderBottom: "1px solid #E2E9E8" },
  modalTitle: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16 },
  modalBody: { padding: 18, overflowY: "auto" },
  iconBtn: { background: "#F4F7F6", border: "none", borderRadius: 8, padding: 6, display: "flex", color: "#4C6169" },
  fieldLabel: { fontSize: 11.5, fontWeight: 600, color: "#4C6169", marginBottom: 5 },
  input: { width: "100%", border: "1px solid #E2E9E8", borderRadius: 7, padding: "8px 10px", fontSize: 13, outline: "none", color: "#16262B", background: "#fff" },
  formErr: { color: "#C1443D", fontSize: 12, marginBottom: 8 },
  formActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 },
  relatedChip: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#E3F0F1", border: "1px solid #1F7A8C40", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, color: "#145560", fontWeight: 600 },
  resultsBox: { marginTop: 6, border: "1px solid #E2E9E8", borderRadius: 8, background: "#fff", overflow: "hidden" },
  resultItem: { display: "block", width: "100%", textAlign: "left", padding: "8px 10px", fontSize: 12, border: "none", borderBottom: "1px solid #F0F3F2", background: "#fff", color: "#16262B" },
};
