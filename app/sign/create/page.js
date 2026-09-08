"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, FileUp, Loader2, Search, X } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import { supabase } from "../../../lib/supabaseClient";
import AppShell from "../../components/AppShell";
import { fmtDateShort, orderFromDb, orderStoreDisplay } from "../../../lib/dataHelpers";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const SIGNATURE_WIDTH_RATIO = 0.34;
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

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
  const [signaturePosition, setSignaturePosition] = useState(null);
  const [previewError, setPreviewError] = useState("");

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

  useEffect(() => {
    if (!file) {
      setSignaturePosition(null);
      setPreviewError("");
      return undefined;
    }
    let cancelled = false;
    const canvas = document.createElement("canvas");
    const render = async () => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const documentProxy = await pdfjsLib.getDocument({ data: bytes }).promise;
        const page = await documentProxy.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const maxWidth = Math.min(560, Math.max(280, window.innerWidth - 80));
        const scale = Math.min(1, maxWidth / baseViewport.width);
        const viewport = page.getViewport({ scale });
        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.ceil(viewport.width * outputScale);
        canvas.height = Math.ceil(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport: page.getViewport({ scale: scale * outputScale }) }).promise;
        if (cancelled) return;
        const preview = document.getElementById("acceptance-signature-preview-canvas");
        if (preview) {
          preview.width = canvas.width;
          preview.height = canvas.height;
          preview.style.width = canvas.style.width;
          preview.style.height = canvas.style.height;
          preview.getContext("2d").drawImage(canvas, 0, 0);
        }
        setPreviewError("");
      } catch (renderError) {
        if (!cancelled) setPreviewError(renderError.message || "PDF 预览失败");
      }
    };
    render();
    return () => { cancelled = true; };
  }, [file]);

  function chooseFile(event) {
    const selected = event.target.files?.[0] || null;
    setError(""); setResult(null);
    if (!selected) { setFile(null); return; }
    if (selected.type !== "application/pdf" && !selected.name.toLowerCase().endsWith(".pdf")) { setFile(null); setError("只能上传 PDF 文件"); return; }
    if (selected.size > MAX_FILE_SIZE) { setFile(null); setError("PDF 文件不能超过 20MB"); return; }
    setFile(selected);
    setSignaturePosition(null);
  }

  function chooseSignaturePosition(event) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const xRatio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const yRatio = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    setSignaturePosition({ xRatio, yRatio, widthRatio: SIGNATURE_WIDTH_RATIO });
  }

  async function submit(event) {
    event.preventDefault();
    if (!selectedOrder) { setError("请先选择一个已完成工单"); return; }
    if (!file) { setError("请先选择已经填写完成的 PDF"); return; }
    if (!signaturePosition) { setError("请在 PDF 预览图上点选签字位置"); return; }
    setSubmitting(true); setError(""); setResult(null);
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("请先登录后台账号");
      const body = new FormData();
      body.append("order_id", selectedOrder.id);
      body.append("file", file);
      body.append("signature_x_ratio", String(signaturePosition.xRatio));
      body.append("signature_y_ratio", String(signaturePosition.yRatio));
      body.append("signature_width_ratio", String(signaturePosition.widthRatio));
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
      <label className="acceptance-file-label">验收单 PDF *</label>
      <label className="acceptance-file-picker"><input type="file" accept="application/pdf,.pdf" onChange={chooseFile} /><span>{file ? "重新选择 PDF 文件" : "选择 PDF 文件"}</span><small>仅支持 PDF，最大 20MB</small></label>
      {file && <div className="acceptance-selected-file"><span>文件名：{file.name}</span><span>{(file.size / 1024 / 1024).toFixed(2)} MB</span></div>}{error && <p className="acceptance-error">{error}</p>}
      {file && <div className="acceptance-signature-picker"><div className="acceptance-signature-picker-title">点选签字位置 *</div><p>点击 PDF 第一页中签字应落下的位置，可重复点击调整。</p><div className="acceptance-signature-preview"><canvas id="acceptance-signature-preview-canvas" onClick={chooseSignaturePosition} />{signaturePosition && <div className="acceptance-signature-marker" style={{ left: `${signaturePosition.xRatio * 100}%`, top: `${signaturePosition.yRatio * 100}%`, width: `${signaturePosition.widthRatio * 100}%` }} />}</div>{previewError && <p className="acceptance-error">{previewError}</p>}{signaturePosition && <div className="acceptance-signature-selection">已选择位置：横向 {(signaturePosition.xRatio * 100).toFixed(1)}%，纵向 {(signaturePosition.yRatio * 100).toFixed(1)}%</div>}</div>}
      <button className="acceptance-generate-button" type="submit" disabled={submitting || loading || !selectedOrder || !file || !signaturePosition}>{submitting ? <><Loader2 className="acceptance-spin" size={17} /> 生成中…</> : "生成客户签字链接"}</button></form>
    {result && <section className="acceptance-result"><h2><CheckCircle2 size={19} /> 验收单已生成</h2><p>{selectedOrder?.ticketNo} · {display?.storeName || display?.mall} · 等待客户签字</p><code>{result.link}</code><button type="button" onClick={copyLink}><Copy size={15} /> {copied ? "已复制" : "复制链接"}</button></section>}
  </div></main>;
}