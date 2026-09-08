"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, FileUp, Loader2, Search, X } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import AppShell from "../../components/AppShell";
import { fmtDateShort, orderFromDb, orderStoreDisplay } from "../../../lib/dataHelpers";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export default function CreateAcceptancePage() {
  return <AppShell active="acceptance">{() => <CreateAcceptanceView />}</AppShell>;
}

function CreateAcceptanceView() {
  const [orders, setOrders] = useState([]);
  const [orderId, setOrderId] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase.from("orders").select("*, stores(*)").eq("status", "已完成").order("completed_at", { ascending: false })
      .then(({ data, error: loadError }) => {
        if (loadError) setError(`加载已完成工单失败：${loadError.message}`);
        setOrders((data || []).map(orderFromDb));
        setLoading(false);
      });
  }, []);

  const selectedOrder = orders.find((order) => order.id === orderId) || null;
  const results = useMemo(() => {
    const keyword = orderSearch.trim().toLowerCase();
    if (!keyword) return [];
    return orders.filter((order) => {
      const display = orderStoreDisplay(order);
      return `${order.ticketNo} ${display.city} ${display.mall} ${display.storeName} ${display.brand}`.toLowerCase().includes(keyword);
    }).slice(0, 8);
  }, [orders, orderSearch]);

  function chooseFile(event) {
    const selected = event.target.files?.[0] || null;
    setError(""); setResult(null);
    if (!selected) { setFile(null); return; }
    if (selected.type !== "application/pdf" && !selected.name.toLowerCase().endsWith(".pdf")) { setFile(null); setError("只能上传 PDF 文件"); return; }
    if (selected.size > MAX_FILE_SIZE) { setFile(null); setError("PDF 文件不能超过 20MB"); return; }
    setFile(selected);
  }

  async function submit(event) {
    event.preventDefault();
    if (!selectedOrder) { setError("请先选择一个已完成工单"); return; }
    if (!file) { setError("请先选择已经填写完成的 PDF"); return; }
    setSubmitting(true); setError(""); setResult(null);
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("请先登录后台账号");
      const body = new FormData(); body.append("order_id", selectedOrder.id); body.append("file", file);
      const response = await fetch("/api/acceptance-forms", { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body });
      const responseBody = await response.json();
      if (!response.ok) throw new Error(responseBody.error || "生成签字链接失败");
      setResult({ ...responseBody, link: `${window.location.origin}/sign/${responseBody.token}` });
    } catch (e) { setError(e.message || "生成签字链接失败"); } finally { setSubmitting(false); }
  }

  async function copyLink() { if (!result?.link) return; await navigator.clipboard.writeText(result.link); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }

  const display = selectedOrder ? orderStoreDisplay(selectedOrder) : null;
  return <main className="acceptance-create-page"><div className="acceptance-upload-card">
    <header className="acceptance-upload-header"><div><p className="sign-demo-eyebrow">ACCEPTANCE SIGNING</p><h1>创建验收签字单</h1><p>选择已完成工单，上传已经填写完成、等待客户签字的验收单 PDF。</p></div><FileUp size={25} /></header>
    <form onSubmit={submit}>
      <label className="acceptance-field-label">关联已完成工单 *</label>
      {selectedOrder ? <div className="acceptance-selected-order"><div><strong>{selectedOrder.ticketNo}</strong><span>{display.storeName || `${display.city} · ${display.mall}`} · 完工：{fmtDateShort(selectedOrder.completedAt)}</span></div><button type="button" onClick={() => { setOrderId(""); setOrderSearch(""); }} aria-label="取消选择"><X size={15} /></button></div> : <div className="acceptance-order-search"><Search size={16} /><input placeholder={loading ? "正在加载已完成工单…" : "搜索工单号、门店名或商场名"} value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} disabled={loading} />{results.length > 0 && <div className="acceptance-order-results">{results.map((order) => { const item = orderStoreDisplay(order); return <button type="button" key={order.id} onClick={() => { setOrderId(order.id); setOrderSearch(""); }}><strong>{order.ticketNo}</strong><span>{item.storeName || `${item.city} · ${item.mall}`} · 完工：{fmtDateShort(order.completedAt)}</span></button>; })}</div>}</div>}
      <label className="acceptance-field-label acceptance-file-label">验收单 PDF *</label>
      <label className="acceptance-file-picker"><input type="file" accept="application/pdf,.pdf" onChange={chooseFile} /><span>选择 PDF 文件</span><small>仅支持 PDF，最大 20MB</small></label>
      {file && <div className="acceptance-selected-file"><span>文件名：{file.name}</span><span>{(file.size / 1024 / 1024).toFixed(2)} MB</span></div>}{error && <p className="acceptance-error">{error}</p>}
      <button className="acceptance-generate-button" type="submit" disabled={submitting || loading || !selectedOrder || !file}>{submitting ? <><Loader2 className="acceptance-spin" size={17} /> 生成中…</> : "生成客户签字链接"}</button></form>
    {result && <section className="acceptance-result"><h2><CheckCircle2 size={19} /> 验收单已生成</h2><p>{selectedOrder?.ticketNo} · {display?.storeName || display?.mall} · 等待客户签字</p><code>{result.link}</code><button type="button" onClick={copyLink}><Copy size={15} /> {copied ? "已复制" : "复制链接"}</button></section>}
  </div></main>;
}