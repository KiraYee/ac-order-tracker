"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Users, Plus, X, Phone, MapPin, Loader2, Wrench, CheckCircle2, DollarSign, Pencil,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import * as XLSX from "xlsx";
import AppShell from "../components/AppShell";
import { orderFromDb, orderStoreDisplay, computeTechnicianStats, groupByCity, fmtDate, visitTechnicianCostTotal, resultMeta, SKILL_PRESETS } from "../../lib/dataHelpers";

function exportTechniciansWorkbook(technicians) {
  const rows = technicians.map((technician) => ({
    "姓名": technician.name || "",
    "电话": technician.phone || "",
    "城市": technician.city || "",
    "工种": Array.isArray(technician.skills) ? technician.skills.join("、") : "",
    "备注": technician.notes || technician.remark || "",
    "创建时间": technician.created_at ? new Date(technician.created_at) : "",
  }));
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  if (sheet["!ref"]) {
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    for (let row = 1; row <= range.e.r; row += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: 5 })];
      if (cell?.v instanceof Date) {
        cell.t = "d";
        cell.z = "yyyy-mm-dd hh:mm";
      }
    }
  }
  XLSX.utils.book_append_sheet(workbook, sheet, "师傅列表");
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `师傅列表_${date}.xlsx`);
}

export default function TechniciansPage() {
  return (
    <AppShell active="technicians">
      <TechniciansView />
    </AppShell>
  );
}

function TechniciansView() {
  const [technicians, setTechnicians] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: techs }, { data: ords }, { data: storeRows }] = await Promise.all([
      supabase.from("technicians").select("*").order("name"),
      supabase.from("orders").select("*, expense_records(*), visits(*, expense_records(*))"),
      supabase.from("stores").select("*"),
    ]);
    setTechnicians(techs || []);
    const storeById = new Map((storeRows || []).map((store) => [store.id, store]));
    setOrders((ords || []).map(orderFromDb).map((order) => ({ ...order, store: storeById.get(order.storeId) || null })));
    setLoading(false);
  }

  async function addTechnician(data) {
    try {
      const { data: row, error } = await supabase.from("technicians").insert(data).select().single();
      if (error) throw error;
      setTechnicians((prev) => [...prev, row]);
      setShowNew(false);
    } catch (e) {
      setErrorMsg("添加师傅失败：" + (e.message || "未知错误"));
    }
  }

  async function updateTechnician(id, patch) {
    try {
      const { error } = await supabase.from("technicians").update(patch).eq("id", id);
      if (error) throw error;
      setTechnicians((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      setEditingId(null);
    } catch (e) {
      setErrorMsg("修改师傅信息失败：" + (e.message || "未知错误"));
    }
  }

  const stats = useMemo(() => computeTechnicianStats(technicians, orders), [technicians, orders]);
  const grouped = useMemo(() => groupByCity(stats), [stats]);
  const selected = stats.find((t) => t.id === selectedId) || null;
  const editingTech = stats.find((t) => t.id === editingId) || null;

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <div style={styles.title}>师傅</div>
          <div style={styles.subtitle}>按城市分组，点开查看合作数据</div>
        </div>
        <div style={styles.headerActions}>
          <button style={styles.exportBtn} onClick={() => exportTechniciansWorkbook(technicians)}>
            导出 Excel
          </button>
          <button style={styles.primaryBtn} onClick={() => setShowNew(true)}>
            <Plus size={16} /> 添加师傅
          </button>
        </div>
      </div>

      {errorMsg && <div style={styles.errorBar}>{errorMsg}</div>}

      {loading ? (
        <div style={styles.centerState}>
          <Loader2 size={22} color="#1F7A8C" style={{ animation: "spin 1s linear infinite" }} />
        </div>
      ) : technicians.length === 0 ? (
        <div style={styles.emptyState}>
          <Users size={28} color="#C7D5D3" />
          <div style={{ marginTop: 8, color: "#4C6169", fontSize: 13 }}>还没有师傅，点击右上角添加</div>
        </div>
      ) : (
        grouped.map((g) => (
          <div key={g.city} style={{ marginBottom: 26 }}>
            <div style={styles.cityHeader}>
              <MapPin size={13} color="#1F7A8C" /> {g.city}
              <span style={styles.cityCount}>{g.technicians.length} 位</span>
            </div>
            <div style={styles.grid}>
              {g.technicians.map((t) => (
                <button key={t.id} style={styles.card} className="card-hover" onClick={() => setSelectedId(t.id)}>
                  <div style={styles.cardTop}>
                    <span style={styles.techName}>{t.name}</span>
                    <button
                      style={styles.tinyIconBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(t.id);
                      }}
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                  {t.phone && (
                    <div style={styles.cardRow}>
                      <Phone size={11} /> {t.phone}
                    </div>
                  )}
                  {t.address && (
                    <div style={styles.cardRow}>
                      <MapPin size={11} /> {t.address}
                    </div>
                  )}
                  {(t.skills || []).length > 0 && (
                    <div style={styles.statsRow}>
                      {(t.skills || []).map((s) => (
                        <span key={s} style={styles.skillChip}>{s}</span>
                      ))}
                    </div>
                  )}
                  <div style={styles.statsRow}>
                    <span style={styles.statChip}>
                      <CheckCircle2 size={11} /> 完成 {t.completedCount} 单
                    </span>
                    <span style={styles.statChip}>
                      <DollarSign size={11} /> 已挣 ¥{t.totalEarned}
                    </span>
                    {t.totalUnpaid > 0 && (
                      <span style={{ ...styles.statChip, color: "#A5661A", background: "#FBEEDD" }}>
                        待付 ¥{t.totalUnpaid}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      {selected && <TechnicianDetail technician={selected} orders={orders} onClose={() => setSelectedId(null)} />}

      {showNew && <TechnicianFormModal onClose={() => setShowNew(false)} onSubmit={addTechnician} />}
      {editingTech && (
        <TechnicianFormModal
          initial={editingTech}
          onClose={() => setEditingId(null)}
          onSubmit={(data) => updateTechnician(editingTech.id, data)}
        />
      )}
    </div>
  );
}

function TechnicianDetail({ technician, orders, onClose }) {
  const relatedVisits = [];
  for (const o of orders) {
    for (const v of o.visits || []) {
      if (v.technicianId === technician.id) {
        relatedVisits.push({ ...v, order: o });
      }
    }
  }
  relatedVisits.sort((a, b) => new Date(b.visitTime) - new Date(a.visitTime));

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.panelHeader}>
          <div>
            <div style={styles.panelName}>{technician.name}</div>
            <div style={styles.panelSub}>
              {technician.city || "未分类"}
              {technician.phone ? ` · ${technician.phone}` : ""}
              {(technician.skills || []).length ? ` · ${(technician.skills || []).join(" / ")}` : ""}
            </div>
          </div>
          <button style={styles.iconBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={styles.panelBody} className="scrollbar">
          {technician.address && (
            <div style={styles.addrBox}>
              <MapPin size={12} /> {technician.address}
            </div>
          )}
          <div style={styles.summaryGrid}>
            <div style={styles.summaryCard}>
              <div style={styles.summaryNum}>{technician.completedCount}</div>
              <div style={styles.summaryLabel}>已完成工单</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryNum}>¥{technician.totalEarned}</div>
              <div style={styles.summaryLabel}>累计成本（我们付给他）</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={{ ...styles.summaryNum, color: technician.totalUnpaid > 0 ? "#A5661A" : "#2C6B45" }}>
                ¥{technician.totalUnpaid}
              </div>
              <div style={styles.summaryLabel}>尚未付款</div>
            </div>
          </div>

          <div style={styles.sectionLabel}>参与过的上门记录（{relatedVisits.length}）</div>
          {relatedVisits.length === 0 ? (
            <div style={styles.emptyVisits}>还没有记录</div>
          ) : (
            <div style={styles.visitList}>
              {relatedVisits.map((v) => {
                const m = resultMeta(v.resultType);
                const cost = visitTechnicianCostTotal(v);
                const storeDisplay = orderStoreDisplay(v.order);
                const location = storeDisplay.storeName || [storeDisplay.city, storeDisplay.mall].filter(Boolean).join(" · ") || "未关联门店";
                const expenseSummary = (v.expenseRecords || [])
                  .filter((record) => record.label)
                  .map((record) => `${record.label} ¥${record.amount ?? 0}`)
                  .join(" · ");
                return (
                  <Link key={v.id} href={`/orders?open=${v.order.id}`} style={styles.visitRow}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#8FA1A8" }}>
                        {v.order.ticketNo}
                      </span>
                      <span style={styles.visitDate}>{fmtDate(v.visitTime)}</span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 12.5, marginTop: 2 }}>{location}</div>
                    {expenseSummary && <div style={{ color: "#667980", fontSize: 11.5, marginTop: 3 }}>{expenseSummary}</div>}
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ color: m.color, fontSize: 11.5 }}>{m.label}</span>
                      {cost > 0 && (
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: v.technicianPaid ? "#2C6B45" : "#A5661A" }}>
                          ¥{cost} · {v.technicianPaid ? "已付" : "未付"}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TechnicianFormModal({ initial, onClose, onSubmit }) {
  const [name, setName] = useState(initial?.name || "");
  const [city, setCity] = useState(initial?.city || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [skills, setSkills] = useState(initial?.skills || []);
  const [customSkill, setCustomSkill] = useState("");
  const [err, setErr] = useState("");

  function toggleSkill(s) {
    setSkills((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function submit() {
    if (!name.trim()) {
      setErr("请填写师傅姓名");
      return;
    }
    onSubmit({
      name: name.trim(),
      city: city.trim() || null,
      address: address.trim() || null,
      phone: phone.trim() || null,
      skills,
    });
  }

  return (
    <div style={styles.overlay2} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>{initial ? "编辑师傅信息" : "添加师傅"}</span>
          <button style={styles.iconBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={styles.modalBody}>
          <Field label="姓名 *">
            <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="城市">
            <input style={styles.input} value={city} onChange={(e) => setCity(e.target.value)} placeholder="如：上海" />
          </Field>
          <Field label="详细地址">
            <input style={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="联系电话">
            <input style={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="资源能力（可多选）">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {[...new Set([...SKILL_PRESETS, ...skills])].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSkill(s)}
                  style={{
                    border: "1px solid",
                    borderColor: skills.includes(s) ? "#1F7A8C" : "#E2E9E8",
                    background: skills.includes(s) ? "#E3F0F1" : "#fff",
                    color: skills.includes(s) ? "#145560" : "#4C6169",
                    borderRadius: 16,
                    padding: "5px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                style={styles.input}
                value={customSkill}
                onChange={(e) => setCustomSkill(e.target.value)}
                placeholder="其他工种，如：制冷"
              />
              <button
                style={styles.primaryBtn}
                onClick={() => {
                  const s = customSkill.trim();
                  if (!s) return;
                  if (!skills.includes(s)) setSkills([...skills, s]);
                  setCustomSkill("");
                }}
              >
                添加
              </button>
            </div>
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
  headerActions: { display: "flex", alignItems: "center", gap: 8 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22 },
  subtitle: { fontSize: 12.5, color: "#8FA1A8", marginTop: 4 },
  primaryBtn: { display: "flex", alignItems: "center", gap: 6, background: "#1F7A8C", color: "#fff", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 600 },
  exportBtn: { background: "#F4F7F6", color: "#145560", border: "1px solid #1F7A8C55", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 600 },
  ghostBtn: { background: "#fff", color: "#4C6169", border: "1px solid #E2E9E8", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600 },
  errorBar: { background: "#F6E7E6", color: "#A23931", fontSize: 12.5, padding: "10px 14px", borderRadius: 8, marginBottom: 12 },
  centerState: { display: "flex", justifyContent: "center", padding: "60px 0" },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", padding: "50px 0", background: "#fff", border: "1px dashed #E2E9E8", borderRadius: 12 },
  cityHeader: { display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 700, color: "#145560", marginBottom: 10 },
  cityCount: { fontSize: 11, fontWeight: 500, color: "#8FA1A8", marginLeft: 2 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 },
  card: { textAlign: "left", background: "#fff", border: "1px solid #E2E9E8", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 6 },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  techName: { fontWeight: 700, fontSize: 14.5 },
  tinyIconBtn: { background: "none", border: "none", color: "#8FA1A8", display: "flex", padding: 3 },
  cardRow: { display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#4C6169" },
  statsRow: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 },
  statChip: { display: "flex", alignItems: "center", gap: 3, fontSize: 10.5, background: "#F4F7F6", color: "#4C6169", padding: "3px 8px", borderRadius: 20, fontWeight: 600 },
  skillChip: { fontSize: 10.5, background: "#E3F0F1", color: "#145560", padding: "3px 8px", borderRadius: 20, fontWeight: 600 },
  overlay: { position: "fixed", inset: 0, background: "rgba(18,32,36,0.35)", display: "flex", justifyContent: "flex-end", zIndex: 50 },
  overlay2: { position: "fixed", inset: 0, background: "rgba(18,32,36,0.35)", display: "flex", zIndex: 60 },
  panel: { width: 440, maxWidth: "100%", background: "#F9FAFA", height: "100%", display: "flex", flexDirection: "column", boxShadow: "-8px 0 24px rgba(0,0,0,0.08)" },
  panelHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "18px 20px", background: "#fff", borderBottom: "1px solid #E2E9E8" },
  panelName: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18 },
  panelSub: { fontSize: 11.5, color: "#8FA1A8", marginTop: 2 },
  iconBtn: { background: "#F4F7F6", border: "none", borderRadius: 8, padding: 6, display: "flex", color: "#4C6169" },
  panelBody: { flex: 1, overflowY: "auto", padding: 20 },
  addrBox: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#4C6169", background: "#fff", border: "1px solid #E2E9E8", borderRadius: 9, padding: "8px 10px", marginBottom: 14 },
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 },
  summaryCard: { background: "#fff", border: "1px solid #E2E9E8", borderRadius: 9, padding: "10px 8px", textAlign: "center" },
  summaryNum: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15 },
  summaryLabel: { fontSize: 10, color: "#8FA1A8", marginTop: 3 },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: "#8FA1A8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 },
  emptyVisits: { fontSize: 12.5, color: "#8FA1A8", background: "#fff", border: "1px dashed #E2E9E8", borderRadius: 9, padding: 16, textAlign: "center" },
  visitList: { display: "flex", flexDirection: "column", gap: 8 },
  visitRow: { display: "block", background: "#fff", border: "1px solid #E2E9E8", borderRadius: 9, padding: 10, textDecoration: "none", color: "#16262B" },
  visitDate: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#8FA1A8" },
  modal: { background: "#fff", borderRadius: 14, width: 420, maxWidth: "92vw", maxHeight: "88vh", display: "flex", flexDirection: "column", margin: "auto" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", borderBottom: "1px solid #E2E9E8" },
  modalTitle: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16 },
  modalBody: { padding: 18, overflowY: "auto" },
  fieldLabel: { fontSize: 11.5, fontWeight: 600, color: "#4C6169", marginBottom: 5 },
  input: { width: "100%", border: "1px solid #E2E9E8", borderRadius: 7, padding: "8px 10px", fontSize: 13, outline: "none", color: "#16262B", background: "#fff" },
  formErr: { color: "#C1443D", fontSize: 12, marginBottom: 8 },
  formActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 },
};
