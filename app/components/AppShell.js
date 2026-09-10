"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import Sidebar, { NAV_ITEMS } from "./Sidebar";
import { Menu, X } from "lucide-react";

export default function AppShell({ active, children }) {
  const [session, setSession] = useState(undefined);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const activeItem = NAV_ITEMS.find((item) => item.key === active);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === null) router.push("/login");
  }, [session, router]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [active]);

  if (session === undefined) {
    return <div style={{ padding: 40, color: "#4C6169", fontSize: 13 }}>加载中…</div>;
  }
  if (!session) return null;

  return (
    <div className="app-shell" style={{ display: "flex", minHeight: "100vh", background: "#EEF2F1" }}>
      <Sidebar
        active={active}
        userEmail={session.user.email}
        onSignOut={() => supabase.auth.signOut()}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      <header className="mobile-header">
        <button
          type="button"
          className="mobile-menu-button"
          aria-label={mobileMenuOpen ? "关闭导航菜单" : "打开导航菜单"}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        <div className="mobile-header-title">{activeItem?.label || "空调维保台账"}</div>
      </header>
      <div style={{ flex: 1, minWidth: 0 }}>
        {typeof children === "function" ? children(session.user.email) : children}
      </div>
    </div>
  );
}
