import { NextResponse } from "next/server";
import { createAdminClient, requireStaff } from "../../../../../lib/supabaseServer";

export async function PATCH(request, { params }) {
  try {
    const user = await requireStaff(request);
    const body = await request.json();
    const noAcceptanceRequired = body.noAcceptanceRequired === true;
    const reason = typeof body.noAcceptanceReason === "string" ? body.noAcceptanceReason.trim() : "";
    if (noAcceptanceRequired && !reason) {
      return NextResponse.json({ error: "请填写不需要验收单的原因" }, { status: 400 });
    }
    if (reason.length > 200) {
      return NextResponse.json({ error: "不需要验收单的原因最多填写 200 字" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, acceptance_photo_url, acceptance_signed_pdf_url")
      .eq("id", params.id)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return NextResponse.json({ error: "工单不存在" }, { status: 404 });
    if (noAcceptanceRequired && (order.acceptance_photo_url?.trim() || order.acceptance_signed_pdf_url?.trim())) {
      return NextResponse.json({ error: "该工单已有验收单照片，不能标记为不需要验收单" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const patch = {
      no_acceptance_required: noAcceptanceRequired,
      no_acceptance_reason: noAcceptanceRequired ? reason : "",
      no_acceptance_by: noAcceptanceRequired ? (user.email || user.id) : null,
      no_acceptance_at: noAcceptanceRequired ? now : null,
      updated_at: now,
    };
    const { data, error } = await supabase.from("orders").update(patch).eq("id", params.id).select().single();
    if (error) throw error;
    return NextResponse.json({ data: patch, order: data });
  } catch (error) {
    const status = error.message === "未登录" || error.message === "登录已失效" ? 401 : 500;
    return NextResponse.json({ error: error.message || "保存验收设置失败" }, { status });
  }
}