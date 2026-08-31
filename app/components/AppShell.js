"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import Sidebar from "./Sidebar";

export default function AppShell({ active, children }) {
  const [session, setSession] = useState(undefined);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
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
    <div style={{ display: "flex", minHeight: "100vh", background: "#EEF2F1" }}>
      <Sidebar active={active} userEmail={session.user.email} onSignOut={() => supabase.auth.signOut()} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {typeof children === "function" ? children(session.user.email) : children}
      </div>
    </div>
  );
}
