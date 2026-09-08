import { NextResponse } from "next/server";
import { createAdminClient, requireStaff } from "../../../../../lib/supabaseServer";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    await requireStaff(request);
    const supabase = createAdminClient();
    const kind = new URL(request.url).searchParams.get("kind") === "signed" ? "signed" : "filled";
    const { data: form, error } = await supabase
      .from("acceptance_forms")
      .select("filled_pdf_path, signed_pdf_path, token")
      .eq("token", params.token)
      .maybeSingle();

    if (error || !form) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    const path = kind === "signed" ? form.signed_pdf_path : form.filled_pdf_path;
    if (!path) return NextResponse.json({ error: "文件不存在" }, { status: 404 });

    const file = await supabase.storage.from("acceptance-forms").download(path);
    if (file.error) return NextResponse.json({ error: file.error.message }, { status: 500 });
    return new NextResponse(file.data, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${form.token}-${kind}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const status = error.message === "未登录" || error.message === "登录已失效" ? 401 : 500;
    return NextResponse.json({ error: error.message || "下载验收单失败" }, { status });
  }
}