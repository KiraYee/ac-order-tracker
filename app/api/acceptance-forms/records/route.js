import { NextResponse } from "next/server";
import { createAdminClient, requireStaff } from "../../../../lib/supabaseServer";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    await requireStaff(request);
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("acceptance_forms")
      .select(`
        id,
        token,
        status,
        signed_at,
        created_at,
        order_id,
        orders (
          completed_at,
          stores ( store_name )
        )
      `)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ records: data || [] });
  } catch (error) {
    const status = error.message === "未登录" || error.message === "登录已失效" ? 401 : 500;
    return NextResponse.json({ error: error.message || "读取验收单记录失败" }, { status });
  }
}