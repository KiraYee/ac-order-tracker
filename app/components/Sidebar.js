"use client";
import Link from "next/link";
import { LayoutDashboard, ClipboardList, Users, Wallet, Store, Snowflake, LogOut, User } from "lucide-react";

const NAV_ITEMS = [
  { key: "dashboard", href: "/", label: "总览", icon: LayoutDashboard },
  { key: "orders", href: "/orders", label: "工单", icon: ClipboardList },
  { key: "technicians", href: "/technicians", label: "师傅", icon: Users },
  { key: "stores", href: "/stores", label: "门店", icon: Store },
  { key: "finance", href: "/finance", label: "财务", icon: Wallet },
];

export default function Sidebar({ active, userEmail, onSignOut }) {
  return (
    <aside style={styles.wrap}>
      <div style={styles.logoRow}>
        <div style={styles.logoMark}>
          <Snowflake size={16} color="#F5F9F8" strokeWidth={2.2} />
        </div>
        <div style={styles.logoText}>空调维保台账</div>
      </div>

      <nav style={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <Link
              key={item.key}
              href={item.href}
              style={{ ...styles.navItem, ...(isActive ? styles.navItemActive : {}) }}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={styles.bottom}>
        <div style={styles.userChip}>
          <User size={13} color="#4C6169" />
          <span style={styles.userEmail}>{userEmail}</span>
        </div>
        <button style={styles.signOutBtn} onClick={onSignOut}>
          <LogOut size={13} /> 退出登录
        </button>
      </div>
    </aside>
  );
}

const styles = {
  wrap: {
    width: 200,
    flexShrink: 0,
    background: "#FFFFFF",
    borderRight: "1px solid #DDE6E4",
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    position: "sticky",
    top: 0,
    padding: "16px 12px",
  },
  logoRow: { display: "flex", alignItems: "center", gap: 8, padding: "4px 8px 20px" },
  logoMark: {
    width: 28,
    height: 28,
    borderRadius: 8,
    background: "linear-gradient(135deg, #1F7A8C, #145560)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  logoText: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13.5, lineHeight: 1.2 },
  nav: { display: "flex", flexDirection: "column", gap: 2, flex: 1 },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "9px 10px",
    borderRadius: 8,
    fontSize: 13.5,
    fontWeight: 600,
    color: "#4C6169",
    textDecoration: "none",
  },
  navItemActive: { background: "#E3F0F1", color: "#145560" },
  bottom: { borderTop: "1px solid #E2E9E8", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 },
  userChip: { display: "flex", alignItems: "center", gap: 6, padding: "0 8px", fontSize: 11.5, color: "#4C6169" },
  userEmail: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  signOutBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "none",
    border: "none",
    color: "#8FA1A8",
    fontSize: 11.5,
    padding: "6px 8px",
  },
};
