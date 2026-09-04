"use client";

import Link from "next/link";
import { AlertTriangle, Ban, ChevronRight, UserRound } from "lucide-react";

function exceptionMeta(type) {
  if (type.includes("验收资料")) {
    return { label: "未提交验收资料", tone: "mid", Icon: Ban };
  }
  if (type.includes("安排师傅")) {
    return { label: "超2天未安排师傅", tone: "high", Icon: UserRound };
  }
  if (type.includes("维修中")) {
    return { label: "维修中超1周未解决", tone: "high", Icon: AlertTriangle };
  }
  return { label: "超预计上门未上门", tone: "high", Icon: AlertTriangle };
}

export default function OverviewAnomalyList({ items = [] }) {
  return (
    <section className="overview-section">
      <div className="overview-section-head">
        <h2>异常事项</h2>
        <span className="overview-section-count mono">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="overview-empty"><span>暂无待处理异常</span></div>
      ) : (
        <div className="overview-anomaly-list">
          {items.flatMap((item) => item.types.map((type) => {
            const { label, tone, Icon } = exceptionMeta(type);
            return (
              <Link key={`${item.order.id}-${type}`} href={`/orders?open=${item.order.id}`} className="overview-anomaly-row">
                <span className={`overview-anomaly-icon ${tone}`}><Icon size={16} /></span>
                <span className="overview-anomaly-id mono">{item.order.ticketNo || "未编号"}</span>
                <span className="overview-anomaly-title">{item.location}</span>
                <span className={`overview-anomaly-status ${tone}`}>{label}</span>
                <ChevronRight className="overview-anomaly-arrow" size={14} />
              </Link>
            );
          }))}
        </div>
      )}
    </section>
  );
}