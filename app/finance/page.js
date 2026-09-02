"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Wallet, Loader2, CircleDollarSign, Plus, X, CheckCircle2, AlertTriangle, Pencil,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import AppShell from "../components/AppShell";
import { orderFromDb, fmtDateShort, orderChargeTotal, orderTechnicianCostTotal } from "../../lib/dataHelpers";

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
  const [editingAdvance, setEditingAdvance] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: ords }, { data: techs }, { data: advs }] = await Promise.all([
      supabase.from("orders").select("*, expense_records(*), visits(*, expense_records(*))"),
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
    if (!next && !window.confirm("甲方已结算，确认撤销结算吗？")) return;
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
    if (!next && !window.confirm("师傅费用已结算，确认撤销结算吗？")) return;
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

  async function updateAdvance(id, data) {
    try {
      const { data: row, error } = await supabase
        .from("advances")
        .update(data)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      setAdvances((prev) => prev.map((advance) => (advance.id === id ? row : advance)));
      setEditingAdvance(null);
    } catch (e) {
      setErrorMsg("修改垫付记录失败：" + (e.message || "未知错误"));
    }
  }

  async function toggleReimbursed(advance) {
    const next = !advance.reimbursed;
    if (!next && !window.confirm("该垫付已报销，确认撤销报销吗？")) return;
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
    () => orders.filter((o) => orderChargeTotal(o) > 0),
    [orders]
  );
  const receivableTotal = receivables.reduce((s, o) => s + orderChargeTotal(o), 0);

  // 应付师傅：只统计 expense_records.type=technician_fee，不包含保险费等其他成本
  const technicianPayableTotal = orders.reduce((sum, order) => sum + orderTechnicianCostTotal(order), 0);
  const technicianUnpaidTotal = orders.reduce(
    (sum, order) => sum + (!order.technicianSettled ? orderTechnicianCostTotal(order) : 0),
    0
  );
  const technicianPaidTotal = technicianPayableTotal - technicianUnpaidTotal;
  const payables = useMemo(() => {
    return orders
      .filter((o) => orderTechnicianCostTotal(o) > 0)
      .map((o) => {
        const tech = technicians.find((t) => t.id === o.assignedTechnicianId);
        return { order: o, cost: orderTechnicianCostTotal(o), techName: tech?.name || "未指派师傅" };
      })
      .sort((a, b) => new Date(b.order.updatedAt) - new Date(a.order.updatedAt));
  }, [orders, technicians]);
  const payableTotal = payables.reduce((s, p) => s + p.cost, 0);

  // 垫付待报销
  const pendingAdvances = advances.filter((a) => !a.reimbursed);
  const pendingAdvanceTotal = pendingAdvances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const completedReceivables = receivables.filter((o) => o.clientSettled);
  const pendingReceivables = receivables.filter((o) => !o.clientSettled);
  const completedPayables = payables.filter((p) => p.order.technicianSettled);
  const pendingPayables = payables.filter((p) => !p.order.technicianSettled);
  const completedAdvances = advances.filter((a) => a.reimbursed);

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
        <button style={{ ...styles.tab, ...(tab === "all" ? styles.tabActive : {}) }} onClick={() => setTab("all")}>
          全部
        </button>
      </div>

      {tab === "receivable" && (
        <FinanceSectionGroup
          pending={pendingReceivables}
          completed={completedReceivables}
          emptyText="没有客户费用记录"
          render={(o) => <FinanceOrderRow key={o.id} order={o} kind="client" amount={orderChargeTotal(o)} settled={o.clientSettled} settledAt={o.clientSettledAt} onSettle={() => toggleClientSettled(o)} />}
        />
      )}

      {tab === "payable" && (
        <FinanceSectionGroup
          pending={pendingPayables}
          completed={completedPayables}
          emptyText="没有师傅费用记录"
          render={(p) => <FinanceOrderRow key={p.order.id} order={p.order} kind="technician" amount={p.cost} settled={p.order.technicianSettled} settledAt={p.order.technicianSettledAt} suffix={p.techName} onSettle={() => toggleTechnicianSettled(p.order)} />}
        />
      )}

      {tab === "advances" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button style={styles.primaryBtn} onClick={() => { setEditingAdvance(null); setShowNewAdvance(true); }}>
              <Plus size={15} /> 登记垫付
            </button>
          </div>
          <FinanceSectionGroup
            pending={pendingAdvances}
            completed={completedAdvances}
            emptyText="还没有垫付记录"
            render={(a) => <FinanceAdvanceRow key={a.id} advance={a} orders={orders} onEdit={() => setEditingAdvance(a)} onToggle={() => toggleReimbursed(a)} />}
          />
        </div>
      )}

      {tab === "all" && (
        <FinanceSectionGroup
          pending={[
            ...pendingReceivables.map((o) => ({ kind: "client", createdAt: o.createdAt, item: o })),
            ...pendingPayables.map((p) => ({ kind: "technician", createdAt: p.order.createdAt, item: p })),
            ...pendingAdvances.map((a) => ({ kind: "advance", createdAt: a.created_at, item: a })),
          ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))}
          completed={[
            ...completedReceivables.map((o) => ({ kind: "client", createdAt: o.createdAt, item: o })),
            ...completedPayables.map((p) => ({ kind: "technician", createdAt: p.order.createdAt, item: p })),
            ...completedAdvances.map((a) => ({ kind: "advance", createdAt: a.created_at, item: a })),
          ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))}
          emptyText="还没有财务记录"
          render={(entry) => entry.kind === "client"
            ? <FinanceOrderRow key={`client-${entry.item.id}`} order={entry.item} kind="client" amount={orderChargeTotal(entry.item)} settled={entry.item.clientSettled} settledAt={entry.item.clientSettledAt} onSettle={() => toggleClientSettled(entry.item)} />
            : entry.kind === "technician"
              ? <FinanceOrderRow key={`technician-${entry.item.order.id}`} order={entry.item.order} kind="technician" amount={entry.item.cost} settled={entry.item.order.technicianSettled} settledAt={entry.item.order.technicianSettledAt} suffix={entry.item.techName} onSettle={() => toggleTechnicianSettled(entry.item.order)} />
              : <FinanceAdvanceRow key={`advance-${entry.item.id}`} advance={entry.item} orders={orders} onEdit={() => setEditingAdvance(entry.item)} onToggle={() => toggleReimbursed(entry.item)} />}
        />
      )}

      {(showNewAdvance || editingAdvance) && (
        <NewAdvanceModal
          key={editingAdvance?.id || "new"}
          orders={orders}
          initial={editingAdvance}
          onClose={() => { setShowNewAdvance(false); setEditingAdvance(null); }}
          onSubmit={(data) => editingAdvance ? updateAdvance(editingAdvance.id, data) : addAdvance(data)}
          locked={!!editingAdvance?.reimbursed}
          onUnlock={async () => {
            if (!window.confirm("该记录已报销，确认撤销报销并允许修改金额吗？")) return;
            await toggleReimbursed(editingAdvance);
            setEditingAdvance((current) => current ? { ...current, reimbursed: false, reimbursed_at: null } : current);
          }}
        />
      )}
    </div>
  );
}

function FinanceSectionGroup({ pending, completed, render, emptyText }) {
  return (
    <div>
      <div style={styles.groupTitle}>待处理（{pending.length}）</div>
      {pending.length > 0 ? <div style={styles.list}>{pending.map(render)}</div> : <EmptyState text={`没有${emptyText.replace("记录", "待处理记录")}`} />}
      <div style={styles.groupTitle}>已完成（{completed.length}）</div>
      {completed.length > 0 ? <div style={styles.list}>{completed.map(render)}</div> : <div style={styles.completedEmpty}>暂无已完成记录</div>}
    </div>
  );
}

function FinanceOrderRow({ order, kind, amount, settled, settledAt, createdAt, suffix, onSettle }) {
  const color = kind === "client" ? "#1F7A8C" : "#3E8F63";
  const label = kind === "client" ? "客户" : "师傅";
  return (
    <div style={styles.row}>
      <Link href={`/orders?open=${order.id}`} style={styles.rowMain}>
        <span style={{ ...styles.typeTag, background: `${color}18`, color }}>{label}</span>
        <span style={styles.ticketNo}>{order.ticketNo}</span>
        <span style={styles.rowMall}>{order.mall}{suffix ? ` · ${suffix}` : ""}</span>
        <span style={styles.rowDate}>登记：{fmtDateShort(createdAt || order.createdAt)}</span>
        <span style={styles.rowDate}>结算：{settledAt ? fmtDateShort(settledAt) : "—"}</span>
      </Link>
      <div style={styles.rowRight}>
        <span style={styles.amount}>¥{amount}</span>
        <button style={{ ...styles.settleBtn, ...(settled ? styles.settleBtnDone : {}) }} onClick={onSettle}>
          <CheckCircle2 size={13} /> {settled ? "撤销结算" : kind === "client" ? "标记已结算" : "标记已付款"}
        </button>
      </div>
    </div>
  );
}

function FinanceAdvanceRow({ advance, orders, onEdit, onToggle }) {
  const relatedOrder = advance.order_id ? orders.find((o) => o.id === advance.order_id) : null;
  return (
    <div style={styles.row}>
      <div style={styles.rowMain}>
        <span style={{ ...styles.typeTag, background: "#FBEEDD", color: "#A5661A" }}>垫付</span>
        <span style={{ fontWeight: 700 }}>{advance.employee_name}</span>
        <span style={styles.rowMall}>{advance.reason || "（无说明）"}</span>
        {relatedOrder && <Link href={`/orders?open=${relatedOrder.id}`} style={styles.relatedTag}>{relatedOrder.ticketNo}</Link>}
        <span style={styles.rowDate}>登记：{fmtDateShort(advance.created_at)}</span>
        <span style={styles.rowDate}>报销：{advance.reimbursed_at ? fmtDateShort(advance.reimbursed_at) : "—"}</span>
      </div>
      <div style={styles.rowRight}>
        <span style={styles.amount}>¥{advance.amount}</span>
        <button style={styles.settleBtn} onClick={onEdit}><Pencil size={13} /> 编辑</button>
        <button style={{ ...styles.settleBtn, ...(advance.reimbursed ? styles.settleBtnDone : {}) }} onClick={onToggle}>
          <CircleDollarSign size={13} /> {advance.reimbursed ? "撤销报销" : "标记已报销"}
        </button>
      </div>
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

function NewAdvanceModal({ orders, initial, onClose, onSubmit, locked = false, onUnlock }) {
  const [employeeName, setEmployeeName] = useState(initial?.employee_name || "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [reason, setReason] = useState(initial?.reason || "");
  const [orderSearch, setOrderSearch] = useState("");
  const [relatedOrder, setRelatedOrder] = useState(() => orders.find((order) => order.id === initial?.order_id) || null);
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
          <span style={styles.modalTitle}>{initial ? "编辑垫付" : "登记垫付"}</span>
          <button style={styles.iconBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={styles.modalBody}>
          <Field label="垫付人 *">
            <input style={styles.input} value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} placeholder="谁先垫的钱" />
          </Field>
          <Field label="金额 *">
            <input style={styles.input} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={locked} readOnly={locked} />
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
            {locked && <button style={styles.ghostBtn} type="button" onClick={onUnlock}>撤销报销后修改金额</button>}
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
  groupTitle: { fontSize: 12.5, fontWeight: 700, color: "#145560", margin: "14px 0 8px" },
  completedEmpty: { color: "#8FA1A8", fontSize: 12, padding: "10px 0 18px" },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", padding: "50px 0", background: "#fff", border: "1px dashed #E2E9E8", borderRadius: 12 },
  list: { display: "flex", flexDirection: "column", gap: 8, paddingBottom: 32 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: "1px solid #E2E9E8", borderRadius: 10, padding: "12px 14px", flexWrap: "wrap", gap: 10 },
  rowMain: { display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "#16262B", flexWrap: "wrap" },
  ticketNo: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#8FA1A8" },
  rowMall: { fontWeight: 600, fontSize: 13 },
  rowDate: { fontSize: 11, color: "#8FA1A8" },
  relatedTag: { fontSize: 10.5, background: "#E3F0F1", color: "#145560", padding: "2px 7px", borderRadius: 20, fontWeight: 600, textDecoration: "none" },
  typeTag: { display: "inline-flex", alignItems: "center", borderRadius: 12, padding: "3px 7px", fontSize: 10.5, fontWeight: 700 },
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
