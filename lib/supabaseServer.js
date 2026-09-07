import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function createAuthClient() {
  if (!url || !anonKey) throw new Error("缺少 Supabase 公共环境变量");
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function createAdminClient() {
  if (!url || !serviceRoleKey) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireStaff(request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) throw new Error("未登录");
  const { data, error } = await createAuthClient().auth.getUser(token);
  if (error || !data.user) throw new Error("登录已失效");
  return data.user;
}