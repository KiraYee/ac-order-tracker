"use client";

import Link from "next/link";
import { FileText, GitBranch, TrendingUp, Wallet } from "lucide-react";

const ITEMS = [
  { key: "receivable", Icon: Wallet, label: "应收甲方", href: "/finance?tab=receivable" },
  { key: "payable", Icon: GitBranch, label: "未支付师傅款", href: "/finance?tab=payable" },
  { key: "advances", Icon: FileText, label: "待报销", href: "/finance?tab=advances" },
  { key: "profit", Icon: TrendingUp, label: "利润", href: "/finance" },
];

export default function OverviewFinanceSummary({ summary, historySummary, label, filters, setFilters }) {
  const timeParams = new URLSearchParams({ finance_range: filters.range });
  if (filters.start) timeParams.set("finance_start", filters.start);
  if (filters.end) timeParams.set("finance_end", filters.end);
  const values = {
    receivable: { amount: summary.receivableTotal, detail: `${summary.receivableCount} 单未结算` },
    payable: { amount: summary.technicianUnpaidTotal, detail: "待支付" },
    advances: { amount: summary.pendingAdvanceTotal, detail: `${summary.pendingAdvanceCount} 笔` },
    profit: { amount: summary.profitTotal, detail: "全部订单" },
  };

  return (
    <section className="overview-section">
      <div className="overview-section-head"><h2>财务简报</h2><select value={filters.range} onChange={(event) => setFilters({ range: event.target.value })}><option value="month">本月</option><option value="last_month">上月</option><option value="quarter">本季度</option><option value="year">今年</option><option value="all">全部</option><option value="custom">自定义</option></select></div>
      {filters.range === "custom" && <div><input type="date" value={filters.start} onChange={(event) => setFilters({ start: event.target.value })} /><input type="date" value={filters.end} onChange={(event) => setFilters({ end: event.target.value })} /></div>}
      <div className="overview-finance-grid">
        {ITEMS.map(({ key, Icon, label: itemLabel, href }) => (
          <Link key={key} href={`${href}${href.includes("?") ? "&" : "?"}${timeParams.toString()}`} className="overview-finance-col">
            <Icon className="overview-finance-icon" size={18} />
            <div className="overview-finance-number mono">¥{values[key].amount.toLocaleString()}</div>
            <div className="overview-finance-label">{label === "全部" ? itemLabel : `${label}${itemLabel}`} · {key === "profit" && label !== "全部" ? `${label}完工订单` : values[key].detail}</div>
          </Link>
        ))}
      </div>
      {historySummary?.count > 0 && <Link href="/finance?finance_range=all" className="overview-finance-history">历史未结算 ¥{historySummary.amount.toLocaleString()}（{historySummary.count} 单）</Link>}
    </section>
  );
}