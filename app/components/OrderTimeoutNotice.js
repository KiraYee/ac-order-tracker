import { Clock, AlertTriangle } from "lucide-react";
import { getOrderTimeoutReminders } from "../../lib/dataHelpers";

function formatExpectedTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const dateLabel = sameDay ? "今天" : `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${dateLabel} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function OrderTimeoutNotice({ order, now = Date.now() }) {
  const hasVisits = Array.isArray(order?.visits) && order.visits.length > 0;
  const { assignmentOverdue, expectedVisitOverdue } = getOrderTimeoutReminders(order, now);
  const expectedTime = order?.expectedVisitTime ? new Date(order.expectedVisitTime).getTime() : null;
  const expectedValid = expectedTime !== null && !Number.isNaN(expectedTime);
  const expectedSoon = expectedValid && expectedTime >= now && expectedTime - now <= 60 * 60 * 1000;
  const showExpectedVisit = order?.status === "待上门" && (!expectedVisitOverdue || !hasVisits);

  return (
    <>
      {showExpectedVisit && (
        <div style={{ ...styles.expectedVisit, ...(expectedSoon ? styles.expectedVisitSoon : {}), ...(expectedVisitOverdue ? styles.expectedVisitOverdue : {}) }}>
          {expectedVisitOverdue ? <AlertTriangle size={14} /> : <Clock size={14} />}
          <span>
            {!expectedValid
              ? "⏳ 师傅未确定上门时间"
              : expectedVisitOverdue
                ? "⚠️ 已超过预计上门时间未上门"
                : expectedSoon
                  ? `即将上门 · ${formatExpectedTime(order.expectedVisitTime)}`
                  : `预计上门：${formatExpectedTime(order.expectedVisitTime)}`}
          </span>
        </div>
      )}
      {assignmentOverdue && <div style={styles.timeoutAlert}>🔴 已超过2天未指派师傅</div>}
    </>
  );
}

const styles = {
  expectedVisit: { display: "flex", alignItems: "center", gap: 6, background: "#E3F0F1", border: "1px solid #1F7A8C55", color: "#145560", borderRadius: 8, padding: "7px 9px", fontSize: 12.5, fontWeight: 700, marginTop: 2 },
  expectedVisitSoon: { background: "#FBEEDD", borderColor: "#E08E3380", color: "#A5661A" },
  expectedVisitOverdue: { background: "#F6E7E6", borderColor: "#C1443D80", color: "#A23931" },
  timeoutAlert: { color: "#A23931", background: "#F6E7E6", borderRadius: 7, padding: "5px 8px", fontSize: 11.5, fontWeight: 700 },
};