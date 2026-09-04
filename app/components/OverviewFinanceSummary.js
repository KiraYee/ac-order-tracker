"use client";

import Link from "next/link";
import { FileText, GitBranch, Wallet } from "lucide-react";

const ITEMS = [
  { key: "receivable", Icon: Wallet, label: "应收甲方", href: "/finance?tab=receivable" },
  { key: "payable", Icon: GitBranch, label: "未支付师傅款", href: "/finance?tab=payable" },
  { key: "advances", Icon: FileText, label: "待报销", href: "/finance?tab=advances" },
];

export default function OverviewFinanceSummary({ summary }) {
  const values = {
    receivable: { amount: summary.receivableTotal, detail: `${summary.receivableCount} 单未结算` },
    payable: { amount: summary.technicianUnpaidTotal, detail: "待支付" },
    advances: { amount: summary.pendingAdvanceTotal, detail: `${summary.pendingAdvanceCount} 笔` },
  };

  return (
    <section className="overview-section">
      <div className="overview-section-head"><h2>财务简报</h2></div>
      <div className="overview-finance-grid">
        {ITEMS.map(({ key, Icon, label, href }) => (
          <Link key={key} href={href} className="overview-finance-col">
            <Icon className="overview-finance-icon" size={18} />
            <div className="overview-finance-number mono">¥{values[key].amount.toLocaleString()}</div>
            <div className="overview-finance-label">{label} · {values[key].detail}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}