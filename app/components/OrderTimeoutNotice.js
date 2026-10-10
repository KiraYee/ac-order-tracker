import { AlertTriangle } from "lucide-react";
import { getOrderTimeoutReminders } from "../../lib/dataHelpers";

export default function OrderTimeoutNotice({ order, now = Date.now() }) {
  const { assignmentOverdue, inProgressOverdue, inspectionMaterialsMissing } = getOrderTimeoutReminders(order, now);
  const noAcceptanceRequired = order?.status === "已完成" && order?.noAcceptanceRequired;
  if (!assignmentOverdue && !inProgressOverdue && !inspectionMaterialsMissing && !noAcceptanceRequired) return null;

  return <span style={styles.reminders}>
    {assignmentOverdue && <span className="work-order-reminder" style={styles.reminderAssignment} aria-label="已超过2天未安排师傅"><AlertTriangle size={12} />已超过2天未安排师傅</span>}
    {inProgressOverdue && <span className="work-order-reminder" style={styles.reminderProgress} aria-label="维修中超1周未解决"><AlertTriangle size={12} />维修中超1周未解决</span>}
    {inspectionMaterialsMissing && <span className="work-order-reminder" style={styles.reminderInspection} aria-label="已完工未提交验收资料"><AlertTriangle size={12} />已完工未提交验收资料</span>}
    {noAcceptanceRequired && <span className="work-order-reminder" style={styles.reminderNoAcceptance} title={order.noAcceptanceReason || "未填写原因"} aria-label={`无需验收单：${order.noAcceptanceReason || "未填写原因"}`}>无需验收单</span>}
  </span>;
}

const styles = {
  reminders: { display: "inline-flex", alignItems: "center", gap: 4 },
  reminderAssignment: { display: "inline-flex", alignItems: "center", gap: 4, color: "#B5450C", background: "#FBEDE4", border: "1px solid #D9631F66", borderRadius: 6, padding: "3px 6px", fontSize: 10.5, lineHeight: 1.2, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 },
  reminderProgress: { display: "inline-flex", alignItems: "center", gap: 4, color: "#B5450C", background: "#FBEDE4", border: "1px solid #D9631F66", borderRadius: 6, padding: "3px 6px", fontSize: 10.5, lineHeight: 1.2, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 },
  reminderInspection: { display: "inline-flex", alignItems: "center", gap: 4, color: "#8A5252", background: "#F3EAEA", border: "1px solid #8A525266", borderRadius: 6, padding: "3px 6px", fontSize: 10.5, lineHeight: 1.2, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 },
  reminderNoAcceptance: { display: "inline-flex", alignItems: "center", color: "#68767D", background: "#EEF1F2", border: "1px solid #C8D0D3", borderRadius: 6, padding: "3px 6px", fontSize: 10.5, lineHeight: 1.2, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0, cursor: "help" },
};