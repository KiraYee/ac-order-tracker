"use client";

import { useState } from "react";
import { Copy, FileUp, Loader2 } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export default function CreateAcceptancePage() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

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
    if (!file) { setError("请先选择已经填写完成的 PDF"); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("请先登录后台账号");
      const body = new FormData(); body.append("file", file);
      const response = await fetch("/api/acceptance-forms", { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body });
      const responseBody = await response.json();
      if (!response.ok) throw new Error(responseBody.error || "生成签字链接失败");
      setResult({ ...responseBody, link: `${window.location.origin}/sign/${responseBody.token}` });
    } catch (e) { setError(e.message || "生成签字链接失败"); } finally { setLoading(false); }
  }

  async function copyLink() { if (!result?.link) return; await navigator.clipboard.writeText(result.link); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }

  return <main className="acceptance-create-page"><div className="acceptance-upload-card">
    <header className="acceptance-upload-header"><div><p className="sign-demo-eyebrow">ACCEPTANCE SIGNING</p><h1>创建验收签字单</h1><p>请上传已经填写完成、等待客户签字的验收单 PDF。</p></div><FileUp size={25} /></header>
    <form onSubmit={submit}><label className="acceptance-file-picker"><input type="file" accept="application/pdf,.pdf" onChange={chooseFile} /><span>选择 PDF 文件</span><small>仅支持 PDF，最大 20MB</small></label>{file && <div className="acceptance-selected-file"><span>文件名：{file.name}</span><span>{(file.size / 1024 / 1024).toFixed(2)} MB</span></div>}{error && <p className="acceptance-error">{error}</p>}<button className="acceptance-generate-button" type="submit" disabled={loading || !file}>{loading ? <><Loader2 className="acceptance-spin" size={17} /> 生成中…</> : "生成客户签字链接"}</button></form>
    {result && <section className="acceptance-result"><h2>验收单已生成</h2><p>状态：等待客户签字</p><code>{result.link}</code><button type="button" onClick={copyLink}><Copy size={15} /> {copied ? "已复制" : "复制链接"}</button></section>}
  </div></main>;
}