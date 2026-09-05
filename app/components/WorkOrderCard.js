"use client";

import { Clock, MapPin, Users } from "lucide-react";
import { STATUS_STYLE, fmtDate, orderStoreDisplay, orderTechnicianFeeBreakdown, technicianFeeStatusColor } from "../../lib/dataHelpers";
import OrderTimeoutNotice from "./OrderTimeoutNotice";

function isUrgentVisit(order, now = Date.now()) {
  if (!order.expectedVisitTime) return false;
  const time = new Date(order.expectedVisitTime).getTime();
  return !Number.isNaN(time) && time - now <= 24 * 60 * 60 * 1000;
}

export default function WorkOrderCard({
  order,
  technicians = [],
  clients = [],
  now = Date.now(),
  variant = "worklist",
  groupKey,
  onClick,
  onAction,
}) {
  const display = orderStoreDisplay(order);
  const technician = technicians.find((item) => item.id === order.assignedTechnicianId);
  const client = clients.find((item) => item.id === order.clientId);
  const urgent = groupKey === "scheduled" && isUrgentVisit(order, now);
  const visualKey = urgent ? "urgent" : groupKey;
  const style = visualKey === "wait"
    ? { dot: "#B7BEC2", fg: "#9AA6AD" }
    : visualKey === "urgent"
      ? { dot: "#D9631F", fg: "#B5450C" }
      : STATUS_STYLE[order.status] || { dot: "#9AA6AD", fg: "#5E6C76" };
  const action = variant === "worklist" && ["verify", "dispatch", "wait"].includes(groupKey);
  const actionLabel = groupKey === "verify"
    ? "核实并派单"
    : groupKey === "dispatch"
      ? "指派师傅"
      : "登记上门时间";
  const technicianFees = orderTechnicianFeeBreakdown(order, technicians);

  return (
    <article
      className="work-order-card card-hover"
      style={styles.card}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event) => {
        if (onClick && (event.key === "Enter" || event.key === " ")) onClick();
      }}
    >
      <div style={styles.markerColumn}><span className={order.status === "维修中" ? "work-order-live-marker" : ""} style={{ ...styles.marker, background: style.dot }} /></div>
      <div style={styles.body}>
        <div style={styles.topLine}>
          <div style={styles.locationLine}>
            <span style={styles.ticketNo}>{order.ticketNo || "未编号"}</span>
            <span style={styles.title}>
              {display.city ? `${display.city} · ` : ""}{display.brand || "未填写品牌方"} · {display.mall || "未填写商场"}
            </span>
          </div>
          <div style={styles.topRight}>
            <OrderTimeoutNotice order={order} now={now} />
            {groupKey === "closed" ? <span style={{ ...styles.statusLabel, ...(order.status === "已取消" ? styles.cancelledLabel : styles.completedLabel) }}>{order.status}</span> : null}
            {action ? <button type="button" style={{ ...styles.action, background: groupKey === "verify" ? "#C99A1D" : groupKey === "dispatch" ? "#7A63B8" : "#6B7B83" }} onClick={(event) => { event.stopPropagation(); (onAction || onClick)?.(); }}>{actionLabel}</button> : (
              <div style={{ ...styles.when, color: style.fg }}>
                {order.status === "维修中" ? <span className="work-order-live-dot" /> : null}
                {groupKey === "scheduled" ? <strong>{fmtDate(order.expectedVisitTime)}</strong> : null}
                {groupKey === "progress" || (!groupKey && variant === "dashboard") ? <strong>{order.status === "维修中" ? "处理中" : order.status}</strong> : null}
              </div>
            )}
          </div>
        </div>
        {display.address ? <div style={styles.address}><MapPin size={12} />{display.address}</div> : null}
        <div style={styles.description}>{order.issueDesc || "未填写故障描述"}</div>
        <div style={styles.meta}>
          <span><Clock size={12} />报修 {fmtDate(order.reportTime)}</span>
          {client ? <span>甲方 <b>{client.name}</b></span> : null}
          {technicianFees.length > 0 ? technicianFees.map((fee) => (
            <span key={fee.name} style={{ color: technicianFeeStatusColor(fee) }}>
              <Users size={12} /> {fee.name} ¥{fee.amount} {fee.settled ? "已结算" : "未结算"}
            </span>
          )) : <span><Users size={12} />师傅 <b>{technician?.name || "未指派"}</b></span>}
        </div>
      </div>
    </article>
  );
}

const styles = {
  card: { display: "flex", alignItems: "flex-start", gap: 12, background: "#FFFFFF", border: "1px solid #E4E8EA", borderRadius: 10, padding: "14px 16px", textAlign: "left", cursor: "pointer", position: "relative" },
  markerColumn: { width: 8, flexShrink: 0, paddingTop: 5 },
  marker: { display: "block", width: 8, height: 8, borderRadius: "50%" },
  body: { minWidth: 0, flex: 1 },
  topLine: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" },
  topRight: { display: "flex", alignItems: "flex-start", gap: 7, flexShrink: 0 },
  locationLine: { display: "flex", alignItems: "baseline", gap: 9, minWidth: 0, flexWrap: "wrap" },
  ticketNo: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: "#9AA6AD", flexShrink: 0 },
  when: { display: "flex", alignItems: "center", gap: 5, flexDirection: "column", textAlign: "right", flexShrink: 0, fontSize: 12 },
  whenTime: { color: "#9AA6AD", fontWeight: 500 },
  statusLabel: { display: "inline-flex", alignItems: "center", borderRadius: 12, padding: "3px 8px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" },
  completedLabel: { background: "#E4F3E9", color: "#2C6B45" },
  cancelledLabel: { background: "#F3EAEA", color: "#8A5252" },
  title: { fontSize: 14.5, fontWeight: 600, lineHeight: 1.4, color: "#14212B", minWidth: 0 },
  address: { display: "flex", alignItems: "center", gap: 4, color: "#5E6C76", fontSize: 11.5, marginTop: 4 },
  description: { color: "#5E6C76", fontSize: 13, lineHeight: 1.5, marginTop: 4, whiteSpace: "pre-wrap" },
  meta: { display: "flex", flexWrap: "wrap", gap: "6px 14px", color: "#9AA6AD", fontSize: 11.5, marginTop: 9 },
  action: { border: 0, color: "#fff", borderRadius: 6, padding: "6px 10px", fontSize: 11.5, fontWeight: 600, flexShrink: 0, cursor: "pointer", whiteSpace: "nowrap" },
};