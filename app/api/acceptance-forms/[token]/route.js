import { NextResponse } from "next/server";
import { createAdminClient, requireStaff } from "../../../../lib/supabaseServer";

export const runtime = "nodejs";

function acceptancePhotoPathFromUrl(photoUrl) {
  if (!photoUrl) return "";
  try {
    const path = decodeURIComponent(new URL(photoUrl).pathname);
    const marker = "/acceptance-photos/";
    const markerIndex = path.indexOf(marker);
    return markerIndex >= 0 ? path.slice(markerIndex + marker.length) : "";
  } catch {
    return "";
  }
}

export async function GET(request, { params }) {
  try {
    const supabase = createAdminClient();
    const { data: form, error } = await supabase.from("acceptance_forms").select("id, order_id, token, filled_pdf_path, signed_pdf_path, status, signed_at, created_at, signature_x_ratio, signature_y_ratio, signature_width_ratio").eq("token", params.token).maybeSingle();
    if (error) throw error;
    if (!form) return NextResponse.json({ error: "验收单不存在" }, { status: 404 });
    const filePath = form.status === "signed" ? form.signed_pdf_path : form.filled_pdf_path;
    const file = await supabase.storage.from("acceptance-forms").download(filePath);
    if (file.error) throw file.error;
    return new NextResponse(file.data, { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache", "X-Acceptance-Status": form.status, "X-Acceptance-Signed-At": form.signed_at || "", "X-Signature-X-Ratio": form.signature_x_ratio == null ? "" : String(form.signature_x_ratio), "X-Signature-Y-Ratio": form.signature_y_ratio == null ? "" : String(form.signature_y_ratio), "X-Signature-Width-Ratio": form.signature_width_ratio == null ? "0.34" : String(form.signature_width_ratio) } });
  } catch (error) {
    return NextResponse.json({ error: error.message || "读取验收单失败" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    await requireStaff(request);
    const supabase = createAdminClient();
    const { data: form, error: findError } = await supabase
      .from("acceptance_forms")
      .select("id, token, filled_pdf_path, signed_pdf_path, order_id, orders ( acceptance_signed_pdf_url )")
      .eq("token", params.token)
      .maybeSingle();
    if (findError) throw findError;
    if (!form) return NextResponse.json({ error: "验收单不存在" }, { status: 404 });

    const order = Array.isArray(form.orders) ? form.orders[0] : form.orders;
    const signedPhotoUrl = order?.acceptance_signed_pdf_url || "";
    const signedPhotoPath = acceptancePhotoPathFromUrl(signedPhotoUrl);
    const acceptanceFormPaths = [form.filled_pdf_path, form.signed_pdf_path].filter(Boolean);
    if (acceptanceFormPaths.length) {
      const { error: storageError } = await supabase.storage.from("acceptance-forms").remove(acceptanceFormPaths);
      if (storageError) throw storageError;
    }
    if (signedPhotoPath) {
      const { error: photoError } = await supabase.storage.from("acceptance-photos").remove([signedPhotoPath]);
      if (photoError) throw photoError;
    }

    if (signedPhotoUrl) {
      const { error: orderError } = await supabase
        .from("orders")
        .update({ acceptance_signed_pdf_url: null })
        .eq("id", form.order_id)
        .eq("acceptance_signed_pdf_url", signedPhotoUrl);
      if (orderError) throw orderError;
    }
    const { error: deleteError } = await supabase.from("acceptance_forms").delete().eq("id", form.id);
    if (deleteError) throw deleteError;
    return NextResponse.json({ deleted: true, token: form.token });
  } catch (error) {
    const status = error.message === "未登录" || error.message === "登录已失效" ? 401 : 500;
    return NextResponse.json({ error: error.message || "删除验收单失败" }, { status });
  }
}