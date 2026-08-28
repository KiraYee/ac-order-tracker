"use client";
import { useState, useEffect, useMemo } from "react";
import {
  Wrench, Phone, MapPin, Clock, User, Plus, X, Check,
  AlertTriangle, Search, Loader2, ClipboardList,
  Snowflake, PackageSearch, Users, PhoneCall, LogOut
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

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
    reportTime: row.report_time,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export default function OrderTracker({ userEmail, onSignOut }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showVisitForm, setShowVisitForm] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  async function fetchOrders() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*, visits(*)")
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

  async function addOrder(data) {
    try {
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true });
      const ticketNo = `KT-${String((count || 0) + 1).padStart(4, "0")}`;
      const { data: row, error } = await supabase
        .from("orders")
        .insert({
          ticket_no: ticketNo,
          mall: data.mall,
          brand: data.brand || null,
          contact_name: data.contactName || null,
          contact_phone: data.contactPhone || null,
          issue_desc: data.issueDesc,
          report_time: data.reportTime,
          status: "待核实",
          created_by: userEmail,
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
        prev.map((o) => (o.id === orderId ? { ...o, status } : o))
      );
      setErrorMsg("");
    } catch (e) {
      setErrorMsg("更新状态失败：" + (e.message || "未知错误"));
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
            ? { ...o, status: nextStatus, visits: [...o.visits, newVisit] }
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
              <OrderCard key={o.id} order={o} onClick={() => setSelectedId(o.id)} />
            ))}
          </div>
        )}
      </main>

      {selected && (
        <DetailPanel
          order={selected}
          onClose={() => {
            setSelectedId(null);
            setShowVisitForm(false);
          }}
          onUpdateStatus={(status) => updateStatus(selected.id, status)}
          showVisitForm={showVisitForm}
          onOpenVisitForm={() => setShowVisitForm(true)}
          onCancelVisitForm={() => setShowVisitForm(false)}
          onAddVisit={(v) => addVisit(selected.id, v)}
        />
      )}

      {showNewOrder && (
        <NewOrderModal onClose={() => setShowNewOrder(false)} onSubmit={addOrder} />
      )}

      <div style={styles.footer}>
        <span style={{ color: "#8FA1A8" }}>数据保存在团队 Supabase 数据库中，仅登录账号可见</span>
      </div>
    </div>
  );
}

function OrderCard({ order, onClick }) {
  const st = STATUS_STYLE[order.status];
  const lastVisit = order.visits[order.visits.length - 1];
  const d = daysSince(order.reportTime);
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
        {order.visits.length > 0 && (
          <span style={styles.cardMeta}>
            <Wrench size={12} /> 已上门 {order.visits.length} 次
          </span>
        )}
      </div>
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

function DetailPanel({
  order, onClose, onUpdateStatus, showVisitForm, onOpenVisitForm, onCancelVisitForm, onAddVisit,
}) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.panelHeader}>
          <div>
            <div style={styles.ticketNoLg}>{order.ticketNo}</div>
            <div style={styles.panelMall}>{order.mall}</div>
          </div>
          <button style={styles.iconBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={styles.panelBody} className="scrollbar">
          <div style={styles.infoGrid}>
            <InfoItem icon={MapPin} label="门店/商场" value={order.mall} />
            {order.brand && <InfoItem icon={Wrench} label="品牌方" value={order.brand} />}
            <InfoItem icon={User} label="现场联系人" value={order.contactName || "—"} />
            <InfoItem icon={Phone} label="联系电话" value={order.contactPhone || "—"} />
            <InfoItem icon={Clock} label="报修时间" value={fmtDate(order.reportTime)} />
            <InfoItem icon={User} label="登记人" value={order.createdBy || "—"} />
          </div>

          <div style={styles.issueBox}>
            <div style={styles.sectionLabel}>故障描述</div>
            <div style={styles.issueText}>{order.issueDesc}</div>
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

            {showVisitForm && <VisitForm onCancel={onCancelVisitForm} onSubmit={onAddVisit} />}

            {order.visits.length === 0 && !showVisitForm ? (
              <div style={styles.emptyVisits}>还没有上门记录</div>
            ) : (
              <div style={styles.timeline}>
                {order.visits.map((v, idx) => {
                  const m = resultMeta(v.resultType);
                  const Icon = m.icon;
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

function VisitForm({ onCancel, onSubmit }) {
  const [master, setMaster] = useState("");
  const [masterPhone, setMasterPhone] = useState("");
  const [visitTime, setVisitTime] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [resultType, setResultType] = useState("resolved");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");

  function submit() {
    if (!master.trim()) {
      setErr("请填写师傅姓名");
      return;
    }
    onSubmit({
      master: master.trim(),
      masterPhone: masterPhone.trim(),
      visitTime: new Date(visitTime).toISOString(),
      resultType,
      note: note.trim(),
    });
  }

  return (
    <div style={styles.visitForm}>
      <div style={styles.formRow2}>
        <Field label="师傅姓名">
          <input style={styles.input} value={master} onChange={(e) => setMaster(e.target.value)} placeholder="如：王师傅" />
        </Field>
        <Field label="师傅电话">
          <input style={styles.input} value={masterPhone} onChange={(e) => setMasterPhone(e.target.value)} placeholder="选填" />
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

function NewOrderModal({ onClose, onSubmit }) {
  const [mall, setMall] = useState("");
  const [brand, setBrand] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [issueDesc, setIssueDesc] = useState("");
  const [reportTime, setReportTime] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      reportTime: new Date(reportTime).toISOString(),
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
          <Field label="故障描述 *">
            <textarea
              style={{ ...styles.input, minHeight: 70, resize: "vertical" }}
              value={issueDesc}
              onChange={(e) => setIssueDesc(e.target.value)}
              placeholder="如：3 楼中央空调不制冷，客人反馈室内温度偏高"
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
  lastVisitRow: { display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, borderTop: "1px dashed #E2E9E8", paddingTop: 7, marginTop: 2 },
  overlay: { position: "fixed", inset: 0, background: "rgba(18,32,36,0.35)", display: "flex", justifyContent: "flex-end", zIndex: 50, animation: "fadeIn .15s ease" },
  panel: { width: 440, maxWidth: "100%", background: "#F9FAFA", height: "100%", display: "flex", flexDirection: "column", animation: "slideIn .2s ease", boxShadow: "-8px 0 24px rgba(0,0,0,0.08)" },
  panelHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "18px 20px", background: "#fff", borderBottom: "1px solid #E2E9E8" },
  ticketNoLg: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#8FA1A8" },
  panelMall: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18, marginTop: 2 },
  iconBtn: { background: "#F4F7F6", border: "none", borderRadius: 8, padding: 6, display: "flex", color: "#4C6169" },
  panelBody: { flex: 1, overflowY: "auto", padding: 20 },
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
};
