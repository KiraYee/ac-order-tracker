"use client";
import { useState, useEffect, useMemo } from "react";
import {
  Wrench, Phone, MapPin, Clock, User, Plus, X, Check,
  AlertTriangle, Search, Loader2, ClipboardList,
  Snowflake, PackageSearch, Users, PhoneCall, LogOut, FileText,
  Pencil, Link2, DollarSign, TrendingUp, CalendarCheck
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { costItemAmount, costItemQty, costItemUnitPrice, visitCostTotal, orderVisitCostTotal } from "../../lib/dataHelpers";
import { ticketNoFromReportTime } from "../../lib/dataHelpers";

const STATUSES = ["待核实", "待派工", "待上门", "维修中", "已完成", "已取消"];

const STATUS_STYLE = {
  "待核实": { bg: "#EDEFEE", fg: "#4C6169", dot: "#8FA1A8" },
  "待派工": { bg: "#FBEEDD", fg: "#A5661A", dot: "#E08E33" },
  "待上门": { bg: "#E3F0F1", fg: "#145560", dot: "#1F7A8C" },
  "维修中": { bg: "#DCEEF0", fg: "#0F4650", dot: "#1F7A8C" },
  "已完成": { bg: "#E4F3E9", fg: "#2C6B45", dot: "#3E8F63" },
  "已取消": { bg: "#F6E7E6", fg: "#A23931", dot: "#C1443D" },
};

const RESULT_TYPES = [
  { key: "resolved", label: "已修复", icon: Check, color: "#3E8F63" },
  { key: "need_part", label: "需配件/等货", icon: PackageSearch, color: "#E08E33" },
  { key: "need_official", label: "需联系官方售后", icon: PhoneCall, color: "#1F7A8C" },
  { key: "need_switch_master", label: "需更换师傅", icon: Users, color: "#C1443D" },
  { key: "other", label: "其他", icon: AlertTriangle, color: "#4C6169" },
];

function resultMeta(key) {
  return RESULT_TYPES.find((r) => r.key === key) || RESULT_TYPES[4];
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

function daysSince(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function orderCostTotal(o) {
  return orderVisitCostTotal(o);
}

// ---- Supabase <-> 前端字段映射 ----
function orderFromDb(row) {
  return {
    id: row.id,
    ticketNo: row.ticket_no,
    mall: row.mall,
    brand: row.brand,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    issueDesc: row.issue_desc,
    address: row.address,
    notes: row.notes,
    reportTime: row.report_time,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    relatedOrderId: row.related_order_id,
    assignedTechnicianId: row.assigned_technician_id,
    clientSettled: row.client_settled,
    technicianSettled: row.technician_settled,
    expenseRecords: row.expense_records || [],
    visits: (row.visits || [])
      .map(visitFromDb)
      .sort((a, b) => new Date(a.visitTime) - new Date(b.visitTime)),
  };
}
function visitFromDb(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    visitTime: row.visit_time,
    master: row.master,
    masterPhone: row.master_phone,
    resultType: row.result_type,
    note: row.note,
    costItems: row.cost_items || [],
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export default function OrderTracker({ userEmail, onSignOut }) {
  const [orders, setOrders] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [feePresets, setFeePresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showVisitForm, setShowVisitForm] = useState(false);

  useEffect(() => {
    fetchOrders();
    fetchTechnicians();
    fetchFeePresets();
  }, []);

  async function fetchOrders() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*, expense_records(*), visits(*, expense_records(*))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setOrders((data || []).map(orderFromDb));
      setErrorMsg("");
    } catch (e) {
      setErrorMsg("加载工单失败：" + (e.message || "未知错误"));
    } finally {
      setLoading(false);
    }
  }

  async function fetchTechnicians() {
    try {
      const { data, error } = await supabase.from("technicians").select("*").order("name");
      if (error) throw error;
      setTechnicians(data || []);
    } catch (e) {
      // 静默失败即可，不影响主流程；用户可以在 UI 里重试添加
    }
  }

  async function fetchFeePresets() {
    try {
      const { data, error } = await supabase.from("fee_presets").select("*").order("created_at");
      if (error) throw error;
      setFeePresets(data || []);
    } catch (e) {
      // 同上
    }
  }

  async function addTechnician(name, phone) {
    try {
      const { data, error } = await supabase
        .from("technicians")
        .insert({ name, phone: phone || null })
        .select()
        .single();
      if (error) throw error;
      setTechnicians((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      return data;
    } catch (e) {
      setErrorMsg("添加师傅失败：" + (e.message || "未知错误"));
      return null;
    }
  }

  async function addFeePreset(label, amount) {
    try {
      const { data, error } = await supabase
        .from("fee_presets")
        .insert({ label, amount })
        .select()
        .single();
      if (error) throw error;
      setFeePresets((prev) => [...prev, data]);
      return data;
    } catch (e) {
      setErrorMsg("添加费用项目失败：" + (e.message || "未知错误"));
      return null;
    }
  }

  async function updateFeePreset(id, patch) {
    try {
      const { error } = await supabase.from("fee_presets").update(patch).eq("id", id);
      if (error) throw error;
      setFeePresets((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    } catch (e) {
      setErrorMsg("修改费用项目失败：" + (e.message || "未知错误"));
    }
  }

  async function deleteFeePreset(id) {
    try {
      const { error } = await supabase.from("fee_presets").delete().eq("id", id);
      if (error) throw error;
      setFeePresets((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setErrorMsg("删除费用项目失败：" + (e.message || "未知错误"));
    }
  }

  async function addOrder(data) {
    try {
      const reportTime = data.reportTime || new Date().toISOString();
      const reportDate = new Date(reportTime);
      const reportPrefix = `KT${reportDate.getFullYear()}${String(reportDate.getMonth() + 1).padStart(2, "0")}${String(
        reportDate.getDate()
      ).padStart(2, "0")}${String(reportDate.getHours()).padStart(2, "0")}${String(reportDate.getMinutes()).padStart(2, "0")}`;
      const { data: matchingTickets, error: ticketError } = await supabase
        .from("orders")
        .select("ticket_no")
        .like("ticket_no", `${reportPrefix}%`);
      if (ticketError) throw ticketError;
      const ticketNo = ticketNoFromReportTime(reportTime, (matchingTickets || []).map((row) => row.ticket_no));
      const { data: row, error } = await supabase
        .from("orders")
        .insert({
          ticket_no: ticketNo,
          mall: data.mall,
          brand: data.brand || null,
          contact_name: data.contactName || null,
          contact_phone: data.contactPhone || null,
          issue_desc: data.issueDesc,
          address: data.address || null,
          notes: data.notes || null,
          report_time: reportTime,
          status: "待核实",
          created_by: userEmail,
          related_order_id: data.relatedOrderId || null,
        })
        .select()
        .single();
      if (error) throw error;
      const newOrder = orderFromDb({ ...row, visits: [] });
      setOrders((prev) => [newOrder, ...prev]);
      setShowNewOrder(false);
      setSelectedId(newOrder.id);
      setErrorMsg("");
    } catch (e) {
      setErrorMsg("创建工单失败：" + (e.message || "未知错误"));
    }
  }

  async function updateStatus(orderId, status) {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", orderId);
      if (error) throw error;
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status, updatedAt: new Date().toISOString() } : o))
      );
      setErrorMsg("");
    } catch (e) {
      setErrorMsg("更新状态失败：" + (e.message || "未知错误"));
    }
  }

  async function assignTechnician(orderId, technicianId) {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ assigned_technician_id: technicianId, updated_at: new Date().toISOString() })
        .eq("id", orderId);
      if (error) throw error;
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, assignedTechnicianId: technicianId } : o))
      );
      setErrorMsg("");
    } catch (e) {
      setErrorMsg("指派师傅失败：" + (e.message || "未知错误"));
    }
  }

  async function addVisit(orderId, visit) {
    try {
      const { data: row, error } = await supabase
        .from("visits")
        .insert({
          order_id: orderId,
          visit_time: visit.visitTime,
          master: visit.master,
          master_phone: visit.masterPhone || null,
          result_type: visit.resultType,
          note: visit.note || null,
          cost_items: visit.costItems || [],
          created_by: userEmail,
        })
        .select()
        .single();
      if (error) throw error;

      const order = orders.find((o) => o.id === orderId);
      let nextStatus = order ? order.status : "维修中";
      if (visit.resultType === "resolved") nextStatus = "已完成";
      else if (nextStatus !== "已取消") nextStatus = "维修中";

      const { error: updErr } = await supabase
        .from("orders")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", orderId);
      if (updErr) throw updErr;

      const newVisit = visitFromDb(row);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, status: nextStatus, updatedAt: new Date().toISOString(), visits: [...o.visits, newVisit] }
            : o
        )
      );
      setShowVisitForm(false);
      setErrorMsg("");
    } catch (e) {
      setErrorMsg("保存上门记录失败：" + (e.message || "未知错误"));
    }
  }

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const hay = `${o.mall} ${o.brand || ""} ${o.issueDesc} ${o.ticketNo}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [orders, statusFilter, search]);

  const counts = useMemo(() => {
    const c = { all: orders.length };
    STATUSES.forEach((s) => (c[s] = orders.filter((o) => o.status === s).length));
    return c;
  }, [orders]);

  const stats = useMemo(() => {
    const now = new Date();
    const inProgress = orders.filter((o) => o.status === "维修中").length;
    const completedThisMonth = orders.filter((o) => {
      if (o.status !== "已完成") return false;
      const d = new Date(o.updatedAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const costThisMonth = orders.reduce((sum, o) => {
      const visitSum = o.visits.reduce((s, v) => {
        const d = new Date(v.visitTime);
        if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
          return s + visitCostTotal(v);
        }
        return s;
      }, 0);
      return sum + visitSum;
    }, 0);
    return { inProgress, completedThisMonth, costThisMonth };
  }, [orders]);

  const selected = orders.find((o) => o.id === selectedId) || null;

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoMark}>
            <Snowflake size={18} color="#F5F9F8" strokeWidth={2.2} />
          </div>
          <div>
            <div style={styles.title}>空调维保工单台账</div>
            <div style={styles.subtitle}>报修 → 核实 → 派工 → 上门 → 结案</div>
          </div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.userChip}>
            <User size={13} color="#4C6169" />
            <span>{userEmail}</span>
          </div>
          <button style={styles.ghostIconBtn} onClick={onSignOut} title="退出登录">
            <LogOut size={15} />
          </button>
          <button style={styles.primaryBtn} onClick={() => setShowNewOrder(true)}>
            <Plus size={16} /> 新建工单
          </button>
        </div>
      </header>

      {errorMsg && (
        <div style={styles.errorBar}>
          <AlertTriangle size={14} /> {errorMsg}
        </div>
      )}

      <div style={styles.statsBar}>
        <div style={{ ...styles.statCard, borderColor: "#1F7A8C40" }}>
          <div style={{ ...styles.statIconWrap, background: "#E3F0F1" }}>
            <TrendingUp size={15} color="#1F7A8C" />
          </div>
          <div>
            <div style={styles.statNum}>{stats.inProgress}</div>
            <div style={styles.statLabel}>进行中</div>
          </div>
        </div>
        <div style={{ ...styles.statCard, borderColor: "#3E8F6340" }}>
          <div style={{ ...styles.statIconWrap, background: "#E4F3E9" }}>
            <CalendarCheck size={15} color="#3E8F63" />
          </div>
          <div>
            <div style={styles.statNum}>{stats.completedThisMonth}</div>
            <div style={styles.statLabel}>本月已完成</div>
          </div>
        </div>
        <div style={{ ...styles.statCard, borderColor: "#E08E3340" }}>
          <div style={{ ...styles.statIconWrap, background: "#FBEEDD" }}>
            <DollarSign size={15} color="#E08E33" />
          </div>
          <div>
            <div style={styles.statNum}>¥{stats.costThisMonth.toLocaleString()}</div>
            <div style={styles.statLabel}>本月费用</div>
          </div>
        </div>
      </div>

      <div style={styles.filterBar}>
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(statusFilter === "all" ? styles.tabActive : {}) }}
            onClick={() => setStatusFilter("all")}
          >
            全部 <span style={styles.tabCount}>{counts.all}</span>
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              style={{ ...styles.tab, ...(statusFilter === s ? styles.tabActive : {}) }}
              onClick={() => setStatusFilter(s)}
            >
              <span style={{ ...styles.dot, background: STATUS_STYLE[s].dot }} />
              {s} <span style={styles.tabCount}>{counts[s]}</span>
            </button>
          ))}
        </div>
        <div style={styles.searchBox}>
          <Search size={14} color="#8FA1A8" />
          <input
            style={styles.searchInput}
            placeholder="搜索商场 / 品牌 / 故障描述 / 工单号"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <main style={styles.main} className="scrollbar">
        {loading ? (
          <div style={styles.centerState}>
            <Loader2 size={22} color="#1F7A8C" style={{ animation: "spin 1s linear infinite" }} />
            <div style={{ marginTop: 10, color: "#4C6169", fontSize: 13 }}>加载工单数据中…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={styles.centerState}>
            <ClipboardList size={32} color="#C7D5D3" />
            <div style={{ marginTop: 10, color: "#4C6169", fontSize: 14 }}>
              {orders.length === 0 ? "还没有工单，点击右上角新建一个" : "没有符合条件的工单"}
            </div>
          </div>
        ) : (
          <div style={styles.grid}>
            {filtered.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                technicians={technicians}
                onClick={() => setSelectedId(o.id)}
              />
            ))}
          </div>
        )}
      </main>

      {selected && (
        <DetailPanel
          order={selected}
          orders={orders}
          technicians={technicians}
          feePresets={feePresets}
          onClose={() => {
            setSelectedId(null);
            setShowVisitForm(false);
          }}
          onNavigateToOrder={(id) => {
            setSelectedId(id);
            setShowVisitForm(false);
          }}
          onUpdateStatus={(status) => updateStatus(selected.id, status)}
          onAssignTechnician={(techId) => assignTechnician(selected.id, techId)}
          onAddTechnician={addTechnician}
          onAddFeePreset={addFeePreset}
          onUpdateFeePreset={updateFeePreset}
          onDeleteFeePreset={deleteFeePreset}
          showVisitForm={showVisitForm}
          onOpenVisitForm={() => setShowVisitForm(true)}
          onCancelVisitForm={() => setShowVisitForm(false)}
          onAddVisit={(v) => addVisit(selected.id, v)}
        />
      )}

      {showNewOrder && (
        <NewOrderModal onClose={() => setShowNewOrder(false)} onSubmit={addOrder} orders={orders} />
      )}

      <div style={styles.footer}>
        <span style={{ color: "#8FA1A8" }}>数据保存在团队 Supabase 数据库中，仅登录账号可见</span>
      </div>
    </div>
  );
}

function OrderCard({ order, technicians, onClick }) {
  const st = STATUS_STYLE[order.status];
  const lastVisit = order.visits[order.visits.length - 1];
  const d = daysSince(order.reportTime);
  const tech = technicians.find((t) => t.id === order.assignedTechnicianId);
  const cost = orderCostTotal(order);
  const technicianRecords = [
    ...(order.expenseRecords || []),
    ...(order.visits || []).flatMap((visit) => visit.expenseRecords || []),
  ].filter((record, index, records) => record.type === "technician_fee" && records.findIndex((item) => item.id === record.id) === index);
  const technicianSettled = technicianRecords.length > 0 && technicianRecords.every((record) => record.is_settled);
  return (
    <button style={styles.card} className="card-hover" onClick={onClick}>
      <div style={styles.cardTop}>
        <span style={styles.ticketNo}>{order.ticketNo}</span>
        <span style={{ ...styles.statusBadge, background: st.bg, color: st.fg }}>
          <span style={{ ...styles.dot, background: st.dot }} />
          {order.status}
        </span>
      </div>
      <div style={styles.cardMall}>
        {order.mall}
        {order.brand ? <span style={styles.cardBrand}> · {order.brand}</span> : null}
      </div>
      <div style={styles.cardIssue}>{order.issueDesc}</div>
      <div style={styles.cardMetaRow}>
        <span style={styles.cardMeta}>
          <Clock size={12} /> 报修 {fmtDate(order.reportTime)}
          {d !== null && d > 0 ? ` · ${d}天前` : ""}
        </span>
      </div>
      {(tech || cost > 0 || order.clientSettled !== undefined) && (
        <div style={styles.cardMetaRow}>
          {tech && (
            <span style={styles.cardMeta}>
              <Users size={12} /> 指派：{tech.name}
            </span>
          )}
          {cost > 0 && (
            <span style={{ ...styles.cardMeta, color: "#A5661A" }}>
              <DollarSign size={12} /> ¥{cost}
            </span>
          )}
          <span style={{ ...styles.settlementBadge, ...(order.clientSettled ? styles.settlementBadgeDone : styles.settlementBadgePending) }}>
            甲方{order.clientSettled ? "已结算" : "未结算"}
          </span>
          <span style={{ ...styles.settlementBadge, ...(technicianSettled ? styles.settlementBadgeDone : styles.settlementBadgePending) }}>
            师傅费用{technicianSettled ? "已结清" : "未结清"}
          </span>
        </div>
      )}
      {lastVisit && (
        <div style={styles.lastVisitRow}>
          {(() => {
            const m = resultMeta(lastVisit.resultType);
            const Icon = m.icon;
            return (
              <>
                <Icon size={12} color={m.color} />
                <span style={{ color: m.color }}>{m.label}</span>
                <span style={{ color: "#8FA1A8" }}> · {lastVisit.master}</span>
              </>
            );
          })()}
        </div>
      )}
    </button>
  );
}

function TechnicianPicker({ technicians, valueId, onSelect, onAddTechnician, compact }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  if (adding) {
    return (
      <div style={styles.techAddRow}>
        <input
          style={styles.input}
          placeholder="师傅姓名"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          autoFocus
        />
        <input
          style={styles.input}
          placeholder="电话（选填）"
          value={newPhone}
          onChange={(e) => setNewPhone(e.target.value)}
        />
        <button
          style={styles.smallPrimaryBtn}
          onClick={async () => {
            if (!newName.trim()) return;
            const t = await onAddTechnician(newName.trim(), newPhone.trim());
            if (t) {
              onSelect(t);
              setAdding(false);
              setNewName("");
              setNewPhone("");
            }
          }}
        >
          保存
        </button>
        <button style={styles.ghostBtn} onClick={() => setAdding(false)}>
          取消
        </button>
      </div>
    );
  }

  return (
    <select
      style={styles.input}
      value={valueId || ""}
      onChange={(e) => {
        if (e.target.value === "__add__") {
          setAdding(true);
          return;
        }
        const t = technicians.find((t) => t.id === e.target.value);
        onSelect(t || null);
      }}
    >
      <option value="">{compact ? "未指定" : "选择师傅…"}</option>
      {technicians.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
      <option value="__add__">+ 添加新师傅</option>
    </select>
  );
}

function DetailPanel({
  order, orders, technicians, feePresets,
  onClose, onNavigateToOrder, onUpdateStatus, onAssignTechnician, onAddTechnician,
  onAddFeePreset, onUpdateFeePreset, onDeleteFeePreset,
  showVisitForm, onOpenVisitForm, onCancelVisitForm, onAddVisit,
}) {
  const relatedOrder = order.relatedOrderId ? orders.find((o) => o.id === order.relatedOrderId) : null;
  const assignedTech = technicians.find((t) => t.id === order.assignedTechnicianId);
  const totalCost = orderCostTotal(order);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.panelHeader}>
          <div>
            <div style={styles.ticketNoLg}>
              {order.ticketNo}
              {totalCost > 0 && <span style={styles.panelCostBadge}>累计费用 ¥{totalCost}</span>}
            </div>
            <div style={styles.panelMall}>{order.mall}</div>
          </div>
          <button style={styles.iconBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={styles.panelBody} className="scrollbar">
          {relatedOrder && (
            <button style={styles.relatedLinkChip} onClick={() => onNavigateToOrder(relatedOrder.id)}>
              <Link2 size={12} /> 关联工单：{relatedOrder.ticketNo} · {relatedOrder.mall}
            </button>
          )}

          <div style={styles.infoGrid}>
            <InfoItem icon={MapPin} label="门店/商场" value={order.mall} />
            {order.brand && <InfoItem icon={Wrench} label="品牌方" value={order.brand} />}
            <InfoItem icon={User} label="现场联系人" value={order.contactName || "—"} />
            <InfoItem icon={Phone} label="联系电话" value={order.contactPhone || "—"} />
            <InfoItem icon={Clock} label="报修时间" value={fmtDate(order.reportTime)} />
            <InfoItem icon={User} label="登记人" value={order.createdBy || "—"} />
            {order.address && (
              <div style={{ ...styles.infoItem, gridColumn: "1 / -1" }}>
                <div style={styles.infoLabel}>
                  <MapPin size={12} /> 详细地址
                </div>
                <div style={styles.infoValue}>{order.address}</div>
              </div>
            )}
          </div>

          <div style={styles.issueBox}>
            <div style={styles.sectionLabel}>故障描述</div>
            <div style={styles.issueText}>{order.issueDesc}</div>
          </div>

          {order.notes && (
            <div style={{ ...styles.issueBox, background: "#FBF8EE", borderColor: "#EBDFB0" }}>
              <div style={styles.sectionLabel}>
                <FileText size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
                历史备注
              </div>
              <div style={styles.issueText}>{order.notes}</div>
            </div>
          )}

          <div style={styles.statusRow}>
            <div style={styles.sectionLabel}>指派师傅</div>
            <TechnicianPicker
              technicians={technicians}
              valueId={order.assignedTechnicianId}
              onSelect={(t) => onAssignTechnician(t ? t.id : null)}
              onAddTechnician={onAddTechnician}
              compact
            />
            {assignedTech?.phone && (
              <div style={{ fontSize: 11.5, color: "#8FA1A8", marginTop: 5 }}>
                <Phone size={11} style={{ verticalAlign: -1, marginRight: 3 }} />
                {assignedTech.phone}
              </div>
            )}
          </div>

          <div style={styles.statusRow}>
            <div style={styles.sectionLabel}>当前状态</div>
            <div style={styles.statusPills}>
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => onUpdateStatus(s)}
                  style={{
                    ...styles.statusPill,
                    background: s === order.status ? STATUS_STYLE[s].bg : "#fff",
                    color: s === order.status ? STATUS_STYLE[s].fg : "#8FA1A8",
                    borderColor: s === order.status ? STATUS_STYLE[s].dot : "#E2E9E8",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.timelineSection}>
            <div style={styles.timelineHeader}>
              <div style={styles.sectionLabel}>上门记录（{order.visits.length}）</div>
              {!showVisitForm && (
                <button style={styles.smallPrimaryBtn} onClick={onOpenVisitForm}>
                  <Plus size={13} /> 登记本次上门
                </button>
              )}
            </div>

            {showVisitForm && (
              <VisitForm
                onCancel={onCancelVisitForm}
                onSubmit={onAddVisit}
                technicians={technicians}
                onAddTechnician={onAddTechnician}
                feePresets={feePresets}
                onAddFeePreset={onAddFeePreset}
                onUpdateFeePreset={onUpdateFeePreset}
                onDeleteFeePreset={onDeleteFeePreset}
              />
            )}

            {order.visits.length === 0 && !showVisitForm ? (
              <div style={styles.emptyVisits}>还没有上门记录</div>
            ) : (
              <div style={styles.timeline}>
                {order.visits.map((v, idx) => {
                  const m = resultMeta(v.resultType);
                  const Icon = m.icon;
                  const vCost = visitCostTotal(v);
                  return (
                    <div key={v.id} style={styles.timelineItem}>
                      <div style={styles.timelineRail}>
                        <div style={{ ...styles.timelineNode, borderColor: m.color }}>
                          <Icon size={12} color={m.color} />
                        </div>
                        {idx < order.visits.length - 1 && <div style={styles.timelineLine} />}
                      </div>
                      <div style={styles.timelineContent}>
                        <div style={styles.timelineTop}>
                          <span style={{ color: m.color, fontWeight: 600 }}>
                            第{idx + 1}次 · {m.label}
                          </span>
                          <span style={styles.timelineDate}>{fmtDate(v.visitTime)}</span>
                        </div>
                        <div style={styles.timelineMaster}>
                          <Wrench size={12} /> {v.master}
                          {v.masterPhone ? ` · ${v.masterPhone}` : ""}
                        </div>
                        {v.note && <div style={styles.timelineNote}>{v.note}</div>}
                        {v.costItems && v.costItems.length > 0 && (
                          <div style={styles.visitCostRow}>
                            {v.costItems.map((ci, i) => (
                              <span key={i} style={styles.visitCostChip}>
                                {ci.label} · {costItemQty(ci)}次 · ¥{costItemUnitPrice(ci)} · ¥{costItemAmount(ci)}
                              </span>
                            ))}
                            <span style={styles.visitCostTotalTag}>合计 ¥{vCost}</span>
                          </div>
                        )}
                        <div style={styles.timelineBy}>登记人：{v.createdBy || "—"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div style={styles.infoItem}>
      <div style={styles.infoLabel}>
        <Icon size={12} /> {label}
      </div>
      <div style={styles.infoValue}>{value}</div>
    </div>
  );
}

function FeeItemsEditor({ feePresets, items, onChange, onAddPreset, onUpdatePreset, onDeletePreset }) {
  const [customLabel, setCustomLabel] = useState("");
  const [customQty, setCustomQty] = useState("1");
  const [customUnitPrice, setCustomUnitPrice] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [editAmount, setEditAmount] = useState("");

  function addItem(label, qty, unitPrice) {
    const amount = costItemAmount({ qty, unitPrice });
    onChange([...items, { label, qty: Number(qty) || 1, unitPrice: Number(unitPrice) || 0, amount }]);
  }
  function removeItem(idx) {
    onChange(items.filter((_, i) => i !== idx));
  }
  function updateItem(idx, patch) {
    onChange(items.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, ...patch };
      return { ...next, amount: costItemAmount(next) };
    }));
  }

  const total = items.reduce((s, it) => s + costItemAmount(it), 0);

  return (
    <div>
      {feePresets.length > 0 && (
        <div style={styles.feePresetRow}>
          {feePresets.map((p) =>
            editingId === p.id ? (
              <span key={p.id} style={styles.feePresetEditChip}>
                <input
                  style={styles.feeEditInput}
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                />
                <input
                  style={{ ...styles.feeEditInput, width: 46 }}
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                />
                <button
                  style={styles.tinyIconBtn}
                  onClick={() => {
                    onUpdatePreset(p.id, { label: editLabel.trim() || p.label, amount: Number(editAmount) || 0 });
                    setEditingId(null);
                  }}
                >
                  <Check size={11} />
                </button>
                <button style={styles.tinyIconBtn} onClick={() => setEditingId(null)}>
                  <X size={11} />
                </button>
              </span>
            ) : (
              <span key={p.id} style={styles.feePresetChip}>
                <button style={styles.feePresetChipBtn} onClick={() => addItem(p.label, 1, p.amount)}>
                  {p.label} ¥{p.amount}
                </button>
                <button
                  style={styles.tinyIconBtn}
                  onClick={() => {
                    setEditingId(p.id);
                    setEditLabel(p.label);
                    setEditAmount(String(p.amount));
                  }}
                  title="编辑"
                >
                  <Pencil size={10} />
                </button>
                <button style={styles.tinyIconBtn} onClick={() => onDeletePreset(p.id)} title="删除">
                  <X size={10} />
                </button>
              </span>
            )
          )}
        </div>
      )}
      <div style={styles.feeCustomRow}>
        <input
          style={styles.input}
          placeholder="自定义项目，如：清洗"
          value={customLabel}
          onChange={(e) => setCustomLabel(e.target.value)}
        />
        <input
          style={{ ...styles.input, width: 64 }}
          type="number"
          min="1"
          placeholder="数量"
          value={customQty}
          onChange={(e) => setCustomQty(e.target.value)}
        />
        <input
          style={{ ...styles.input, width: 90 }}
          type="number"
          placeholder="单价"
          value={customUnitPrice}
          onChange={(e) => setCustomUnitPrice(e.target.value)}
        />
        <button
          style={styles.smallPrimaryBtn}
          onClick={async () => {
            if (!customLabel.trim()) return;
            addItem(customLabel.trim(), customQty, customUnitPrice);
            await onAddPreset(customLabel.trim(), Number(customUnitPrice) || 0);
            setCustomLabel("");
            setCustomQty("1");
            setCustomUnitPrice("");
          }}
        >
          <Plus size={12} /> 添加
        </button>
      </div>
      {items.length > 0 && (
        <div style={styles.feeItemsList}>
          {items.map((it, idx) => (
            <div key={idx} style={styles.feeItemRow}>
              <span style={{ flex: 1 }}>{it.label}</span>
              <input style={styles.feeAmountInput} type="number" value={costItemQty(it)} onChange={(e) => updateItem(idx, { qty: Number(e.target.value) || 0 })} />
              <span style={{ marginRight: 2 }}>次 ¥</span>
              <input
                style={styles.feeAmountInput}
                type="number"
                value={costItemUnitPrice(it)}
                onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) || 0 })}
              />
              <span>¥{costItemAmount(it)}</span>
              <button style={styles.tinyIconBtn} onClick={() => removeItem(idx)}>
                <X size={12} />
              </button>
            </div>
          ))}
          <div style={styles.feeTotalRow}>本次上门费用合计：¥{total}</div>
        </div>
      )}
    </div>
  );
}

function VisitForm({
  onCancel, onSubmit, technicians, onAddTechnician,
  feePresets, onAddFeePreset, onUpdateFeePreset, onDeleteFeePreset,
}) {
  const [technician, setTechnician] = useState(null);
  const [masterPhone, setMasterPhone] = useState("");
  const [visitTime, setVisitTime] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [resultType, setResultType] = useState("resolved");
  const [note, setNote] = useState("");
  const [costItems, setCostItems] = useState([]);
  const [err, setErr] = useState("");

  function submit() {
    if (!technician) {
      setErr("请选择或添加师傅");
      return;
    }
    onSubmit({
      master: technician.name,
      masterPhone: masterPhone.trim(),
      visitTime: new Date(visitTime).toISOString(),
      resultType,
      note: note.trim(),
      costItems,
    });
  }

  return (
    <div style={styles.visitForm}>
      <div style={styles.formRow2}>
        <Field label="师傅">
          <TechnicianPicker
            technicians={technicians}
            valueId={technician?.id}
            onSelect={(t) => {
              setTechnician(t);
              setMasterPhone(t?.phone || "");
            }}
            onAddTechnician={onAddTechnician}
          />
        </Field>
        <Field label="师傅电话">
          <input
            style={styles.input}
            value={masterPhone}
            onChange={(e) => setMasterPhone(e.target.value)}
            placeholder="选填"
          />
        </Field>
      </div>
      <Field label="上门时间">
        <input style={styles.input} type="datetime-local" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} />
      </Field>
      <Field label="处理结果">
        <div style={styles.resultChips}>
          {RESULT_TYPES.map((r) => {
            const Icon = r.icon;
            const active = resultType === r.key;
            return (
              <button
                key={r.key}
                onClick={() => setResultType(r.key)}
                style={{
                  ...styles.resultChip,
                  borderColor: active ? r.color : "#E2E9E8",
                  background: active ? `${r.color}14` : "#fff",
                  color: active ? r.color : "#4C6169",
                }}
              >
                <Icon size={13} /> {r.label}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="备注 / 处理详情">
        <textarea
          style={{ ...styles.input, minHeight: 60, resize: "vertical" }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="例如：现场检测缺氟，需联系品牌方售后补充配件"
        />
      </Field>
      <Field label="本次费用">
        <FeeItemsEditor
          feePresets={feePresets}
          items={costItems}
          onChange={setCostItems}
          onAddPreset={onAddFeePreset}
          onUpdatePreset={onUpdateFeePreset}
          onDeletePreset={onDeleteFeePreset}
        />
      </Field>
      {err && <div style={styles.formErr}>{err}</div>}
      <div style={styles.formActions}>
        <button style={styles.ghostBtn} onClick={onCancel}>取消</button>
        <button style={styles.primaryBtn} onClick={submit}>保存记录</button>
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

function NewOrderModal({ onClose, onSubmit, orders }) {
  const [mall, setMall] = useState("");
  const [brand, setBrand] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [issueDesc, setIssueDesc] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [relatedOrder, setRelatedOrder] = useState(null);
  const [relatedSearch, setRelatedSearch] = useState("");
  const [reportTime, setReportTime] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const relatedResults = useMemo(() => {
    if (!relatedSearch.trim()) return [];
    const s = relatedSearch.trim().toLowerCase();
    return orders
      .filter((o) => `${o.mall} ${o.ticketNo} ${o.issueDesc}`.toLowerCase().includes(s))
      .slice(0, 6);
  }, [relatedSearch, orders]);

  async function submit() {
    if (!mall.trim() || !issueDesc.trim()) {
      setErr("请至少填写商场名称和故障描述");
      return;
    }
    setSubmitting(true);
    await onSubmit({
      mall: mall.trim(),
      brand: brand.trim(),
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      issueDesc: issueDesc.trim(),
      address: address.trim(),
      notes: notes.trim(),
      reportTime: new Date(reportTime).toISOString(),
      relatedOrderId: relatedOrder?.id || null,
    });
    setSubmitting(false);
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>新建工单</span>
          <button style={styles.iconBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={styles.modalBody}>
          <div style={styles.formRow2}>
            <Field label="商场 / 门店名称 *">
              <input style={styles.input} value={mall} onChange={(e) => setMall(e.target.value)} placeholder="如：万象城 B1 层" />
            </Field>
            <Field label="品牌方（选填）">
              <input style={styles.input} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="如：某某餐饮品牌" />
            </Field>
          </div>
          <div style={styles.formRow2}>
            <Field label="现场联系人">
              <input style={styles.input} value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </Field>
            <Field label="联系电话">
              <input style={styles.input} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </Field>
          </div>
          <Field label="报修时间">
            <input style={styles.input} type="datetime-local" value={reportTime} onChange={(e) => setReportTime(e.target.value)} />
          </Field>
          <Field label="详细地址（选填）">
            <input style={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="门店完整地址，方便师傅导航" />
          </Field>
          <Field label="关联历史工单（选填）">
            {relatedOrder ? (
              <div style={styles.relatedChip}>
                <span>{relatedOrder.ticketNo} · {relatedOrder.mall}</span>
                <button style={styles.relatedChipRemove} onClick={() => setRelatedOrder(null)}>
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div>
                <input
                  style={styles.input}
                  placeholder="搜索商场名或工单号，比如一周前洗过的那单"
                  value={relatedSearch}
                  onChange={(e) => setRelatedSearch(e.target.value)}
                />
                {relatedResults.length > 0 && (
                  <div style={styles.relatedResultsBox}>
                    {relatedResults.map((o) => (
                      <button
                        key={o.id}
                        style={styles.relatedResultItem}
                        onClick={() => {
                          setRelatedOrder({ id: o.id, ticketNo: o.ticketNo, mall: o.mall });
                          setRelatedSearch("");
                        }}
                      >
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#8FA1A8" }}>
                          {o.ticketNo}
                        </span>{" "}
                        {o.mall} <span style={{ color: "#8FA1A8" }}>· {o.issueDesc.slice(0, 16)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Field>
          <Field label="故障描述 *">
            <textarea
              style={{ ...styles.input, minHeight: 70, resize: "vertical" }}
              value={issueDesc}
              onChange={(e) => setIssueDesc(e.target.value)}
              placeholder="如：3 楼中央空调不制冷，客人反馈室内温度偏高"
            />
          </Field>
          <Field label="备注（选填）">
            <textarea
              style={{ ...styles.input, minHeight: 50, resize: "vertical" }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="其他补充说明"
            />
          </Field>
          {err && <div style={styles.formErr}>{err}</div>}
          <div style={styles.formActions}>
            <button style={styles.ghostBtn} onClick={onClose}>取消</button>
            <button style={styles.primaryBtn} onClick={submit} disabled={submitting}>
              {submitting ? "创建中…" : "创建工单"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  app: { fontFamily: "'Inter', system-ui, sans-serif", background: "#EEF2F1", color: "#16262B", minHeight: "100vh", display: "flex", flexDirection: "column", fontSize: 14 },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px", background: "#FFFFFF", borderBottom: "1px solid #DDE6E4" },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  logoMark: { width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg, #1F7A8C, #145560)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em" },
  subtitle: { fontSize: 11.5, color: "#8FA1A8", marginTop: 1 },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  userChip: { display: "flex", alignItems: "center", gap: 6, background: "#F4F7F6", border: "1px solid #E2E9E8", borderRadius: 20, padding: "6px 10px", fontSize: 12.5, color: "#16262B" },
  ghostIconBtn: { background: "#F4F7F6", border: "1px solid #E2E9E8", borderRadius: 8, padding: 8, color: "#4C6169", display: "flex" },
  primaryBtn: { display: "flex", alignItems: "center", gap: 6, background: "#1F7A8C", color: "#fff", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 600 },
  smallPrimaryBtn: { display: "flex", alignItems: "center", gap: 5, background: "#1F7A8C", color: "#fff", border: "none", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 600 },
  ghostBtn: { background: "#fff", color: "#4C6169", border: "1px solid #E2E9E8", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600 },
  errorBar: { background: "#F6E7E6", color: "#A23931", fontSize: 12.5, padding: "6px 22px", display: "flex", alignItems: "center", gap: 6 },
  statsBar: { display: "flex", gap: 10, padding: "14px 22px 0", background: "#FFFFFF", flexWrap: "wrap" },
  statCard: { display: "flex", alignItems: "center", gap: 10, background: "#F9FAFA", border: "1px solid", borderRadius: 10, padding: "8px 14px", minWidth: 140 },
  statIconWrap: { width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  statNum: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 17, lineHeight: 1.1 },
  statLabel: { fontSize: 11, color: "#8FA1A8", marginTop: 1 },
  filterBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px 22px", background: "#FFFFFF", borderBottom: "1px solid #DDE6E4", flexWrap: "wrap" },
  tabs: { display: "flex", gap: 6, flexWrap: "wrap" },
  tab: { display: "flex", alignItems: "center", gap: 5, background: "#F4F7F6", border: "1px solid transparent", borderRadius: 7, padding: "6px 10px", fontSize: 12.5, color: "#4C6169", fontWeight: 500 },
  tabActive: { background: "#E3F0F1", borderColor: "#1F7A8C55", color: "#145560", fontWeight: 700 },
  tabCount: { color: "#8FA1A8", fontSize: 11 },
  dot: { width: 6, height: 6, borderRadius: "50%", display: "inline-block" },
  searchBox: { display: "flex", alignItems: "center", gap: 6, background: "#F4F7F6", border: "1px solid #E2E9E8", borderRadius: 8, padding: "7px 10px", minWidth: 260 },
  searchInput: { border: "none", background: "transparent", outline: "none", fontSize: 12.5, width: "100%", color: "#16262B" },
  main: { flex: 1, padding: "18px 22px", overflowY: "auto" },
  centerState: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 },
  card: { textAlign: "left", background: "#fff", border: "1px solid #E2E9E8", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 6, animation: "fadeIn .2s ease" },
  cardTop: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  ticketNo: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: "#8FA1A8", letterSpacing: "0.02em" },
  statusBadge: { display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20 },
  cardMall: { fontWeight: 700, fontSize: 14.5, color: "#16262B" },
  cardBrand: { fontWeight: 400, color: "#8FA1A8", fontSize: 12.5 },
  cardIssue: { fontSize: 12.5, color: "#4C6169", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
  cardMetaRow: { display: "flex", gap: 12, marginTop: 2 },
  cardMeta: { display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#8FA1A8" },
  settlementBadge: { display: "inline-flex", alignItems: "center", borderRadius: 12, padding: "3px 7px", fontSize: 10.5, fontWeight: 700 },
  settlementBadgePending: { background: "#FBEEDD", color: "#A5661A" },
  settlementBadgeDone: { background: "#E4F3E9", color: "#2C6B45" },
  lastVisitRow: { display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, borderTop: "1px dashed #E2E9E8", paddingTop: 7, marginTop: 2 },
  overlay: { position: "fixed", inset: 0, background: "rgba(18,32,36,0.35)", display: "flex", justifyContent: "flex-end", zIndex: 50, animation: "fadeIn .15s ease" },
  panel: { width: 440, maxWidth: "100%", background: "#F9FAFA", height: "100%", display: "flex", flexDirection: "column", animation: "slideIn .2s ease", boxShadow: "-8px 0 24px rgba(0,0,0,0.08)" },
  panelHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "18px 20px", background: "#fff", borderBottom: "1px solid #E2E9E8" },
  ticketNoLg: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#8FA1A8", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  panelCostBadge: { fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: "#A5661A", background: "#FBEEDD", padding: "2px 8px", borderRadius: 20 },
  panelMall: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18, marginTop: 2 },
  iconBtn: { background: "#F4F7F6", border: "none", borderRadius: 8, padding: 6, display: "flex", color: "#4C6169" },
  panelBody: { flex: 1, overflowY: "auto", padding: 20 },
  relatedLinkChip: { display: "inline-flex", alignItems: "center", gap: 5, background: "#E3F0F1", color: "#145560", border: "1px solid #1F7A8C40", borderRadius: 20, padding: "5px 11px", fontSize: 11.5, fontWeight: 600, marginBottom: 14 },
  infoGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 },
  infoItem: { background: "#fff", border: "1px solid #E2E9E8", borderRadius: 9, padding: "8px 10px" },
  infoLabel: { display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "#8FA1A8", marginBottom: 3 },
  infoValue: { fontSize: 12.5, fontWeight: 600, color: "#16262B" },
  issueBox: { background: "#fff", border: "1px solid #E2E9E8", borderRadius: 9, padding: 12, marginBottom: 16 },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: "#8FA1A8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 },
  issueText: { fontSize: 13, lineHeight: 1.5, color: "#16262B" },
  statusRow: { marginBottom: 18 },
  statusPills: { display: "flex", flexWrap: "wrap", gap: 6 },
  statusPill: { border: "1px solid", borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 600 },
  timelineSection: { marginTop: 4 },
  timelineHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  emptyVisits: { fontSize: 12.5, color: "#8FA1A8", background: "#fff", border: "1px dashed #E2E9E8", borderRadius: 9, padding: 16, textAlign: "center" },
  timeline: { display: "flex", flexDirection: "column" },
  timelineItem: { display: "flex", gap: 12 },
  timelineRail: { display: "flex", flexDirection: "column", alignItems: "center" },
  timelineNode: { width: 26, height: 26, borderRadius: "50%", background: "#fff", border: "2px solid", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  timelineLine: { width: 2, flex: 1, background: "#DCE4E3", minHeight: 24 },
  timelineContent: { flex: 1, paddingBottom: 18 },
  timelineTop: { display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12.5 },
  timelineDate: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#8FA1A8" },
  timelineMaster: { display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#4C6169", marginTop: 3 },
  timelineNote: { fontSize: 12.5, color: "#16262B", background: "#fff", border: "1px solid #E2E9E8", borderRadius: 8, padding: 8, marginTop: 6, lineHeight: 1.5 },
  timelineBy: { fontSize: 10.5, color: "#B7C4C2", marginTop: 5 },
  visitCostRow: { display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6, alignItems: "center" },
  visitCostChip: { fontSize: 11, background: "#FBEEDD", color: "#A5661A", borderRadius: 20, padding: "2px 8px", fontWeight: 600 },
  visitCostTotalTag: { fontSize: 11, color: "#A5661A", fontWeight: 700 },
  visitForm: { background: "#fff", border: "1px solid #E2E9E8", borderRadius: 10, padding: 14, marginBottom: 16 },
  formRow2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  fieldLabel: { fontSize: 11.5, fontWeight: 600, color: "#4C6169", marginBottom: 5 },
  input: { width: "100%", border: "1px solid #E2E9E8", borderRadius: 7, padding: "8px 10px", fontSize: 13, outline: "none", color: "#16262B", background: "#fff" },
  resultChips: { display: "flex", flexWrap: "wrap", gap: 6 },
  resultChip: { display: "flex", alignItems: "center", gap: 5, border: "1px solid", borderRadius: 20, padding: "6px 11px", fontSize: 12, fontWeight: 600 },
  formErr: { color: "#C1443D", fontSize: 12, marginBottom: 8 },
  formActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 },
  modal: { background: "#fff", borderRadius: 14, width: 480, maxWidth: "92vw", maxHeight: "88vh", display: "flex", flexDirection: "column", margin: "auto" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", borderBottom: "1px solid #E2E9E8" },
  modalTitle: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16 },
  modalBody: { padding: 18, overflowY: "auto" },
  footer: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 22px", fontSize: 11.5, borderTop: "1px solid #DDE6E4", background: "#F4F7F6" },
  techAddRow: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  relatedChip: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#E3F0F1", border: "1px solid #1F7A8C40", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, color: "#145560", fontWeight: 600 },
  relatedChipRemove: { background: "none", border: "none", color: "#145560", display: "flex" },
  relatedResultsBox: { marginTop: 6, border: "1px solid #E2E9E8", borderRadius: 8, background: "#fff", overflow: "hidden" },
  relatedResultItem: { display: "block", width: "100%", textAlign: "left", padding: "8px 10px", fontSize: 12, border: "none", borderBottom: "1px solid #F0F3F2", background: "#fff", color: "#16262B" },
  feePresetRow: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  feePresetChip: { display: "flex", alignItems: "center", gap: 2, background: "#F4F7F6", border: "1px solid #E2E9E8", borderRadius: 20, paddingLeft: 2 },
  feePresetChipBtn: { background: "none", border: "none", padding: "5px 8px", fontSize: 12, fontWeight: 600, color: "#16262B" },
  feePresetEditChip: { display: "flex", alignItems: "center", gap: 3, background: "#FBF8EE", border: "1px solid #EBDFB0", borderRadius: 20, padding: "3px 6px" },
  feeEditInput: { border: "1px solid #E2E9E8", borderRadius: 5, padding: "3px 5px", fontSize: 11, width: 64 },
  tinyIconBtn: { background: "none", border: "none", color: "#8FA1A8", display: "flex", padding: 3 },
  feeCustomRow: { display: "flex", gap: 6, marginBottom: 8 },
  feeItemsList: { background: "#F9FAFA", border: "1px solid #E2E9E8", borderRadius: 8, padding: 8 },
  feeItemRow: { display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, padding: "4px 2px" },
  feeAmountInput: { width: 56, border: "1px solid #E2E9E8", borderRadius: 5, padding: "3px 5px", fontSize: 12 },
  feeTotalRow: { fontSize: 12, fontWeight: 700, color: "#A5661A", textAlign: "right", marginTop: 4, paddingTop: 6, borderTop: "1px dashed #E2E9E8" },
};
