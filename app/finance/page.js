"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Wallet, Loader2, CircleDollarSign, Plus, X, CheckCircle2, AlertTriangle, Pencil,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import AppShell from "../components/AppShell";
import { orderFromDb, orderStoreDisplay, fmtDateShort, orderChargeTotal, orderTechnicianCostTotal, orderTechnicianUnpaidCostTotal, orderTechnicianFeeRecords, technicianFeeStatusColor } from "../../lib/dataHelpers";

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
  const [employees, setEmployees] = useState([]);
  const [stores, setStores] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [tab, setTab] = useState("receivable"); // receivable | payable | advances
  const [showNewAdvance, setShowNewAdvance] = useState(false);
  const [editingAdvance, setEditingAdvance] = useState(null);
  const [financeFilters, setFinanceFilters] = useState({ range: "all", start: "", end: "", storeId: "", followerId: "", technicianId: "", employeeName: "" });
  const searchParams = useSearchParams();

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (["receivable", "payable", "advances", "all"].includes(requestedTab)) setTab(requestedTab);
  }, [searchParams]);

  async function load() {
    setLoading(true);
    const [{ data: ords }, { data: techs }, { data: advs }, { data: storeRows }, { data: employeeRows }] = await Promise.all([
      supabase.from("orders").select("*, expense_records(*), visits(*, expense_records(*))"),
      supabase.from("technicians").select("*"),
      supabase.from("advances").select("*").order("created_at", { ascending: false }),
      supabase.from("stores").select("*"),
      supabase.from("employees").select("*").order("name"),
    ]);
    const storeById = new Map((storeRows || []).map((store) => [store.id, store]));
    setOrders((ords || []).map(orderFromDb).map((order) => ({ ...order, store: storeById.get(order.storeId) || null })));
    setTechnicians(techs || []);
    setEmployees(employeeRows || []);
    setStores(storeRows || []);
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

  async function toggleTechnicianSettled(item) {
    const next = item.record.isSettled !== true;
    if (!next && !window.confirm("师傅费用已结算，确认撤销结算吗？")) return;
    try {
      const settledAt = next ? new Date().toISOString() : null;
      const { error } = await supabase
        .from("expense_records")
        .update({ is_settled: next, settled_at: settledAt, updated_at: new Date().toISOString() })
        .eq("id", item.record.id);
      if (error) throw error;
      await load();
    } catch (e) {
      setErrorMsg("更新失败：" + (e.message || "未知错误"));
    }
  }

  async function batchSettle(items, kind) {
    const now = new Date().toISOString();
    const results = await Promise.all(items.map(async (item) => {
      try {
        if (kind === "technician") {
          const { error } = await supabase
            .from("expense_records")
            .update({ is_settled: true, settled_at: now, updated_at: new Date().toISOString() })
            .eq("id", item.record.id);
          return { error };
        }
        const update = kind === "client"
          ? { client_settled: true, client_settled_at: now }
          : { reimbursed: true, reimbursed_at: now };
        const table = kind === "advance" ? "advances" : "orders";
        const { error } = await supabase.from(table).update(update).eq("id", item.id);
        return { error };
      } catch (error) {
        return { error };
      }
    }));
    const failed = results.filter((result) => result.error).length;
    await load();
    if (failed) {
      setErrorMsg(`${items.length}条中有${failed}条更新失败`);
    } else {
      setErrorMsg("");
    }
    return { failed };
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
  const pendingReceivables = receivables.filter((o) => !o.clientSettled);
  const receivableTotal = pendingReceivables.reduce((s, o) => s + orderChargeTotal(o), 0);

  // 应付师傅：只统计 expense_records.type=technician_fee，不包含保险费等其他成本
  const technicianPayableTotal = orders.reduce((sum, order) => sum + orderTechnicianCostTotal(order), 0);
  const technicianUnpaidTotal = orders.reduce(
    (sum, order) => sum + orderTechnicianUnpaidCostTotal(order),
    0
  );
  const technicianPaidTotal = technicianPayableTotal - technicianUnpaidTotal;
  const payables = useMemo(() => {
    return orders.flatMap((order) => orderTechnicianFeeRecords(order, technicians).map((record) => ({
      order,
      record,
      id: record.id,
      amount: Number(record.amount) || 0,
      unpaidCost: record.isSettled === false ? Number(record.amount) || 0 : 0,
      techName: record.technicianName,
    }))).sort((a, b) => new Date(b.order.updatedAt) - new Date(a.order.updatedAt));
  }, [orders, technicians]);
  const payableTotal = payables.reduce((s, p) => s + p.unpaidCost, 0);

  // 垫付待报销
  const pendingAdvances = advances.filter((a) => !a.reimbursed);
  const pendingAdvanceTotal = pendingAdvances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const completedReceivables = receivables.filter((o) => o.clientSettled);
  const completedPayables = payables.filter((p) => p.record.isSettled === true);
  const pendingPayables = payables.filter((p) => p.record.isSettled === false);
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
        <div style={styles.statLabel}>未支付师傅款（{pendingPayables.length} 笔）</div>
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

      {tab === "receivable" && <FinanceFilteredGroups kind="client" pending={pendingReceivables} completed={completedReceivables} orders={orders} stores={stores} technicians={technicians} employees={employees} filters={financeFilters} setFilters={setFinanceFilters} onBatchSettle={batchSettle} render={(o, options) => <FinanceOrderRow key={o.id} order={o} kind="client" amount={orderChargeTotal(o)} settled={o.clientSettled} settledAt={o.clientSettledAt} showTypeTag={false} showSettlementDate={options.showSettlementDate} onSettle={() => toggleClientSettled(o)} />} />}

      {tab === "payable" && <FinanceFilteredGroups kind="technician" pending={pendingPayables} completed={completedPayables} orders={orders} stores={stores} technicians={technicians} employees={employees} filters={financeFilters} setFilters={setFinanceFilters} onBatchSettle={batchSettle} render={(p, options) => <FinanceOrderRow key={p.record.id} order={p.order} kind="technician" amount={p.amount} settled={p.record.isSettled === true} settledAt={p.record.settledAt} suffix={`${p.techName}${p.record.visitNumber ? ` · 第${p.record.visitNumber}次上门` : ""}`} showTypeTag={false} showSettlementDate={options.showSettlementDate} onSettle={() => toggleTechnicianSettled(p)} />} />}

      {tab === "advances" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button style={styles.primaryBtn} onClick={() => { setEditingAdvance(null); setShowNewAdvance(true); }}>
              <Plus size={15} /> 登记垫付
            </button>
          </div>
          <FinanceFilteredGroups kind="advance" pending={pendingAdvances} completed={completedAdvances} orders={orders} stores={stores} technicians={technicians} employees={employees} filters={financeFilters} setFilters={setFinanceFilters} onBatchSettle={batchSettle} render={(a, options) => <FinanceAdvanceRow key={a.id} advance={a} orders={orders} showTypeTag={false} showSettlementDate={options.showSettlementDate} onEdit={() => setEditingAdvance(a)} onToggle={() => toggleReimbursed(a)} />} />
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
            render={(entry, options) => entry.kind === "client"
            ? <FinanceOrderRow key={`client-${entry.item.id}`} order={entry.item} kind="client" amount={orderChargeTotal(entry.item)} settled={entry.item.clientSettled} settledAt={entry.item.clientSettledAt} showTypeTag showSettlementDate={options.showSettlementDate} onSettle={() => toggleClientSettled(entry.item)} />
            : entry.kind === "technician"
              ? <FinanceOrderRow key={`technician-${entry.item.record.id}`} order={entry.item.order} kind="technician" amount={entry.item.amount} settled={entry.item.record.isSettled === true} settledAt={entry.item.record.settledAt} statusFee={{ ...entry.item.record, settled: entry.item.record.isSettled === true }} suffix={`${entry.item.techName}${entry.item.record.visitNumber ? ` · 第${entry.item.record.visitNumber}次上门` : ""}`} showTypeTag showSettlementDate={options.showSettlementDate} onSettle={() => toggleTechnicianSettled(entry.item)} />
              : <FinanceAdvanceRow key={`advance-${entry.item.id}`} advance={entry.item} orders={orders} showTypeTag showSettlementDate={options.showSettlementDate} onEdit={() => setEditingAdvance(entry.item)} onToggle={() => toggleReimbursed(entry.item)} />}
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

function FinanceFilteredGroups({ kind, pending, completed, orders, stores, technicians, employees, filters, setFilters, onBatchSettle, render }) {
  const [completedOpen, setCompletedOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const orderForItem = (item) => kind === "advance" ? orders.find((order) => order.id === item.order_id) : kind === "technician" ? item.order : item;
  const amountForItem = (item) => kind === "advance"
    ? Number(item.amount) || 0
    : kind === "technician"
      ? Number(item.amount) || 0
      : orderChargeTotal(item);
  const dateForItem = (item) => kind === "advance" ? item.created_at : kind === "technician" ? item.order.createdAt : item.createdAt;
  const matchesFilters = (item) => {
    const order = orderForItem(item);
    const date = new Date(dateForItem(item)).getTime();
    const start = filters.range === "month" ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
      : filters.range === "last_month" ? new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).getTime()
        : filters.start ? new Date(`${filters.start}T00:00:00`).getTime() : null;
    const end = filters.range === "month" ? Date.now()
      : filters.range === "last_month" ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
        : filters.end ? new Date(`${filters.end}T23:59:59`).getTime() : null;
    if (start && date < start) return false;
    if (end && date > end) return false;
    if (filters.storeId && order?.storeId !== filters.storeId) return false;
    if (filters.followerId && order?.followerId !== filters.followerId) return false;
    if (kind === "technician" && filters.technicianId && item.technicianId !== filters.technicianId) return false;
    if (kind === "advance" && filters.employeeName && item.employee_name !== filters.employeeName) return false;
    return true;
  };
  const filteredPending = pending.filter(matchesFilters);
  const selected = filteredPending.filter((item) => selectedIds.includes(item.id));
  const selectedTotal = selected.reduce((sum, item) => sum + amountForItem(item), 0);
  const allSelected = filteredPending.length > 0 && filteredPending.every((item) => selectedIds.includes(item.id));
  const resetSelection = () => setSelectedIds([]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
    resetSelection();
  }

  async function handleBatch() {
    const action = kind === "client" ? "标记已结算" : kind === "technician" ? "标记已结算" : "标记已报销";
    const names = kind === "advance"
      ? [...new Set(selected.map((item) => item.employee_name).filter(Boolean))].join("、")
      : "";
    const summary = `即将${action} ${selected.length} 条记录，合计 ¥${selectedTotal.toLocaleString()}${names ? `，垫付人：${names}` : ""}`;
    if (!window.confirm(summary)) return;
    const result = await onBatchSettle(selected, kind);
    if (!result.failed) resetSelection();
  }

  function exportCompleted() {
    const rows = completed.filter(matchesFilters).map((item) => {
      const order = orderForItem(item);
      const display = order ? orderStoreDisplay(order) : {};
      const row = {
        工单号: order?.ticketNo || "",
        门店: display.storeName || `${display.city || ""}${display.mall || ""}`,
        跟单人: employees.find((employee) => employee.id === order?.followerId)?.name || "",
        金额: amountForItem(item),
        登记时间: dateForItem(item),
        [kind === "advance" ? "报销时间" : "结算时间"]: kind === "advance" ? item.reimbursed_at || "" : (kind === "client" ? order?.clientSettledAt : item.record?.settledAt) || "",
      };
      if (kind === "advance") row.垫付人 = item.employee_name || "";
      if (kind === "technician") {
        row.师傅 = item.technicianName || "";
        row.上门次数 = item.visitNumber ? `第${item.visitNumber}次` : "订单级";
      }
      return row;
    });
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "已完成记录");
    XLSX.writeFile(workbook, `财务已完成-${kind}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function previewText(item) {
    const order = orderForItem(item);
    const settledAt = kind === "advance"
      ? item.reimbursed_at
      : kind === "client"
        ? order?.clientSettledAt
        : item.record?.settledAt;
    const settledLabel = kind === "advance" ? "已报销" : "已结算";
    return `${order?.ticketNo || "垫付"} · ¥${amountForItem(item).toLocaleString()} · ${settledLabel}${settledAt ? ` ${fmtDateShort(settledAt)}` : ""}`;
  }

  return (
    <div>
      <div style={styles.filterBar}>
        <select style={styles.filterInput} value={filters.range} onChange={(e) => updateFilter("range", e.target.value)}><option value="all">全部时间</option><option value="month">本月</option><option value="last_month">上月</option><option value="custom">自定义</option></select>
        {filters.range === "custom" && <><input style={styles.filterInput} type="date" value={filters.start} onChange={(e) => updateFilter("start", e.target.value)} /><input style={styles.filterInput} type="date" value={filters.end} onChange={(e) => updateFilter("end", e.target.value)} /></>}
        <select style={styles.filterInput} value={filters.storeId} onChange={(e) => updateFilter("storeId", e.target.value)}><option value="">全部门店</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}</select>
        <select style={styles.filterInput} value={filters.followerId} onChange={(e) => updateFilter("followerId", e.target.value)}><option value="">全部跟单人</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select>
        {kind === "technician" && <select style={styles.filterInput} value={filters.technicianId} onChange={(e) => updateFilter("technicianId", e.target.value)}><option value="">全部师傅</option>{technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}</select>}
        {kind === "advance" && <select style={styles.filterInput} value={filters.employeeName} onChange={(e) => updateFilter("employeeName", e.target.value)}><option value="">全部垫付人</option>{employees.map((employee) => <option key={employee.id} value={employee.name}>{employee.name}</option>)}</select>}
      </div>
      <div style={styles.groupTitle}>待处理（{filteredPending.length}）</div>
      <label style={styles.selectAllRow}><input type="checkbox" checked={allSelected} onChange={(e) => setSelectedIds(e.target.checked ? filteredPending.map((item) => item.id) : [])} /> 全选当前筛选结果</label>
      {filteredPending.length > 0 ? <div style={styles.list}>{filteredPending.map((item) => <div key={item.id} style={styles.batchRow}><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={(e) => setSelectedIds((current) => e.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />{render(item, { showSettlementDate: false })}</div>)}</div> : <EmptyState text="没有符合筛选条件的待处理记录" />}
       {selected.length > 0 && <div style={styles.batchBar}>已选 {selected.length} 条，合计 ¥{selectedTotal.toLocaleString()} <button style={styles.primaryBtn} onClick={handleBatch}>{kind === "client" ? "批量标记已结算" : kind === "technician" ? "批量标记已结算" : "批量标记已报销"}</button></div>}
      <div style={styles.completedHeader}><div><div style={styles.groupTitle}>已完成（{completed.length}） · 合计 ¥{completed.reduce((sum, item) => sum + amountForItem(item), 0).toLocaleString()}</div><div style={styles.completedPreview}>最近3条预览：{completed.slice(0, 3).map((item) => <div key={item.id}>{previewText(item)}</div>)}</div></div><div style={styles.completedActions}><button style={styles.ghostBtn} onClick={() => setCompletedOpen((open) => !open)}>{completedOpen ? "收起" : "展开查看全部"}</button><button style={styles.ghostBtn} onClick={exportCompleted}>导出已完成记录</button></div></div>
      {completedOpen && <div style={styles.list}>{completed.map((item) => render(item, { showSettlementDate: true }))}</div>}
    </div>
  );
}

function FinanceSectionGroup({ pending, completed, emptyText, render }) {
  return (
    <div>
      <div style={styles.groupTitle}>待处理（{pending.length}）</div>
      {pending.length > 0 ? <div style={styles.list}>{pending.map((item) => render(item, { showSettlementDate: false }))}</div> : <EmptyState text={`没有${emptyText.replace("记录", "待处理记录")}`} />}
      <div style={styles.groupTitle}>已完成（{completed.length}）</div>
      {completed.length > 0 ? <div style={styles.list}>{completed.map((item) => render(item, { showSettlementDate: true }))}</div> : <div style={styles.completedEmpty}>暂无已完成记录</div>}
    </div>
  );
}

function FinanceOrderRow({ order, kind, amount, settled, settledAt, createdAt, suffix, statusFee, showTypeTag = false, showSettlementDate = false, onSettle }) {
  const color = kind === "client" ? "#1F7A8C" : "#3E8F63";
  const feeStatusColor = kind === "technician" ? technicianFeeStatusColor(statusFee) : color;
  const label = kind === "client" ? "客户" : "师傅";
  const storeDisplay = orderStoreDisplay(order);
  const location = storeDisplay.storeName || `${storeDisplay.city}${storeDisplay.mall}` || order.mall || "未关联门店";
  return (
    <div style={styles.row}>
      <Link href={`/orders?open=${order.id}`} style={styles.rowMain}>
        {showTypeTag && <span style={{ ...styles.typeTag, background: `${color}18`, color }}>{label}</span>}
        <span style={styles.ticketNo}>{order.ticketNo}</span>
        <span style={styles.rowMall}>{location}{suffix ? ` · ${suffix}` : ""}</span>
        <span style={styles.rowDate}>登记：{fmtDateShort(createdAt || order.createdAt)}</span>
        {showSettlementDate && <span style={styles.rowDate}>结算：{settledAt ? fmtDateShort(settledAt) : "—"}</span>}
      </Link>
      <div style={styles.rowRight}>
        <span style={{ ...styles.amount, color: feeStatusColor }}>¥{amount}</span>
        <button style={{ ...styles.settleBtn, ...(settled ? styles.settleBtnDone : {}) }} onClick={onSettle}>
          <CheckCircle2 size={13} /> {settled ? "撤销结算" : kind === "client" ? "标记已结算" : "标记已结算"}
        </button>
      </div>
    </div>
  );
}

function FinanceAdvanceRow({ advance, orders, showTypeTag = false, showSettlementDate = false, onEdit, onToggle }) {
  const relatedOrder = advance.order_id ? orders.find((o) => o.id === advance.order_id) : null;
  const relatedStore = relatedOrder ? orderStoreDisplay(relatedOrder) : null;
  const location = relatedStore?.storeName || (relatedStore ? `${relatedStore.city}${relatedStore.mall}` : "");
  return (
    <div style={styles.row}>
      <div style={styles.rowMain}>
        {showTypeTag && <span style={{ ...styles.typeTag, background: "#FBEEDD", color: "#A5661A" }}>垫付</span>}
        <span style={{ fontWeight: 700 }}>{advance.employee_name}</span>
        <span style={styles.rowMall}>{location || advance.reason || "（无说明）"}{location && advance.reason ? ` · ${advance.reason}` : ""}</span>
        {relatedOrder && <Link href={`/orders?open=${relatedOrder.id}`} style={styles.relatedTag}>{relatedOrder.ticketNo}</Link>}
        <span style={styles.rowDate}>登记：{fmtDateShort(advance.created_at)}</span>
        {showSettlementDate && <span style={styles.rowDate}>报销：{advance.reimbursed_at ? fmtDateShort(advance.reimbursed_at) : "—"}</span>}
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
  filterBar: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 12px", background: "#F4F7F6", border: "1px solid #E2E9E8", borderRadius: 9 },
  filterInput: { border: "1px solid #E2E9E8", borderRadius: 7, background: "#fff", color: "#4C6169", padding: "6px 8px", fontSize: 12 },
  selectAllRow: { display: "flex", alignItems: "center", gap: 6, color: "#4C6169", fontSize: 12, margin: "8px 0" },
  batchRow: { display: "flex", alignItems: "flex-start", gap: 8 },
  batchBar: { position: "sticky", bottom: 12, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#145560", color: "#fff", borderRadius: 9, padding: "10px 12px", margin: "-4px 0 12px", fontSize: 12.5, fontWeight: 600 },
  completedHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, background: "#fff", border: "1px solid #E2E9E8", borderRadius: 9, padding: "4px 10px 10px", marginTop: 12 },
  completedPreview: { color: "#8FA1A8", fontSize: 11.5, lineHeight: 1.7 },
  completedActions: { display: "flex", gap: 6, alignItems: "center", marginTop: 10 },
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
