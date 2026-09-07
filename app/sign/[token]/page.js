"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, PenLine, RotateCcw, X } from "lucide-react";
import { PDFDocument, rgb } from "pdf-lib";

// Coordinates are in the real PDF's bottom-left coordinate system, not the old SVG system.
const SIGNATURE_BOX = { x: 100, y: 110, maxW: 250, maxH: 26 };
const TIME_FIELDS = { year: { x: 333, y: 96.264 }, month: { x: 388, y: 96.264 }, day: { x: 436, y: 96.264 } };

function cropTransparentSignature(canvas) {
  const context = canvas.getContext("2d");
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
  const [pdfUrl, setPdfUrl] = useState(null);
  const [status, setStatus] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const padRef = useRef(null);
  const wrapRef = useRef(null);
  const drawing = useRef(false);
  const lastPoint = useRef(null);

  useEffect(() => {
    let objectUrl;
    (async () => {
      try {
        const response = await fetch(`/api/acceptance-forms/${encodeURIComponent(params.token)}`, { cache: "no-store" });
        if (!response.ok) throw new Error((await response.json()).error || "验收单不存在");
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
        setStatus(response.headers.get("X-Acceptance-Status") || "pending_signature");
      } catch (error) { setLoadError(error.message || "读取验收单失败"); setStatus("error"); }
    })();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [params.token]);

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
    const sourceBytes = await (await fetch(pdfUrl)).arrayBuffer();
    const pdf = await PDFDocument.load(sourceBytes);
    const page = pdf.getPage(0);
    const signatureBytes = await (await fetch(signatureUrl)).arrayBuffer();
    const signature = await pdf.embedPng(signatureBytes);
    const scale = Math.min(SIGNATURE_BOX.maxW / signature.width, SIGNATURE_BOX.maxH / signature.height);
    page.drawImage(signature, { x: SIGNATURE_BOX.x, y: SIGNATURE_BOX.y, width: signature.width * scale, height: signature.height * scale });

    // Clear the template's three separate date slots before writing the complete date.
    page.drawRectangle({ x: 320, y: 87, width: 155, height: 18, color: rgb(1, 1, 1) });
    const fullDate = `${moment.getFullYear()}年${moment.getMonth() + 1}月${moment.getDate()}日`;
    // Render the Chinese date in the browser and embed it as a small PNG so this
    // change does not require reintroducing a PDF Chinese-font dependency.
    const dateCanvas = document.createElement("canvas");
    dateCanvas.width = 620;
    dateCanvas.height = 72;
    const dateContext = dateCanvas.getContext("2d");
    dateContext.scale(4, 4);
    dateContext.fillStyle = "#1a2a22";
    dateContext.font = "10px 'Noto Sans SC', 'Microsoft YaHei', sans-serif";
    dateContext.textBaseline = "alphabetic";
    dateContext.fillText(fullDate, 0, 13);
    const dateBytes = await (await fetch(dateCanvas.toDataURL("image/png"))).arrayBuffer();
    const dateImage = await pdf.embedPng(dateBytes);
    page.drawImage(dateImage, { x: 320, y: 87, width: 155, height: 18 });
    return pdf.save();
  }

  async function confirmSign() {
    if (!hasSignature) return;
    const signature = cropTransparentSignature(padRef.current);
    if (!signature) return;
    const signedBytes = await createSignedPdf(signature, new Date());
    const signedUrl = URL.createObjectURL(new Blob([signedBytes], { type: "application/pdf" }));
    const uploadData = new FormData();
    uploadData.append("file", new File([signedBytes], "signed.pdf", { type: "application/pdf" }));
    const saved = await fetch(`/api/acceptance-forms/${encodeURIComponent(params.token)}/sign`, { method: "POST", body: uploadData });
    if (!saved.ok) throw new Error((await saved.json()).error || "保存签字失败");
    setFinalImage(signedUrl);
    setStatus("signed");
    setShowSignature(false);
    setView("done");
  }
  async function downloadPdf() {
    const downloadUrl = finalImage || pdfUrl;
    if (!downloadUrl) return; setIsDownloading(true);
    try { const link = document.createElement("a"); link.href = downloadUrl; link.download = "项目完工验收单-已签字.pdf"; document.body.appendChild(link); link.click(); link.remove(); } finally { setIsDownloading(false); }
  }
  function reset() { if (finalImage) URL.revokeObjectURL(finalImage); setView("document"); setShowSignature(false); setHasSignature(false); setFinalImage(null); }

  if (status === "loading") return <main className="sign-demo-page"><section className="sign-phone-screen"><div className="sign-loading-state">正在读取验收单…</div></section></main>;
  if (status === "error") return <main className="sign-demo-page"><section className="sign-phone-screen"><div className="sign-loading-state">{loadError}</div></section></main>;
  const signedView = status === "signed" || view === "done";
  return <main className="sign-demo-page"><section className="sign-phone-screen">
    {!signedView ? <div className="sign-document-view"><header className="sign-document-topbar"><span className="sign-demo-eyebrow">PROJECT COMPLETION</span><h1>项目完工验收单</h1></header><div className="sign-document-scroll"><div className="sign-document-frame"><iframe className="sign-pdf-preview" src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`} title="完工验收单2026" /></div></div><div className="sign-bottom-cta"><button className="sign-demo-primary" type="button" onClick={() => setShowSignature(true)}><PenLine size={17} /> 点击签名</button></div></div> : <div className="sign-done-view"><div className="sign-done-top"><div className="sign-done-badge"><Check size={25} strokeWidth={3} /></div><h1>签字完成</h1><p>{status === "signed" ? "该验收单已完成签署" : "签名与时间已自动添加到验收单底部"}</p><span className="sign-complete-pill">✓ 已完成</span></div><div className="sign-document-scroll sign-done-scroll"><div className="sign-document-frame"><iframe className="sign-pdf-preview" src={`${finalImage || pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`} title="已签字验收单" /></div></div><div className="sign-bottom-cta sign-done-cta"><button className="sign-demo-primary" type="button" onClick={downloadPdf} disabled={isDownloading}><Download size={17} /> {isDownloading ? "生成中…" : "下载已签字版本"}</button>{status !== "signed" && <button className="sign-reset-button" type="button" onClick={reset}><RotateCcw size={13} /> 重新体验一次</button>}</div></div>}
    {showSignature && <div className="sign-sheet-backdrop" role="presentation" onClick={() => setShowSignature(false)}><section className="sign-sheet" role="dialog" aria-modal="true" aria-labelledby="sign-sheet-title" onClick={(event) => event.stopPropagation()}><div className="sign-sheet-head"><h2 id="sign-sheet-title">请在下方签字</h2><button className="sign-close-button" type="button" aria-label="关闭签名窗口" onClick={() => setShowSignature(false)}><X size={20} /></button></div><p className="sign-sheet-hint">签名会自动贴到验收单底部“门店签字”处，并自动盖上签署时间</p><div className="sign-pad-wrap" ref={wrapRef}><canvas ref={padRef} className="sign-pad-canvas" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} /><div className="sign-pad-baseline" /></div><div className="sign-sheet-actions"><button className="sign-sheet-secondary" type="button" onClick={clearPad}>清除重签</button><button className="sign-demo-primary" type="button" onClick={confirmSign} disabled={!hasSignature}>确认签字</button></div></section></div>}
  </section></main>;
}