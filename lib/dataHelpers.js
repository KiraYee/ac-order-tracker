// 各页面共用的常量、数据库字段映射、小工具函数

export const STATUSES = ["待核实", "待派工", "待上门", "维修中", "已完成", "已取消"];
export const OPEN_STATUSES = ["待核实", "待派工", "待上门", "维修中"];

export const WORK_ORDER_VISIBLE_STATUSES = ["待上门", "维修中", "已完成"];
export const WORK_ORDER_STATUSES = ["待办理", "办理中", "已办妥"];

export const CITY_OPTIONS = ["上海", "苏州"];
export const SKILL_PRESETS = ["空调工", "电工"];

export const INSURANCE_TYPES = [
  { key: "public", label: "公众责任险" },
  { key: "accident", label: "意外险" },
];

export const STATUS_STYLE = {
  "待核实": { bg: "#FBF2D9", fg: "#8A6A0F", dot: "#C99A1D" },
  "待派工": { bg: "#EFEAF8", fg: "#5B4B8A", dot: "#7A63B8" },
  "待上门": { bg: "#FFFFFF", fg: "#14212B", dot: "#1B6E76" },
  "维修中": { bg: "#E7F1FB", fg: "#1D6FBF", dot: "#2B84D9" },
  "已完成": { bg: "#E9F4EC", fg: "#2F7A4F", dot: "#2F7A4F" },
  "已取消": { bg: "#F3EAEA", fg: "#8A5252", dot: "#8A5252" },
};

export const RESULT_TYPES = [
  { key: "scheduled", label: "计划中", color: "#7B8794" },
  { key: "resolved", label: "已修复", color: "#3E8F63" },
  { key: "need_part", label: "需配件/等货", color: "#E08E33" },
  { key: "need_official", label: "需联系官方售后", color: "#1F7A8C" },
  { key: "need_switch_master", label: "需更换师傅", color: "#C1443D" },
  { key: "other", label: "其他", color: "#4C6169" },
];

export function resultMeta(key) {
  return RESULT_TYPES.find((r) => r.key === key) || RESULT_TYPES.find((r) => r.key === "other") || RESULT_TYPES[RESULT_TYPES.length - 1];
}

export function insuranceLabel(type) {
  return INSURANCE_TYPES.find((t) => t.key === type)?.label || "—";
}

export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

export function fmtDateShort(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export function daysSince(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

export function ticketNoFromReportTime(reportTime, existingTicketNos = []) {
  const date = new Date(reportTime);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const base = `KT${safeDate.getFullYear()}${String(safeDate.getMonth() + 1).padStart(2, "0")}${String(
    safeDate.getDate()
  ).padStart(2, "0")}${String(safeDate.getHours()).padStart(2, "0")}${String(safeDate.getMinutes()).padStart(2, "0")}`;
  const existing = new Set(existingTicketNos.filter(Boolean));
  if (!existing.has(base)) return base;
  let suffix = 1;
  while (existing.has(`${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
}

export function lineCharge(it) {
  return (Number(it.qty) || 0) * (Number(it.chargeUnit) || 0);
}
export function lineCost(it) {
  return (Number(it.qty) || 0) * (Number(it.costUnit) || 0);
}

export function itemsChargeTotal(items) {
  return (items || []).reduce((s, it) => s + lineCharge(it), 0);
}
export function itemsCostTotal(items) {
  return (items || []).reduce((s, it) => s + lineCost(it), 0);
}

export function costItemQty(item) {
  if (!item) return 1;
  if (item.qty === undefined || item.qty === null || item.qty === "") return 1;
  const qty = Number(item.qty);
  return Number.isFinite(qty) ? qty : 0;
}

export function costItemUnitPrice(item) {
  if (!item) return 0;
  if (item.unitPrice !== undefined && item.unitPrice !== null && item.unitPrice !== "") {
    return Number(item.unitPrice) || 0;
  }
  return Number(item.amount) || 0;
}

export function costItemAmount(item) {
  if (!item) return 0;
  if (item.qty !== undefined || item.unitPrice !== undefined) {
    return costItemQty(item) * costItemUnitPrice(item);
  }
  return Number(item.amount) || 0;
}

function legacyItemsTotal(items) {
  return (items || []).reduce((s, it) => s + costItemAmount(it), 0);
}

export function visitChargeTotal(v) {
  return legacyItemsTotal(v.chargeItems);
}
export function visitCostTotal(v) {
  if (Array.isArray(v.expenseRecords) && v.expenseRecords.length > 0) {
    return v.expenseRecords.reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
  }
  return legacyItemsTotal(v.costItems);
}

export function visitTechnicianCostTotal(v) {
  if (Array.isArray(v.expenseRecords) && v.expenseRecords.length > 0) {
    return v.expenseRecords
      .filter((record) => record.type === "technician_fee")
      .reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
  }
  return legacyItemsTotal(v.costItems);
}

export function orderVisitCostTotal(o) {
  const records = new Map();
  for (const record of o?.expenseRecords || []) records.set(record.id, record);
  for (const visit of o?.visits || []) {
    for (const record of visit.expenseRecords || []) records.set(record.id, record);
  }
  if (records.size > 0) {
    return Array.from(records.values()).reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
  }
  return (o?.visits || []).reduce((sum, visit) => sum + visitCostTotal(visit), 0);
}

export function orderTechnicianCostTotal(o) {
  const records = new Map();
  for (const record of o?.expenseRecords || []) records.set(record.id, record);
  for (const visit of o?.visits || []) {
    for (const record of visit.expenseRecords || []) records.set(record.id, record);
  }
  if (records.size > 0) {
    return Array.from(records.values())
      .filter((record) => record.type === "technician_fee")
      .reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
  }
  return (o?.visits || []).reduce((sum, visit) => sum + visitTechnicianCostTotal(visit), 0);
}

export function orderTechnicianUnpaidCostTotal(o) {
  const records = new Map();
  for (const record of o?.expenseRecords || []) records.set(record.id, record);
  for (const visit of o?.visits || []) {
    for (const record of visit.expenseRecords || []) records.set(record.id, record);
  }
  return Array.from(records.values())
    .filter((record) => record.type === "technician_fee" && record.isSettled === false)
    .reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
}

export function orderTechnicianFeeBreakdown(order, technicians = []) {
  const technicianById = new Map((technicians || []).map((technician) => [technician.id, technician]));
  const visitById = new Map((order?.visits || []).map((visit) => [visit.id, visit]));
  const records = new Map();
  for (const record of order?.expenseRecords || []) records.set(record.id, { record, visit: visitById.get(record.visitId) });
  for (const visit of order?.visits || []) {
    for (const record of visit.expenseRecords || []) records.set(record.id, { record, visit });
  }

  const grouped = new Map();
  for (const entry of records.values()) {
    const { record, visit } = entry;
    if (record.type !== "technician_fee") continue;
    const name = technicianById.get(record.technicianId || visit?.technicianId)?.name || (visit?.master || "").trim() || "未指定师傅";
    const current = grouped.get(name) || { name, amount: 0, settled: true, hasUnsettledAdvance: false, hasUnsettledMonthly: false };
    current.amount += Number(record.amount) || 0;
    current.settled = current.settled && record.isSettled === true;
    if (record.isSettled !== true) {
      if (record.paymentMethod === "advance") current.hasUnsettledAdvance = true;
      else current.hasUnsettledMonthly = true;
    }
    grouped.set(name, current);
  }
  return Array.from(grouped.values()).map((fee) => ({
    ...fee,
    paymentMethod: fee.settled ? null : fee.hasUnsettledAdvance ? "advance" : "monthly_settlement",
  }));
}

export function orderTechnicianFeeRecords(order, technicians = []) {
  const technicianById = new Map((technicians || []).map((technician) => [technician.id, technician]));
  const visits = order?.visits || [];
  const visitById = new Map(visits.map((visit, index) => [visit.id, { visit, number: index + 1 }]));
  const records = new Map();
  for (const record of order?.expenseRecords || []) {
    records.set(record.id, { record, visitInfo: visitById.get(record.visitId) || null });
  }
  for (const [index, visit] of visits.entries()) {
    for (const record of visit.expenseRecords || []) {
      records.set(record.id, { record, visitInfo: { visit, number: index + 1 } });
    }
  }

  return Array.from(records.values())
    .filter(({ record }) => record.type === "technician_fee")
    .map(({ record, visitInfo }) => ({
      ...record,
      technicianId: record.technicianId || visitInfo?.visit?.technicianId || null,
      technicianName: technicianById.get(record.technicianId || visitInfo?.visit?.technicianId)?.name
        || (visitInfo?.visit?.master || "").trim()
        || "未指定师傅",
      visitNumber: visitInfo?.number || null,
      visitTime: visitInfo?.visit?.visitTime || null,
    }));
}

export function technicianFeeStatusColor(fee) {
  if (fee?.settled === true) return "#2F7A4F";
  return fee?.paymentMethod === "advance" ? "#B5450C" : "#718087";
}

export function orderTechnicianFeeStatusColor(order) {
  const fees = orderTechnicianFeeBreakdown(order);
  if (fees.some((fee) => fee.paymentMethod === "advance")) return "#B5450C";
  if (fees.some((fee) => fee.settled !== true)) return "#718087";
  return fees.length > 0 ? "#2F7A4F" : "#718087";
}

// 旧数据：上门记录里分开的报价/成本，按项目名尽量合成一行
export function synthesizeQuoteItemsFromVisits(visits) {
  const map = new Map();
  for (const v of visits || []) {
    for (const it of v.chargeItems || []) {
      const label = (it.label || "").trim() || "未命名";
      const cur = map.get(label) || { label, qty: 1, chargeUnit: 0, costUnit: 0 };
      cur.chargeUnit = Number(it.amount) || 0;
      map.set(label, cur);
    }
    for (const it of v.costItems || []) {
      const label = (it.label || "").trim() || "未命名";
      const cur = map.get(label) || { label, qty: 1, chargeUnit: 0, costUnit: 0 };
      cur.costUnit = Number(it.amount) || 0;
      map.set(label, cur);
    }
  }
  return Array.from(map.values());
}

export function orderQuoteItems(o) {
  if (Array.isArray(o.quoteItems)) {
    return o.quoteItems;
  }
  return synthesizeQuoteItemsFromVisits(o.visits);
}

export function orderChargeTotal(o) {
  return itemsChargeTotal(orderQuoteItems(o));
}
export function orderCostTotal(o) {
  return orderVisitCostTotal(o);
}
export function orderProfit(o) {
  return orderChargeTotal(o) - orderCostTotal(o);
}

export function sortOrdersForDashboard(orders) {
  const finishedStatuses = new Set(["已完成", "已取消"]);
  const timeValue = (iso) => {
    const value = iso ? new Date(iso).getTime() : 0;
    return Number.isNaN(value) ? 0 : value;
  };
  return [...(orders || [])].sort((a, b) => {
    const aFinished = finishedStatuses.has(a.status);
    const bFinished = finishedStatuses.has(b.status);
    if (aFinished !== bFinished) return aFinished ? 1 : -1;
    const aTime = timeValue(a.reportTime);
    const bTime = timeValue(b.reportTime);
    return bTime - aTime;
  });
}

export const WORKLIST_GROUPS = [
  { key: "verify", title: "待核实", statuses: ["待核实"] },
  { key: "dispatch", title: "待派工", statuses: ["待派工"] },
  { key: "wait", title: "已指派师傅 · 时间待定", statuses: ["待上门"], matches: (o) => !!o.assignedTechnicianId && !o.expectedVisitTime },
  { key: "scheduled", title: "待上门", statuses: ["待上门"], matches: (o) => !!o.expectedVisitTime },
  { key: "progress", title: "维修中", statuses: ["维修中"] },
  { key: "closed", title: "已完成 / 已取消", statuses: ["已完成", "已取消"] },
];

export function getWorklistGroup(order) {
  return WORKLIST_GROUPS.find((group) => group.statuses.includes(order.status) && (!group.matches || group.matches(order))) || null;
}

export function isOverdueBy(iso, now = Date.now(), thresholdMs = 48 * 60 * 60 * 1000) {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return !Number.isNaN(time) && now - time > thresholdMs;
}

export function getOrderTimeoutReminders(order, now = Date.now()) {
  const hasVisits = Array.isArray(order?.visits) && order.visits.length > 0;
  const expectedTime = order?.expectedVisitTime ? new Date(order.expectedVisitTime).getTime() : null;
  const expectedValid = expectedTime !== null && !Number.isNaN(expectedTime);
  const inspectionMaterialsMissing = !order?.inspectionPhotoUrl?.trim() && !order?.comparePhotoUrl?.trim();
  return {
    assignmentOverdue: order?.status === "待派工" && !order?.assignedTechnicianId && isOverdueBy(order?.reportTime, now),
    expectedVisitOverdue: order?.status === "待上门" && !hasVisits && expectedValid && now >= expectedTime,
    inProgressOverdue: order?.status === "维修中" && isOverdueBy(order?.inProgressAt, now, 7 * 24 * 60 * 60 * 1000),
    inspectionMaterialsMissing: order?.status === "已完成" && inspectionMaterialsMissing,
  };
}

export function getOrderExceptions(order, now = Date.now()) {
  const reminders = getOrderTimeoutReminders(order, now);
  return [
    reminders.assignmentOverdue ? "超过2天未安排师傅" : null,
    reminders.expectedVisitOverdue ? "已超过预计上门时间未上门" : null,
    reminders.inProgressOverdue ? "维修中超1周未解决" : null,
    reminders.inspectionMaterialsMissing ? "已完工未提交验收资料" : null,
  ].filter(Boolean);
}

export function getFinanceSummary(orders = [], advances = []) {
  const receivables = orders.filter((order) => orderChargeTotal(order) > 0);
  const pendingReceivables = receivables.filter((order) => !order.clientSettled);
  const unpaidTechnicianOrders = orders.filter((order) => orderTechnicianUnpaidCostTotal(order) > 0);
  const pendingAdvances = advances.filter((advance) => !advance.reimbursed);
  return {
    receivableTotal: pendingReceivables.reduce((sum, order) => sum + orderChargeTotal(order), 0),
    receivableCount: pendingReceivables.length,
    technicianUnpaidTotal: unpaidTechnicianOrders.reduce((sum, order) => sum + orderTechnicianUnpaidCostTotal(order), 0),
    pendingAdvanceTotal: pendingAdvances.reduce((sum, advance) => sum + (Number(advance.amount) || 0), 0),
    pendingAdvanceCount: pendingAdvances.length,
    profitTotal: orders.reduce((sum, order) => sum + orderProfit(order), 0),
  };
}

export function countByCity(rows = [], getCity = (row) => row.city) {
  const counts = new Map();
  rows.forEach((row) => {
    const city = getCity(row) || "未分类";
    counts.set(city, (counts.get(city) || 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"));
}

export function isInRange(iso, range) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  if (range === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    return d >= start;
  }
  if (range === "month") {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  if (range === "year") {
    return d.getFullYear() === now.getFullYear();
  }
  return true;
}

export const RANGE_LABELS = { week: "本周", month: "本月", year: "本年" };

export function computeTechnicianStats(technicians, orders) {
  return technicians.map((t) => {
    let completedOrderIds = new Set();
    let totalEarned = 0;
    let totalUnpaid = 0;
    let visitCount = 0;
    for (const o of orders) {
      for (const v of o.visits || []) {
        if (v.technicianId === t.id) {
          visitCount++;
          if (o.status === "已完成") completedOrderIds.add(o.id);
        }
      }
      for (const v of o.visits || []) {
        if (v.technicianId === t.id) {
          const cost = visitTechnicianCostTotal(v);
          totalEarned += cost;
          if (!o.technicianSettled) totalUnpaid += cost;
        }
      }
    }
    return {
      ...t,
      completedCount: completedOrderIds.size,
      visitCount,
      totalEarned,
      totalUnpaid,
    };
  });
}

export function groupByCity(technicianStats) {
  const map = new Map();
  for (const t of technicianStats) {
    const city = t.city || "未分类";
    if (!map.has(city)) map.set(city, []);
    map.get(city).push(t);
  }
  return Array.from(map.entries())
    .map(([city, list]) => ({ city, technicians: list.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => b.technicians.length - a.technicians.length);
}

export function orderFromDb(row) {
  return {
    id: row.id,
    ticketNo: row.ticket_no,
    city: row.city,
    mall: row.mall,
    brand: row.brand,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    issueDesc: row.issue_desc,
    address: row.address,
    notes: row.notes,
    reportTime: row.report_time,
    pendingAssignmentAt: row.pending_assignment_at,
    pendingVisitAt: row.pending_visit_at,
    inProgressAt: row.in_progress_at,
    expectedVisitTime: row.expected_visit_time,
    completedAt: row.completed_at,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    relatedOrderId: row.related_order_id,
    storeId: row.store_id,
    assignedTechnicianId: row.assigned_technician_id,
    clientId: row.client_id,
    followerId: row.follower_id,
    insuranceEnabled: row.insurance_enabled,
    insuranceType: row.insurance_type,
    insuranceAmount: row.insurance_amount,
    needWorkOrder: row.need_work_order,
    workOrderStatus: row.work_order_status,
    inspectionPhotoUrl: row.inspection_photo_url,
    comparePhotoUrl: row.compare_photo_url,
    quoteItems: row.quote_items || [],
    quoteUpdatedAt: row.quote_updated_at,
    quoteUpdatedBy: row.quote_updated_by,
    quoteNote: row.quote_note,
    technicianSettled: row.technician_settled,
    technicianSettledAt: row.technician_settled_at,
    clientSettled: row.client_settled,
    clientSettledAt: row.client_settled_at,
    expenseRecords: (row.expense_records || []).map(expenseRecordFromDb),
    visits: (row.visits || [])
      .map(visitFromDb)
      .sort((a, b) => new Date(a.visitTime) - new Date(b.visitTime)),
  };
}

export function orderStoreDisplay(order) {
  const store = order?.store || null;
  return {
    city: store?.city || order?.city || "",
    brand: store?.brand || order?.brand || "",
    mall: store?.mall || order?.mall || "",
    storeName: store?.store_name || "",
    address: store?.address || order?.address || "",
    contactName: store?.contact_name || order?.contactName || "",
    contactPhone: store?.contact_phone || order?.contactPhone || "",
  };
}

export function storeIdentity(city, brand, mall, storeName) {
  return [city, brand, mall, storeName].map((value) => (value || "").trim()).join("|");
}

export function generateStoreName(city, brand, mall) {
  return `${brand}（${city}${mall}）`;
}

export function storeNameWithoutCity(storeName, city) {
  return storeName.replace(`（${city}`, "（");
}

export function visitFromDb(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    visitTime: row.visit_time,
    serviceType: row.service_type,
    serviceContent: row.service_content,
    master: row.master,
    masterPhone: row.master_phone,
    technicianId: row.technician_id,
    resultType: row.result_type,
    note: row.note,
    chargeItems: row.charge_items || [],
    costItems: row.cost_items || [],
    expenseRecords: (row.expense_records || []).map(expenseRecordFromDb),
    technicianPaid: row.technician_paid,
    technicianPaidAt: row.technician_paid_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function expenseRecordFromDb(row) {
  return {
    id: row.id,
    visitId: row.visit_id,
    orderId: row.order_id,
    technicianId: row.technician_id,
    type: row.type,
    label: row.label,
    qty: row.qty,
    unitPrice: row.unit_price,
    amount: row.amount,
    paymentMethod: row.payment_method,
    payerName: row.payer_name,
    isSettled: row.is_settled,
    settledAt: row.settled_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function orderToDbPatch(data) {
  const patch = {};
  if ("city" in data) patch.city = data.city || null;
  if ("mall" in data) patch.mall = data.mall;
  if ("brand" in data) patch.brand = data.brand || null;
  if ("contactName" in data) patch.contact_name = data.contactName || null;
  if ("contactPhone" in data) patch.contact_phone = data.contactPhone || null;
  if ("issueDesc" in data) patch.issue_desc = data.issueDesc;
  if ("address" in data) patch.address = data.address || null;
  if ("notes" in data) patch.notes = data.notes || null;
  if ("reportTime" in data) patch.report_time = data.reportTime || null;
  if ("expectedVisitTime" in data) patch.expected_visit_time = data.expectedVisitTime || null;
  if ("completedAt" in data) patch.completed_at = data.completedAt || null;
  if ("relatedOrderId" in data) patch.related_order_id = data.relatedOrderId || null;
  if ("assignedTechnicianId" in data) patch.assigned_technician_id = data.assignedTechnicianId || null;
  if ("clientId" in data) patch.client_id = data.clientId || null;
  if ("followerId" in data) patch.follower_id = data.followerId || null;
  if ("insuranceEnabled" in data) patch.insurance_enabled = !!data.insuranceEnabled;
  if ("insuranceType" in data) patch.insurance_type = data.insuranceType || null;
  if ("insuranceAmount" in data) patch.insurance_amount = data.insuranceAmount ?? null;
  if ("needWorkOrder" in data) patch.need_work_order = !!data.needWorkOrder;
  if ("workOrderStatus" in data) patch.work_order_status = data.workOrderStatus || null;
  if ("inspectionPhotoUrl" in data) patch.inspection_photo_url = data.inspectionPhotoUrl || null;
  if ("comparePhotoUrl" in data) patch.compare_photo_url = data.comparePhotoUrl || null;
  if ("quoteItems" in data) patch.quote_items = data.quoteItems || [];
  if ("quoteUpdatedAt" in data) patch.quote_updated_at = data.quoteUpdatedAt;
  if ("quoteUpdatedBy" in data) patch.quote_updated_by = data.quoteUpdatedBy;
  if ("quoteNote" in data) patch.quote_note = data.quoteNote || null;
  if ("technicianSettled" in data) patch.technician_settled = !!data.technicianSettled;
  if ("technicianSettledAt" in data) patch.technician_settled_at = data.technicianSettledAt;
  if ("clientSettled" in data) patch.client_settled = !!data.clientSettled;
  if ("clientSettledAt" in data) patch.client_settled_at = data.clientSettledAt;
  if ("status" in data) patch.status = data.status;
  if ("pendingAssignmentAt" in data) patch.pending_assignment_at = data.pendingAssignmentAt || null;
  if ("pendingVisitAt" in data) patch.pending_visit_at = data.pendingVisitAt || null;
  if ("inProgressAt" in data) patch.in_progress_at = data.inProgressAt || null;
  patch.updated_at = new Date().toISOString();
  return patch;
}

// 按项目名模糊匹配历史报价：同一行同时给出甲方单价和师傅单价
export function searchPriceHistory(orders, keyword, limit = 5) {
  const kw = (keyword || "").trim();
  if (!kw) return [];
  const results = [];
  for (const o of orders) {
    for (const it of orderQuoteItems(o)) {
      if (it.label && it.label.includes(kw)) {
        results.push({
          label: it.label,
          qty: it.qty,
          chargeUnit: it.chargeUnit,
          costUnit: it.costUnit,
          date: o.quoteUpdatedAt || o.updatedAt,
          city: o.city || "",
          mall: o.mall,
        });
      }
    }
  }
  results.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return results.slice(0, limit);
}
