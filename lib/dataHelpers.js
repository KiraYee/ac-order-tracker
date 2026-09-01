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
  "待核实": { bg: "#EDEFEE", fg: "#4C6169", dot: "#8FA1A8" },
  "待派工": { bg: "#FBEEDD", fg: "#A5661A", dot: "#E08E33" },
  "待上门": { bg: "#E3F0F1", fg: "#145560", dot: "#1F7A8C" },
  "维修中": { bg: "#DCEEF0", fg: "#0F4650", dot: "#1F7A8C" },
  "已完成": { bg: "#E4F3E9", fg: "#2C6B45", dot: "#3E8F63" },
  "已取消": { bg: "#F6E7E6", fg: "#A23931", dot: "#C1443D" },
};

export const RESULT_TYPES = [
  { key: "resolved", label: "已修复", color: "#3E8F63" },
  { key: "need_part", label: "需配件/等货", color: "#E08E33" },
  { key: "need_official", label: "需联系官方售后", color: "#1F7A8C" },
  { key: "need_switch_master", label: "需更换师傅", color: "#C1443D" },
  { key: "other", label: "其他", color: "#4C6169" },
];

export function resultMeta(key) {
  return RESULT_TYPES.find((r) => r.key === key) || RESULT_TYPES[4];
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

function legacyItemsTotal(items) {
  return (items || []).reduce((s, it) => s + (Number(it.amount) || 0), 0);
}

export function visitChargeTotal(v) {
  return legacyItemsTotal(v.chargeItems);
}
export function visitCostTotal(v) {
  return legacyItemsTotal(v.costItems);
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
  return itemsCostTotal(orderQuoteItems(o));
}
export function orderProfit(o) {
  return orderChargeTotal(o) - orderCostTotal(o);
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
      if (o.assignedTechnicianId === t.id) {
        const cost = orderCostTotal(o);
        totalEarned += cost;
        if (!o.technicianSettled) totalUnpaid += cost;
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
    expectedVisitTime: row.expected_visit_time,
    completedAt: row.completed_at,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    relatedOrderId: row.related_order_id,
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
    technicianSettled: row.technician_settled,
    technicianSettledAt: row.technician_settled_at,
    clientSettled: row.client_settled,
    clientSettledAt: row.client_settled_at,
    visits: (row.visits || [])
      .map(visitFromDb)
      .sort((a, b) => new Date(a.visitTime) - new Date(b.visitTime)),
  };
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
    technicianPaid: row.technician_paid,
    technicianPaidAt: row.technician_paid_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
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
  if ("technicianSettled" in data) patch.technician_settled = !!data.technicianSettled;
  if ("technicianSettledAt" in data) patch.technician_settled_at = data.technicianSettledAt;
  if ("clientSettled" in data) patch.client_settled = !!data.clientSettled;
  if ("clientSettledAt" in data) patch.client_settled_at = data.clientSettledAt;
  if ("status" in data) patch.status = data.status;
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
