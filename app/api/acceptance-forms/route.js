import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient, requireStaff } from "../../../lib/supabaseServer";

export const runtime = "nodejs";
const MAX_FILE_SIZE = 20 * 1024 * 1024;

function makeToken() {
  return randomBytes(24).toString("base64url");
}

export async function POST(request) {
  try {
    await requireStaff(request);
    if (!(request.headers.get("content-type") || "").includes("multipart/form-data")) return NextResponse.json({ error: "请求格式必须是 multipart/form-data" }, { status: 400 });
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "请上传 PDF 文件" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "PDF 文件不能超过 20MB" }, { status: 413 });
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "只能上传 PDF 文件" }, { status: 400 });
    const header = Buffer.from(await file.slice(0, 5).arrayBuffer()).toString("ascii");
    if (header !== "%PDF-") return NextResponse.json({ error: "上传文件不是有效 PDF" }, { status: 400 });
    const supabase = createAdminClient();
    let token = makeToken();
    let path = `filled/${token}.pdf`;
    let row;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await supabase.from("acceptance_forms").insert({
        token,
        filled_pdf_path: path,
        status: "pending_signature",
      }).select("id, token, status, created_at").single();
      if (!result.error) { row = result.data; break; }
      if (result.error.code !== "23505") throw result.error;
      token = makeToken();
      path = `filled/${token}.pdf`;
    }
    if (!row) throw new Error("生成验收单 token 失败");

    const upload = await supabase.storage.from("acceptance-forms").upload(path, file, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: false,
    });
    if (upload.error) {
      await supabase.from("acceptance_forms").delete().eq("id", row.id);
      throw upload.error;
    }
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    const status = error.message === "未登录" || error.message === "登录已失效" ? 401 : 500;
    return NextResponse.json({ error: error.message || "创建验收单失败" }, { status });
  }
}