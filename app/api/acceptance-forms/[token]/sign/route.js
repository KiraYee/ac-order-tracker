import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../../lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) return NextResponse.json({ error: "请求格式必须是 multipart/form-data" }, { status: 400 });
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "缺少签字 PDF" }, { status: 400 });
    const supabase = createAdminClient();
    const { data: current, error: findError } = await supabase.from("acceptance_forms").select("id, status").eq("token", params.token).maybeSingle();
    if (findError) throw findError;
    if (!current) return NextResponse.json({ error: "验收单不存在" }, { status: 404 });
    if (current.status !== "pending_signature") return NextResponse.json({ error: "该验收单已完成签字", status: current.status }, { status: 409 });

    const signedPath = `signed/${params.token}.pdf`;
    const signedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase.from("acceptance_forms").update({ signed_pdf_path: signedPath, status: "signed", signed_at: signedAt, updated_at: signedAt }).eq("id", current.id).eq("status", "pending_signature").select("status, signed_at").maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return NextResponse.json({ error: "该验收单已被其他设备签字", status: "signed" }, { status: 409 });
    const upload = await supabase.storage.from("acceptance-forms").upload(signedPath, file, { contentType: "application/pdf", cacheControl: "3600", upsert: false });
    if (upload.error) {
      await supabase.from("acceptance_forms").update({ signed_pdf_path: null, status: "pending_signature", signed_at: null, updated_at: new Date().toISOString() }).eq("id", current.id).eq("status", "signed").eq("signed_at", signedAt);
      throw upload.error;
    }
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: error.message || "保存签字 PDF 失败" }, { status: 500 });
  }
}