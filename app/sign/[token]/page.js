"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, PenLine, RotateCcw, X } from "lucide-react";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// Coordinates are in the real PDF's bottom-left coordinate system, not the old SVG system.
const SIGNATURE_BOX = { x: 100, y: 110, maxW: 250, maxH: 26 };

function cropTransparentSignature(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  let left = width; let top = height; let right = 0; let bottom = 0; let found = false;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] > 8) {
        found = true;
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
  }
  if (!found) return null;
  const padding = 3;
  const crop = document.createElement("canvas");
  const cropLeft = Math.max(0, left - padding); const cropTop = Math.max(0, top - padding);
  const cropRight = Math.min(width - 1, right + padding); const cropBottom = Math.min(height - 1, bottom + padding);
  crop.width = cropRight - cropLeft + 1; crop.height = cropBottom - cropTop + 1;
  crop.getContext("2d").drawImage(canvas, cropLeft, cropTop, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return crop.toDataURL("image/png");
}

export default function SignPage({ params }) {
  const [view, setView] = useState("document");
  const [showSignature, setShowSignature] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [finalImage, setFinalImage] = useState(null);
  const [status, setStatus] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [signError, setSignError] = useState("");
  const [signedNotice, setSignedNotice] = useState("");
  const [previewVersion, setPreviewVersion] = useState(0);
  const padRef = useRef(null);
  const previewRef = useRef(null);
  const wrapRef = useRef(null);
  const sourcePdfRef = useRef(null);
  const signedPdfRef = useRef(null);
  const drawing = useRef(false);
  const lastPoint = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(`/api/acceptance-forms/${encodeURIComponent(params.token)}`, { cache: "no-store" });
        if (!response.ok) throw new Error((await response.json()).error || "验收单不存在");
        const acceptanceStatus = (response.headers.get("X-Acceptance-Status") || "").trim().toLowerCase();
        if (acceptanceStatus !== "pending_signature" && acceptanceStatus !== "signed") {
          throw new Error("验收单状态异常，请刷新页面后重试");
        }
        sourcePdfRef.current = new Uint8Array(await response.arrayBuffer());
        setView(acceptanceStatus === "signed" ? "done" : "document");
        setStatus(acceptanceStatus);
      } catch (error) { setLoadError(error.message || "读取验收单失败"); setStatus("error"); }
    })();
  }, [params.token]);

  useEffect(() => {
    if (status === "loading" || status === "error" || !previewRef.current) return undefined;
    let cancelled = false;
    const renderPreview = async () => {
      const data = status === "signed" && signedPdfRef.current
        ? signedPdfRef.current
        : sourcePdfRef.current;
      if (!data || !previewRef.current) return;
      const doc = await pdfjsLib.getDocument({ data: data.slice() }).promise;
      const page = await doc.getPage(1);
      if (cancelled || !previewRef.current) return;
      const canvas = previewRef.current;
      const containerWidth = canvas.parentElement.clientWidth;
      const baseViewport = page.getViewport({ scale: 1 });
      const cssScale = containerWidth / baseViewport.width;
      const outputScale = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: cssScale * outputScale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${containerWidth}px`;
      canvas.style.height = `${viewport.height / outputScale}px`;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    };
    renderPreview().catch((error) => { if (!cancelled) { setLoadError(error.message || "PDF 预览失败"); setStatus("error"); } });
    return () => { cancelled = true; };
  }, [status, view, previewVersion]);

  const resizePad = useCallback(() => {
    const canvas = padRef.current; const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect(); const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(170 * ratio); canvas.style.width = `${rect.width}px`; canvas.style.height = "170px";
    const context = canvas.getContext("2d"); context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, rect.width, 170); setHasSignature(false);
  }, []);

  useEffect(() => { if (!showSignature) return undefined; resizePad(); window.addEventListener("resize", resizePad); return () => window.removeEventListener("resize", resizePad); }, [showSignature, resizePad]);

  function point(event) { const rect = padRef.current.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  function pointerDown(event) { event.preventDefault(); padRef.current.setPointerCapture(event.pointerId); drawing.current = true; lastPoint.current = point(event); }
  function pointerMove(event) {
    if (!drawing.current) return; event.preventDefault(); const current = point(event); const previous = lastPoint.current || current; const context = padRef.current.getContext("2d");
    context.beginPath(); context.moveTo(previous.x, previous.y); context.lineTo(current.x, current.y); context.strokeStyle = "#16211d"; context.lineWidth = 1.35 + (event.pressure > 0 ? event.pressure : .5) * 1.35; context.lineCap = "round"; context.lineJoin = "round"; context.stroke(); lastPoint.current = current; setHasSignature(true);
  }
  function pointerUp(event) { if (!drawing.current) return; drawing.current = false; lastPoint.current = null; if (event?.pointerId != null && padRef.current.hasPointerCapture(event.pointerId)) padRef.current.releasePointerCapture(event.pointerId); }
  function clearPad() { resizePad(); }

  async function createSignedPdf(signatureUrl, moment) {
    if (!sourcePdfRef.current) throw new Error("PDF 尚未加载完成");
    const pdf = await PDFDocument.load(sourcePdfRef.current);
    const page = pdf.getPage(0);
    const signatureBytes = await (await fetch(signatureUrl)).arrayBuffer();
    const signature = await pdf.embedPng(signatureBytes);
    const scale = Math.min(SIGNATURE_BOX.maxW / signature.width, SIGNATURE_BOX.maxH / signature.height);
    page.drawImage(signature, { x: SIGNATURE_BOX.x, y: SIGNATURE_BOX.y, width: signature.width * scale, height: signature.height * scale });

    return pdf.save();
  }

  async function confirmSign() {
    if (!hasSignature || isSigning) return;
    setIsSigning(true);
    setSignError("");
    try {
      const signature = cropTransparentSignature(padRef.current);
      if (!signature) throw new Error("没有读取到签名笔迹，请重新签名");
      const signedBytes = await createSignedPdf(signature, new Date());
      signedPdfRef.current = new Uint8Array(signedBytes);
      const uploadData = new FormData();
      uploadData.append("file", new File([signedBytes], "signed.pdf", { type: "application/pdf" }));
      const saved = await fetch(`/api/acceptance-forms/${encodeURIComponent(params.token)}/sign`, { method: "POST", body: uploadData });
      let savedBody = null;
      try { savedBody = await saved.json(); } catch { /* keep the HTTP error below */ }
      if (!saved.ok) {
        if (saved.status === 409) {
          const latest = await fetch(`/api/acceptance-forms/${encodeURIComponent(params.token)}`, { cache: "no-store" });
          const latestStatus = (latest.headers.get("X-Acceptance-Status") || "").trim().toLowerCase();
          if (!latest.ok || latestStatus !== "signed") {
            throw new Error("验收单已签署，但暂时无法读取签字版文件，请刷新后重试");
          }
          signedPdfRef.current = new Uint8Array(await latest.arrayBuffer());
          setPreviewVersion((version) => version + 1);
          setSignedNotice("⚠️ 该验收单已完成签字。本验收单已经完成签署，无需重复签署。");
          setShowSignature(false);
          setStatus("signed");
          setView("done");
          return;
        }
        throw new Error(savedBody?.error || `保存签字失败（HTTP ${saved.status}）`);
      }
      setFinalImage(true);
      setStatus("signed");
      setShowSignature(false);
      setView("done");
    } catch (error) {
      console.error("确认签字失败", error);
      setSignError(error.message || "确认签字失败，请稍后重试");
    } finally {
      setIsSigning(false);
    }
  }
  async function downloadPdf() {
    const bytes = signedPdfRef.current || sourcePdfRef.current;
    if (!bytes) return; setIsDownloading(true);
    try { const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })); const link = document.createElement("a"); link.href = url; link.download = "项目完工验收单-已签字.pdf"; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); } finally { setIsDownloading(false); }
  }
  function reset() { signedPdfRef.current = null; setView("document"); setShowSignature(false); setHasSignature(false); setFinalImage(null); setSignError(""); setSignedNotice(""); setStatus("pending_signature"); }

  if (status === "loading") return <main className="sign-demo-page"><section className="sign-phone-screen"><div className="sign-loading-state">正在读取验收单…</div></section></main>;
  if (status === "error") return <main className="sign-demo-page"><section className="sign-phone-screen"><div className="sign-loading-state">{loadError}</div></section></main>;
  const signedView = status === "signed" || view === "done";
  return <main className="sign-demo-page"><section className="sign-phone-screen">
    {!signedView ? <div className="sign-document-view"><header className="sign-document-topbar"><span className="sign-demo-eyebrow">PROJECT COMPLETION</span><h1>项目完工验收单</h1></header><div className="sign-document-scroll"><div className="sign-document-frame"><canvas ref={previewRef} className="sign-pdf-preview" aria-label="完工验收单预览" /></div></div><div className="sign-bottom-cta"><button className="sign-demo-primary" type="button" onClick={() => setShowSignature(true)}><PenLine size={17} /> 点击签名</button></div></div> : <div className="sign-done-view"><div className="sign-done-top"><div className="sign-done-badge"><Check size={25} strokeWidth={3} /></div><h1>签字完成</h1><p>{signedNotice || (status === "signed" ? "该验收单已完成签署，无需重复签署" : "签名与时间已自动添加到验收单底部")}</p><span className="sign-complete-pill">✓ 已完成</span></div><div className="sign-document-scroll sign-done-scroll"><div className="sign-document-frame"><canvas ref={previewRef} className="sign-pdf-preview" aria-label="已签字验收单预览" /></div></div><div className="sign-bottom-cta sign-done-cta"><button className="sign-demo-primary" type="button" onClick={downloadPdf} disabled={isDownloading}><Download size={17} /> {isDownloading ? "生成中…" : "下载已签字版本"}</button>{status !== "signed" && <button className="sign-reset-button" type="button" onClick={reset}><RotateCcw size={13} /> 重新体验一次</button>}</div></div>}
    {showSignature && <div className="sign-sheet-backdrop" role="presentation" onClick={() => !isSigning && setShowSignature(false)}><section className="sign-sheet" role="dialog" aria-modal="true" aria-labelledby="sign-sheet-title" onClick={(event) => event.stopPropagation()}><div className="sign-sheet-head"><h2 id="sign-sheet-title">请在下方签字</h2><button className="sign-close-button" type="button" aria-label="关闭签名窗口" onClick={() => !isSigning && setShowSignature(false)}><X size={20} /></button></div><p className="sign-sheet-hint">签名会自动贴到验收单底部“门店签字”处，并自动盖上签署时间</p><div className="sign-pad-wrap" ref={wrapRef}><canvas ref={padRef} className="sign-pad-canvas" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} /><div className="sign-pad-baseline" /></div>{signError && <p className="sign-sign-error" role="alert">{signError}</p>}<div className="sign-sheet-actions"><button className="sign-sheet-secondary" type="button" onClick={clearPad} disabled={isSigning}>清除重签</button><button className="sign-demo-primary" type="button" onClick={confirmSign} disabled={!hasSignature || isSigning}>{isSigning ? "签署中…" : "确认签字"}</button></div></section></div>}
  </section></main>;
}