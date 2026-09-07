import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabaseServer";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    const supabase = createAdminClient();
    const { data: form, error } = await supabase.from("acceptance_forms").select("id, token, filled_pdf_path, signed_pdf_path, status, signed_at, created_at").eq("token", params.token).maybeSingle();
    if (error) throw error;
    if (!form) return NextResponse.json({ error: "验收单不存在" }, { status: 404 });
    const filePath = form.status === "signed" ? form.signed_pdf_path : form.filled_pdf_path;
    const file = await supabase.storage.from("acceptance-forms").download(filePath);
    if (file.error) throw file.error;
    return new NextResponse(file.data, { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache", "X-Acceptance-Status": form.status, "X-Acceptance-Signed-At": form.signed_at || "" } });
  } catch (error) {
    return NextResponse.json({ error: error.message || "读取验收单失败" }, { status: 500 });
  }
}