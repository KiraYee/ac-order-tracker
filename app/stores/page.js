"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, MapPin, Pencil, Phone, Store, X } from "lucide-react";
import AppShell from "../components/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate, generateStoreName, orderFromDb, storeNameWithoutCity } from "../../lib/dataHelpers";

export default function StoresPage() {
  return (
    <AppShell active="stores">
      <StoresView />
    </AppShell>
  );
}

function StoresView() {
  const [stores, setStores] = useState([]);
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [editingStore, setEditingStore] = useState(null);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [{ data: storeRows, error: storeError }, { data: orderRows, error: orderError }] = await Promise.all([
        supabase.from("stores").select("*").order("city").order("brand").order("mall").order("store_name"),
        supabase.from("orders").select("*, expense_records(*), visits(*, expense_records(*))").order("report_time", { ascending: false }),
      ]);
      if (storeError) throw storeError;
      if (orderError) throw orderError;
      setStores(storeRows || []);
      setOrders((orderRows || []).map(orderFromDb));
      setErrorMsg("");
    } catch (e) {
      setErrorMsg("加载门店数据失败：" + (e.message || "未知错误"));
    } finally {
      setLoading(false);
    }
  }

  const storeRows = useMemo(() => stores.map((store) => {
    const relatedOrders = orders.filter((order) => order.storeId === store.id);
    const visitTimes = relatedOrders.flatMap((order) => (order.visits || []).map((visit) => visit.visitTime)).filter(Boolean);
    const recentServiceTime = visitTimes.length
      ? visitTimes.reduce((latest, value) => (new Date(value) > new Date(latest) ? value : latest))
      : null;
    return { store, relatedOrders, recentServiceTime };
  }), [stores, orders]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return storeRows;
    return storeRows.filter(({ store }) =>
      [store.city, store.brand, store.mall, store.store_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [search, storeRows]);

  const groupedRows = useMemo(() => {
    const groups = new Map();
    filteredRows.forEach((row) => {
      const city = row.store.city || "未分类";
      if (!groups.has(city)) groups.set(city, []);
      groups.get(city).push(row);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, "zh-CN"));
  }, [filteredRows]);

  const selected = storeRows.find((row) => row.store.id === selectedId) || null;

  async function saveStore(id, patch) {
    try {
      const { data, error } = await supabase
        .from("stores")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      setStores((prev) => prev.map((store) => (store.id === id ? data : store)));
      setEditingStore(null);
      setErrorMsg("");
    } catch (e) {
      setErrorMsg("保存门店信息失败：" + (e.message || "未知错误"));
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <div style={styles.title}>门店</div>
          <div style={styles.subtitle}>维护门店长期信息，查看历史服务记录</div>
        </div>
      </div>

      {errorMsg && <div style={styles.errorBar}>{errorMsg}</div>}

      <div style={styles.actionRow}>
        <button type="button" style={styles.primaryBtn} onClick={() => setShowNew(true)}>＋ 新建门店</button>
      </div>

      <div style={styles.searchBox}>
        <input
          style={styles.searchInput}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索城市 / 品牌 / 商场 / 门店名称"
        />
      </div>

      {loading ? (
        <div style={styles.centerState}><Loader2 size={22} color="#1F7A8C" /></div>
      ) : filteredRows.length === 0 ? (
        <div style={styles.emptyState}>
          <Store size={28} color="#C7D5D3" />
          <div style={styles.emptyText}>{stores.length ? "没有符合条件的门店" : "还没有门店档案"}</div>
        </div>
      ) : (
        <div>
          {groupedRows.map(([city, rows]) => (
            <section key={city} style={styles.cityGroup}>
              <div style={styles.cityHeader}>
                <MapPin size={13} /> {city}
                <span style={styles.cityCount}>{rows.length} 家</span>
              </div>
              <div style={styles.list}>
                {rows.map(({ store, relatedOrders, recentServiceTime }) => (
                  <button key={store.id} type="button" style={styles.card} className="card-hover" onClick={() => setSelectedId(store.id)}>
                    <div style={styles.cardTop}>
                      <div style={styles.storeName}>{storeNameWithoutCity(store.store_name, store.city)}</div>
                      <Pencil size={14} color="#8FA1A8" />
                    </div>
                    <div style={styles.location}><MapPin size={12} /> {store.brand} · {store.mall}</div>
                    <div style={styles.statsRow}>
                      <span>最近服务：{recentServiceTime ? fmtDate(recentServiceTime) : "暂无"}</span>
                      <span>关联工单：{relatedOrders.length} 单</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {selected && (
        <StoreDetail
          store={selected.store}
          orders={selected.relatedOrders}
          recentServiceTime={selected.recentServiceTime}
          onClose={() => setSelectedId(null)}
          onEdit={() => setEditingStore(selected.store)}
        />
      )}

      {editingStore && (
        <StoreForm
          initial={editingStore}
          onClose={() => setEditingStore(null)}
          onSubmit={(patch) => saveStore(editingStore.id, patch)}
        />
      )}

      {showNew && (
        <NewStoreForm
          onClose={() => setShowNew(false)}
          onSubmit={async (data) => {
            try {
              const { data: row, error } = await supabase.from("stores").insert(data).select().single();
              if (error) throw error;
              setStores((prev) => [...prev, row]);
              setShowNew(false);
              setSelectedId(row.id);
            } catch (e) {
              setErrorMsg("创建门店失败：" + (e.message || "未知错误"));
            }
          }}
        />
      )}
    </div>
  );
}

function StoreDetail({ store, orders, recentServiceTime, onClose, onEdit }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.panelHeader}>
          <div>
            <div style={styles.panelTitle}>{store.store_name}</div>
          </div>
          <div style={styles.headerButtons}>
            <button type="button" style={styles.secondaryBtn} onClick={onEdit}><Pencil size={13} /> 编辑</button>
            <button type="button" style={styles.iconBtn} onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div style={styles.panelBody} className="scrollbar">
          <SectionTitle text="基本信息" />
          <div style={styles.infoGrid}>
            <Info label="城市" value={store.city} />
            <Info label="品牌" value={store.brand} />
            <Info label="商场" value={store.mall} />
            <Info label="门店名称" value={store.store_name} />
            <Info label="地址" value={store.address} />
            <Info label="联系人" value={store.contact_name} />
            <Info label="联系电话" value={store.contact_phone} />
            <Info label="施工证" value={store.requires_construction_permit ? "需要" : "不需要"} />
          </div>

          <SectionTitle text="服务要求" />
          <div style={styles.longText}><strong>特殊要求</strong><br />{store.special_requirements || "暂无"}</div>
          <div style={styles.longText}><strong>备注</strong><br />{store.notes || "暂无"}</div>

          <SectionTitle text={`历史工单（${orders.length}）`} />
          {orders.length === 0 ? <div style={styles.muted}>暂无关联工单</div> : (
            <div style={styles.orderList}>
              {orders.map((order) => (
                <Link key={order.id} href={`/orders?open=${order.id}`} style={styles.orderRow}>
                  <span>{order.reportTime ? new Date(order.reportTime).toLocaleDateString("zh-CN") : "—"}</span>
                  <span>{order.visits?.[0]?.serviceType || "服务"}</span>
                  <span>{order.status}</span>
                  <span style={styles.orderNo}>{order.ticketNo}</span>
                </Link>
              ))}
            </div>
          )}
          <div style={styles.muted}>最近服务时间：{recentServiceTime ? fmtDate(recentServiceTime) : "暂无"}</div>
        </div>
      </div>
    </div>
  );
}

function StoreForm({ initial, onClose, onSubmit }) {
  const [form, setForm] = useState({
    store_name: initial.store_name || "",
    address: initial.address || "",
    contact_name: initial.contact_name || "",
    contact_phone: initial.contact_phone || "",
    special_requirements: initial.special_requirements || "",
    notes: initial.notes || "",
    requires_construction_permit: !!initial.requires_construction_permit,
  });
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.panelHeader}>
          <div><div style={styles.panelTitle}>编辑门店信息</div><div style={styles.panelSub}>{initial.store_name}</div></div>
          <button type="button" style={styles.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={styles.formBody}>
          <Field label="门店名称"><input style={styles.input} value={form.store_name} onChange={(e) => update("store_name", e.target.value)} /></Field>
          <Field label="地址"><input style={styles.input} value={form.address} onChange={(e) => update("address", e.target.value)} /></Field>
          <Field label="联系人"><input style={styles.input} value={form.contact_name} onChange={(e) => update("contact_name", e.target.value)} /></Field>
          <Field label="联系电话"><input style={styles.input} value={form.contact_phone} onChange={(e) => update("contact_phone", e.target.value)} /></Field>
          <Field label="特殊要求"><textarea style={styles.textarea} value={form.special_requirements} onChange={(e) => update("special_requirements", e.target.value)} /></Field>
          <Field label="备注"><textarea style={styles.textarea} value={form.notes} onChange={(e) => update("notes", e.target.value)} /></Field>
          <Field label="是否需要施工证">
            <div style={styles.toggleRow}>
              {[false, true].map((value) => <button key={String(value)} type="button" style={{ ...styles.toggleBtn, ...(form.requires_construction_permit === value ? styles.toggleBtnActive : {}) }} onClick={() => update("requires_construction_permit", value)}>{value ? "需要" : "不需要"}</button>)}
            </div>
          </Field>
          <div style={styles.formActions}>
            <button type="button" style={styles.ghostBtn} onClick={onClose}>取消</button>
            <button type="button" style={styles.primaryBtn} onClick={() => onSubmit({ ...form, store_name: form.store_name.trim(), address: form.address.trim() || null, contact_name: form.contact_name.trim() || null, contact_phone: form.contact_phone.trim() || null, special_requirements: form.special_requirements.trim() || null, notes: form.notes.trim() || null, requires_construction_permit: !!form.requires_construction_permit })}>保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewStoreForm({ onClose, onSubmit }) {
  const [form, setForm] = useState({ city: "", brand: "", mall: "", store_name: "", address: "", contact_name: "", contact_phone: "", special_requirements: "", notes: "", requires_construction_permit: false });
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  useEffect(() => {
    if (!form.store_name || form.store_name === generateStoreName(form.city, form.brand, form.mall)) {
      update("store_name", generateStoreName(form.city.trim(), form.brand.trim(), form.mall.trim()));
    }
  }, [form.city, form.brand, form.mall]);
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.panelHeader}><div style={styles.panelTitle}>新建门店</div><button type="button" style={styles.iconBtn} onClick={onClose}><X size={18} /></button></div>
        <div style={styles.formBody}>
          <Field label="城市 *"><input style={styles.input} value={form.city} onChange={(e) => update("city", e.target.value)} /></Field>
          <Field label="品牌 *"><input style={styles.input} value={form.brand} onChange={(e) => update("brand", e.target.value)} /></Field>
          <Field label="商场 *"><input style={styles.input} value={form.mall} onChange={(e) => update("mall", e.target.value)} /></Field>
          <Field label="门店名称"><input style={styles.input} value={form.store_name} onChange={(e) => update("store_name", e.target.value)} /></Field>
          <Field label="地址"><input style={styles.input} value={form.address} onChange={(e) => update("address", e.target.value)} /></Field>
          <Field label="联系人"><input style={styles.input} value={form.contact_name} onChange={(e) => update("contact_name", e.target.value)} /></Field>
          <Field label="联系电话"><input style={styles.input} value={form.contact_phone} onChange={(e) => update("contact_phone", e.target.value)} /></Field>
          <Field label="特殊要求"><textarea style={styles.textarea} value={form.special_requirements} onChange={(e) => update("special_requirements", e.target.value)} /></Field>
          <Field label="备注"><textarea style={styles.textarea} value={form.notes} onChange={(e) => update("notes", e.target.value)} /></Field>
          <Field label="是否需要施工证">
            <div style={styles.toggleRow}>
              {[false, true].map((value) => <button key={String(value)} type="button" style={{ ...styles.toggleBtn, ...(form.requires_construction_permit === value ? styles.toggleBtnActive : {}) }} onClick={() => update("requires_construction_permit", value)}>{value ? "需要" : "不需要"}</button>)}
            </div>
          </Field>
          <div style={styles.formActions}><button type="button" style={styles.ghostBtn} onClick={onClose}>取消</button><button type="button" style={styles.primaryBtn} disabled={!form.city.trim() || !form.brand.trim() || !form.mall.trim() || !form.store_name.trim()} onClick={() => onSubmit({ ...form, city: form.city.trim(), brand: form.brand.trim(), mall: form.mall.trim(), store_name: form.store_name.trim(), address: form.address.trim() || null, contact_name: form.contact_name.trim() || null, contact_phone: form.contact_phone.trim() || null, special_requirements: form.special_requirements.trim() || null, notes: form.notes.trim() || null, requires_construction_permit: !!form.requires_construction_permit })}>保存</button></div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ text }) {
  return <div style={styles.sectionTitle}>{text}</div>;
}

function Info({ label, value }) {
  return <div style={styles.infoItem}><div style={styles.infoLabel}>{label}</div><div>{value || "暂无"}</div></div>;
}

function Field({ label, children }) {
  return <label style={styles.field}><span style={styles.infoLabel}>{label}</span>{children}</label>;
}

const styles = {
  page: { padding: "28px 32px", maxWidth: 1100 },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22 },
  subtitle: { fontSize: 12.5, color: "#8FA1A8", marginTop: 4 },
  errorBar: { background: "#F6E7E6", color: "#A23931", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 12.5 },
  searchBox: { background: "#F4F7F6", border: "1px solid #E2E9E8", borderRadius: 8, padding: "8px 10px", marginBottom: 16 },
  searchInput: { width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 13, color: "#16262B" },
  centerState: { display: "flex", justifyContent: "center", padding: 60 },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", padding: 60, background: "#fff", border: "1px dashed #E2E9E8", borderRadius: 12 },
  emptyText: { marginTop: 8, color: "#4C6169", fontSize: 13 },
  list: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 },
  card: { textAlign: "left", background: "#fff", border: "1px solid #E2E9E8", borderRadius: 12, padding: 15, color: "#16262B", cursor: "pointer" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 },
  storeName: { fontWeight: 700, fontSize: 15 },
  location: { display: "flex", alignItems: "center", gap: 4, color: "#4C6169", fontSize: 12 },
  statsRow: { display: "flex", justifyContent: "space-between", gap: 8, marginTop: 14, color: "#8FA1A8", fontSize: 11.5 },
  cityGroup: { marginBottom: 24 },
  cityHeader: { display: "flex", alignItems: "center", gap: 6, color: "#145560", fontSize: 14, fontWeight: 700, marginBottom: 10 },
  cityCount: { color: "#8FA1A8", fontSize: 11.5, fontWeight: 500 },
  overlay: { position: "fixed", inset: 0, background: "rgba(18,32,36,0.35)", display: "flex", justifyContent: "flex-end", zIndex: 60 },
  panel: { width: 540, maxWidth: "100%", height: "100%", background: "#F9FAFA", display: "flex", flexDirection: "column", boxShadow: "-8px 0 24px rgba(0,0,0,0.08)" },
  modal: { width: 500, maxWidth: "92vw", maxHeight: "88vh", margin: "auto", background: "#fff", borderRadius: 14, overflow: "hidden" },
  panelHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "18px 20px", background: "#fff", borderBottom: "1px solid #E2E9E8" },
  panelTitle: { fontWeight: 700, fontSize: 18 },
  panelSub: { color: "#8FA1A8", fontSize: 12, marginTop: 4 },
  headerButtons: { display: "flex", gap: 8, alignItems: "center" },
  panelBody: { padding: 20, overflowY: "auto" },
  formBody: { padding: 20, overflowY: "auto" },
  iconBtn: { background: "#F4F7F6", border: "none", borderRadius: 8, padding: 6, display: "flex", color: "#4C6169" },
  secondaryBtn: { display: "flex", alignItems: "center", gap: 5, background: "#F4F7F6", border: "1px solid #E2E9E8", borderRadius: 7, padding: "6px 10px", fontSize: 12, color: "#4C6169" },
  sectionTitle: { fontWeight: 700, color: "#145560", fontSize: 13, margin: "6px 0 10px" },
  infoGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 },
  infoItem: { background: "#fff", border: "1px solid #E2E9E8", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#16262B" },
  infoLabel: { display: "block", color: "#8FA1A8", fontSize: 11, marginBottom: 4 },
  longText: { whiteSpace: "pre-line", background: "#fff", border: "1px solid #E2E9E8", borderRadius: 8, padding: 10, fontSize: 12.5, lineHeight: 1.6, marginBottom: 8 },
  orderList: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 },
  orderRow: { display: "grid", gridTemplateColumns: "1.2fr 1fr .8fr 1fr", gap: 6, background: "#fff", border: "1px solid #E2E9E8", borderRadius: 8, padding: "9px 10px", color: "#16262B", textDecoration: "none", fontSize: 12 },
  orderNo: { color: "#8FA1A8", textAlign: "right" },
  muted: { color: "#8FA1A8", fontSize: 11.5, marginTop: 8 },
  field: { display: "block", marginBottom: 12 },
  input: { width: "100%", border: "1px solid #E2E9E8", borderRadius: 7, padding: "8px 10px", fontSize: 13, outline: "none", color: "#16262B", background: "#fff", boxSizing: "border-box" },
  textarea: { width: "100%", minHeight: 76, resize: "vertical", border: "1px solid #E2E9E8", borderRadius: 7, padding: "8px 10px", fontSize: 13, outline: "none", color: "#16262B", background: "#fff", boxSizing: "border-box" },
  formActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 },
  primaryBtn: { display: "flex", alignItems: "center", gap: 6, background: "#1F7A8C", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600 },
  ghostBtn: { background: "#fff", color: "#4C6169", border: "1px solid #E2E9E8", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600 },
  toggleRow: { display: "flex", gap: 6 },
  toggleBtn: { background: "#fff", border: "1px solid #E2E9E8", borderRadius: 16, padding: "6px 14px", color: "#4C6169", fontSize: 12.5, fontWeight: 600 },
  toggleBtnActive: { background: "#E3F0F1", borderColor: "#1F7A8C", color: "#145560" },
};