"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import OrderTracker from "./components/OrderTracker";

export default function Home() {
  // undefined = 还没查完，null = 确定没登录，object = 已登录
  const [session, setSession] = useState(undefined);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === null) router.push("/login");
  }, [session, router]);

  if (session === undefined) {
    return <div style={{ padding: 40, color: "#4C6169", fontSize: 13 }}>加载中…</div>;
  }
  if (!session) return null;

  return (
    <OrderTracker
      userEmail={session.user.email}
      onSignOut={() => supabase.auth.signOut()}
    />
  );
}
