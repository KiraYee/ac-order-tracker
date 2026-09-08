"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardList, Copy, ExternalLink, FileSignature, Loader2, Trash2 } from "lucide-react";
import AppShell from "../../components/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDateShort } from "../../../lib/dataHelpers";

export default function AcceptanceRecordsPage() {
  return <AppShell active="acceptance">{() => <AcceptanceRecordsView />}</AppShell>;
}

function AcceptanceRecordsView() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copyingId, setCopyingId] = useState(null);
  const [opening, setOpening] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => { loadRecords(); }, []);

  async function loadRecords() {
    setLoading(true); setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("请先登录后台账号");
      const response = await fetch("/api/acceptance-forms/records", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "读取验收单记录失败");
      setRecords(body.records || []);
    } catch (e) { setError(e.message || "读取验收单记录失败"); } finally { setLoading(false); }
  }

  async function copyLink(record) {
    setCopyingId(record.id);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/sign/${record.token}`);
    } catch (e) { setError(`复制链接失败：${e.message || "请检查浏览器权限"}`); }
    window.setTimeout(() => setCopyingId(null), 1500);
  }

  async function openPdf(record, kind) {
    setOpening(`${record.id}-${kind}`); setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("请先登录后台账号");
      const response = await fetch(`/api/acceptance-forms/${encodeURIComponent(record.token)}/download?kind=${kind}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "打开 PDF 失败");
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (e) { setError(e.message || "打开 PDF 失败"); } finally { setOpening(null); }
  }

  async function deleteRecord(record) {
    const confirmed = window.confirm("确定删除这条验收单吗？删除后将同时删除原始 PDF、已签字 PDF，以及工单中的已签字验收单链接，此操作不可恢复。人工上传的验收照片不会受影响。");
    if (!confirmed) return;
    setDeleting(record.id); setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("请先登录后台账号");
      const response = await fetch(`/api/acceptance-forms/${encodeURIComponent(record.token)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "删除验收单失败");
      setRecords((current) => current.filter((item) => item.id !== record.id));
    } catch (e) { setError(e.message || "删除验收单失败"); } finally { setDeleting(null); }
  }

  return <main className="acceptance-records-page">
    <header className="acceptance-records-header"><div><p className="sign-demo-eyebrow">ACCEPTANCE SIGNING</p><h1>电子验收单记录</h1><p>查看已创建的验收单、签署状态和 PDF 文件。</p></div><Link className="acceptance-new-button" href="/sign/create"><FileSignature size={16} /> 新建验收单</Link></header>
    {error && <div className="acceptance-records-error">{error}</div>}
    {loading ? <div className="acceptance-records-state"><Loader2 className="acceptance-spin" size={20} /> 正在加载记录…</div> : records.length === 0 ? <div className="acceptance-records-state"><ClipboardList size={28} /><span>暂无电子验收单记录</span><Link href="/sign/create">创建第一条验收单</Link></div> : <div className="acceptance-records-table-wrap"><table className="acceptance-records-table"><thead><tr><th>门店</th><th>完工时间</th><th>签署状态</th><th>签署时间</th><th>操作</th></tr></thead><tbody>{records.map((record) => { const signed = record.status === "signed"; const order = Array.isArray(record.orders) ? record.orders[0] : record.orders; const store = Array.isArray(order?.stores) ? order.stores[0] : order?.stores; return <tr key={record.id}><td>{store?.store_name || "—"}</td><td>{fmtDateShort(order?.completed_at)}</td><td><span className={`acceptance-status-badge ${signed ? "signed" : "pending"}`}>{signed ? <CheckCircle2 size={13} /> : null}{signed ? "已签署" : "待签署"}</span></td><td>{fmtDateShort(record.signed_at)}</td><td><div className="acceptance-record-actions"><button type="button" onClick={() => copyLink(record)}><Copy size={13} /> {copyingId === record.id ? "已复制" : "复制签字链接"}</button><button type="button" onClick={() => openPdf(record, "filled")} disabled={opening === `${record.id}-filled`}>{opening === `${record.id}-filled` ? <Loader2 className="acceptance-spin" size={13} /> : <ExternalLink size={13} />} 查看原始PDF</button><button type="button" onClick={() => openPdf(record, "signed")} disabled={!signed || opening === `${record.id}-signed`}>{opening === `${record.id}-signed` ? <Loader2 className="acceptance-spin" size={13} /> : <ExternalLink size={13} />} 查看已签署PDF</button><button type="button" className="acceptance-delete-button" onClick={() => deleteRecord(record)} disabled={deleting === record.id}>{deleting === record.id ? <Loader2 className="acceptance-spin" size={13} /> : <Trash2 size={13} />} {deleting === record.id ? "删除中…" : "删除"}</button></div></td></tr>; })}</tbody></table></div>}
  </main>;
}