"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  Wrench, Phone, Clock, Plus, X,
  AlertTriangle, Search, Loader2, ClipboardList,
  Pencil, Link2, DollarSign, Users, Trash2, CircleDollarSign, Camera,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { pinyin } from "pinyin-pro";
import * as XLSX from "xlsx";
import { useSearchParams } from "next/navigation";
import AppShell from "../components/AppShell";
import {
  STATUSES, STATUS_STYLE, RESULT_TYPES, resultMeta, fmtDate, daysSince,
  orderFromDb, visitFromDb, expenseRecordFromDb, orderProfit,
  searchPriceHistory, orderToDbPatch, orderQuoteItems, lineCharge,
  itemsChargeTotal, visitCostTotal, orderVisitCostTotal, orderTechnicianCostTotal, costItemAmount, costItemQty, costItemUnitPrice, orderStoreDisplay, generateStoreName, getOrderTimeoutReminders,
  ticketNoFromReportTime,
} from "../../lib/dataHelpers";

function pinyinInitials(value) {
  return pinyin((value || "").trim(), { pattern: "first", toneType: "none" }).replace(/\s+/g, "").toLowerCase();
}

function toDateTimeLocal(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function formatExpectedVisitTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}::${String(date.getMinutes()).padStart(2, "0")}`.replace("::", ":");
}

function excelDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date;
}

function formatExcelDates(sheet, headers) {
  if (!sheet["!ref"]) return;
  headers.forEach((header) => {
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    let columnIndex = -1;
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      if (sheet[XLSX.utils.encode_cell({ r: 0, c: col })]?.v === header) {
        columnIndex = col;
        break;
      }
    }
    if (columnIndex < 0) return;
    for (let row = 1; row <= range.e.r; row += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: columnIndex })];
      if (cell?.v instanceof Date) {
        cell.t = "d";
        cell.z = "yyyy-mm-dd hh:mm";
      }
    }
  });
}

function filterOrdersByExportDate(orders, timeType, rangeType, customStart, customEnd, monthValue) {
  if (rangeType === "all") return orders;
  const now = new Date();
  let start;
  let end;
  if (rangeType === "today") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  } else if (rangeType === "this_week") {
    const day = now.getDay() || 7;
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  } else if (rangeType === "this_month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else if (rangeType === "last_month") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (rangeType === "this_quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    start = new Date(now.getFullYear(), quarterStartMonth, 1);
    end = new Date(now.getFullYear(), quarterStartMonth + 3, 1);
  } else if (rangeType === "this_year") {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear() + 1, 0, 1);
  } else if (rangeType === "last_7_days") {
    end = new Date(now.getTime() + 1);
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  } else if (rangeType === "month") {
    start = monthValue ? new Date(`${monthValue}-01T00:00:00`) : null;
    end = monthValue ? new Date(start.getFullYear(), start.getMonth() + 1, 1) : null;
  } else {
    start = customStart ? new Date(`${customStart}T00:00:00`) : null;
    end = customEnd ? new Date(`${customEnd}T23:59:59.999`) : null;
  }
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return orders;
  return orders.filter((order) => {
    const value = timeType === "completed"
      ? order.completedAt
      : timeType === "expected"
        ? order.expectedVisitTime
        : order.reportTime;
    if (!value) return false;
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date >= start && date <= end;
  });
}

function exportOrdersWorkbook(orders, technicians, clients, employees, filteredOnly) {
  const techById = new Map(technicians.map((t) => [t.id, t]));
  const clientById = new Map(clients.map((c) => [c.id, c.name]));
  const employeeById = new Map(employees.map((e) => [e.id, e.name]));
  const exportOrders = orders;
  const summary = exportOrders.map((order) => {
    const tech = techById.get(order.assignedTechnicianId);
    const quoteItems = orderQuoteItems(order);
    const quoteTotal = itemsChargeTotal(quoteItems);
    const costTotal = orderVisitCostTotal(order);
    return {
      "工单编号": order.ticketNo || "",
      "报修时间": excelDate(order.reportTime),
      "城市": order.city || "",
      "甲方": clientById.get(order.clientId) || "",
      "品牌方": order.brand || "",
      "故障描述": order.issueDesc || "",
      "备注": order.notes || "",
      "跟单人": employeeById.get(order.followerId) || "",
      "指派师傅": tech?.name || "",
      "师傅电话": tech?.phone || "",
      "师傅工种": Array.isArray(tech?.skills) ? tech.skills.join("、") : "",
      "当前状态": order.status || "",
      "预计上门时间": excelDate(order.expectedVisitTime),
      "是否投保": order.insuranceEnabled ? "是" : order.insuranceEnabled === false ? "否" : "",
      "投保类型": order.insuranceType || "",
      "投保金额": order.insuranceAmount ?? "",
      "报价总额": quoteTotal,
       "师傅实际成本总额": costTotal,
      "利润": quoteTotal - costTotal,
      "师傅是否结算": order.technicianSettled ? "是" : order.technicianSettled === false ? "否" : "",
      "完成时间": excelDate(order.completedAt),
      "创建时间": excelDate(order.createdAt),
    };
  });
  const details = [];
  exportOrders.forEach((order) => {
    orderQuoteItems(order).forEach((item) => {
      const charge = lineCharge(item);
      details.push({
        "工单编号": order.ticketNo || "",
        "品牌方": order.brand || "",
        "项目": item.label || "",
        "数量": item.qty ?? "",
        "收费单价": item.chargeUnit ?? "",
        "收费小计": charge,
      });
    });
  });
  const workbook = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.json_to_sheet(summary);
  const detailSheet = XLSX.utils.json_to_sheet(details);
  formatExcelDates(summarySheet, ["报修时间", "预计上门时间", "完成时间", "创建时间"]);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "工单总表");
  XLSX.utils.book_append_sheet(workbook, detailSheet, "报价明细");
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `工单导出${filteredOnly ? "_当前筛选" : ""}_${date}.xlsx`);
}

export default function OrdersPage() {
  return (
    <AppShell active="orders">
      {(userEmail) => <OrdersView userEmail={userEmail} />}
    </AppShell>
  );
}

async function createExpenseRecord(visitId, record, orderId = null) {
  const isAdvance = record.paymentMethod === "advance";
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("expense_records").insert({
    visit_id: visitId || null,
    order_id: orderId || record.orderId || null,
    technician_id: record.technicianId || null,
    type: record.type,
    label: record.label,
    qty: Number(record.qty) || 0,
    unit_price: Number(record.unitPrice) || 0,
    amount: (Number(record.qty) || 0) * (Number(record.unitPrice) || 0),
    payment_method: record.paymentMethod,
    payer_name: record.paymentMethod === "advance" ? (record.payerName || null) : null,
    is_settled: isAdvance ? true : !!record.isSettled,
    settled_at: isAdvance ? now : (record.isSettled ? (record.settledAt || now) : null),
    notes: record.notes || null,
  }).select().single();
  if (error) throw error;
  const expenseRecord = expenseRecordFromDb(data);
  if (isAdvance) await syncExpenseAdvance(expenseRecord, null);
  return expenseRecord;
}

async function updateExpenseRecord(id, record) {
  const { data: previousRow, error: previousError } = await supabase
    .from("expense_records")
    .select("*")
    .eq("id", id)
    .single();
  if (previousError) throw previousError;
  const previousRecord = expenseRecordFromDb(previousRow);
  const isAdvance = record.paymentMethod === "advance";
  const leavingAdvance = previousRecord.paymentMethod === "advance" && !isAdvance;
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("expense_records").update({
    type: record.type,
    order_id: record.orderId || previousRecord.orderId || null,
    technician_id: record.technicianId || null,
    label: record.label,
    qty: Number(record.qty) || 0,
    unit_price: Number(record.unitPrice) || 0,
    amount: (Number(record.qty) || 0) * (Number(record.unitPrice) || 0),
    payment_method: record.paymentMethod,
    payer_name: record.paymentMethod === "advance" ? (record.payerName || null) : null,
    is_settled: isAdvance ? true : leavingAdvance ? !!previousRecord.isSettled : !!record.isSettled,
    settled_at: isAdvance ? (previousRecord.isSettled && previousRecord.settledAt ? previousRecord.settledAt : now) : leavingAdvance ? previousRecord.settledAt : (record.isSettled ? (record.settledAt || now) : null),
    notes: record.notes || null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).select().single();
  if (error) throw error;
  const expenseRecord = expenseRecordFromDb(data);
  await syncExpenseAdvance(expenseRecord, previousRecord);
  return expenseRecord;
}

async function deleteExpenseRecord(id) {
  const { error } = await supabase.from("expense_records").delete().eq("id", id);
  if (error) throw error;
}

async function unsettleExpenseRecord(id) {
  const { data, error } = await supabase.from("expense_records").update({
    is_settled: false,
    settled_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).select().single();
  if (error) throw error;
  return expenseRecordFromDb(data);
}

async function syncExpenseAdvance(expenseRecord, previousRecord) {
  const wasAdvance = previousRecord?.paymentMethod === "advance";
  const isAdvance = expenseRecord.paymentMethod === "advance";

  if (wasAdvance && !isAdvance) {
    const { error } = await supabase.from("advances").delete().eq("expense_record_id", expenseRecord.id);
    if (error) throw error;
    return;
  }

  if (!isAdvance) return;

  let orderId = expenseRecord.orderId || previousRecord?.orderId || null;
  if (!orderId && expenseRecord.visitId) {
    const { data: visit, error: visitError } = await supabase
      .from("visits")
      .select("order_id")
      .eq("id", expenseRecord.visitId)
      .single();
    if (visitError) throw visitError;
    orderId = visit.order_id;
  }
  if (!orderId) throw new Error("费用记录缺少 order_id，无法创建垫付记录");

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, city, mall, brand, store_id")
    .eq("id", orderId)
    .single();
  if (orderError) throw orderError;

  let storeName = "";
  if (order.store_id) {
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("store_name")
      .eq("id", order.store_id)
      .maybeSingle();
    if (storeError) throw storeError;
    storeName = store?.store_name || "";
  }
  const location = storeName || [order.city, order.brand, order.mall].filter(Boolean).join(" · ") || "未命名门店";
  const typeLabel = expenseRecord.type === "insurance" ? "保险费" : expenseRecord.type === "technician_fee" ? "师傅费用" : "其他费用";
  const reason = `${location} - ${typeLabel}：${expenseRecord.label}`;
  const advanceData = {
    employee_name: expenseRecord.payerName,
    amount: Number(expenseRecord.amount) || 0,
    reason,
    order_id: orderId,
    reimbursed: false,
    expense_record_id: expenseRecord.id,
  };

  const { data: existing, error: existingError } = await supabase
    .from("advances")
    .select("id")
    .eq("expense_record_id", expenseRecord.id)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const { error } = await supabase.from("advances").update({
      employee_name: advanceData.employee_name,
      amount: advanceData.amount,
      reason: advanceData.reason,
      order_id: advanceData.order_id,
    }).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("advances").insert(advanceData);
    if (error) throw error;
  }
}

function OrdersView({ userEmail }) {
  const [orders, setOrders] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [feePresets, setFeePresets] = useState([]);
  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [cities, setCities] = useState([]);
  const [brands, setBrands] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [followerFilter, setFollowerFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportTimeType, setExportTimeType] = useState("report");
  const [exportRangeType, setExportRangeType] = useState("all");
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [exportMonth, setExportMonth] = useState("");
  const [showTimeFilter, setShowTimeFilter] = useState(false);
  const [draftTimeType, setDraftTimeType] = useState("report");
  const [draftRangeType, setDraftRangeType] = useState("all");
  const [draftStartDate, setDraftStartDate] = useState("");
  const [draftEndDate, setDraftEndDate] = useState("");
  const [draftMonth, setDraftMonth] = useState("");
  const [visitFormMode, setVisitFormMode] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const searchParams = useSearchParams();

  function clearTimeFilter() {
    setExportTimeType("report");
    setExportRangeType("all");
    setExportStartDate("");
    setExportEndDate("");
    setExportMonth("");
    setDraftTimeType("report");
    setDraftRangeType("all");
    setDraftStartDate("");
    setDraftEndDate("");
    setDraftMonth("");
    setShowTimeFilter(false);
  }

  useEffect(() => {
    fetchOrders();
    fetchTechnicians();
    fetchFeePresets();
    fetchClients();
    fetchEmployees();
    fetchVocabulary("cities", setCities);
    fetchVocabulary("brands", setBrands);
    fetchStores();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (stores.length === 0) return;
    setOrders((prev) => {
      let changed = false;
      const next = prev.map((order) => {
        const store = stores.find((item) => item.id === order.storeId) || null;
        if (order.store !== store) changed = true;
        return changed ? { ...order, store } : order;
      });
      return changed ? next : prev;
    });
  }, [stores]);

  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId && orders.some((o) => o.id === openId)) setSelectedId(openId);
  }, [searchParams, orders]);

  async function fetchOrders() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*, expense_records(*), visits(*, expense_records(*))")
        .order("report_time", { ascending: false });
      if (error) throw error;
      setOrders((data || []).map(orderFromDb));
      setErrorMsg("");
    } catch (e) {
      setErrorMsg("加载工单失败：" + (e.message || "未知错误"));
    } finally {
      setLoading(false);
    }
  }

  async function fetchTechnicians() {
    try {
      const { data, error } = await supabase.from("technicians").select("*").order("name");
      if (error) throw error;
      setTechnicians(data || []);
    } catch (e) { /* 静默 */ }
  }

  async function fetchFeePresets() {
    try {
      const { data, error } = await supabase.from("fee_presets").select("*").order("created_at");
      if (error) throw error;
      setFeePresets(data || []);
    } catch (e) { /* 静默 */ }
  }

  async function fetchClients() {
    try {
      const { data, error } = await supabase.from("clients").select("*").order("name");
      if (error) throw error;
      setClients(data || []);
    } catch (e) { /* 表可能尚未迁移 */ }
  }

  async function fetchEmployees() {
    try {
      const { data, error } = await supabase.from("employees").select("*").order("name");
      if (error) throw error;
      setEmployees(data || []);
    } catch (e) { /* 同上 */ }
  }

  async function fetchVocabulary(table, setter) {
    try {
      const { data, error } = await supabase.from(table).select("*").order("name");
      if (error) throw error;
      setter(data || []);
    } catch (e) {
      setErrorMsg(`加载${table === "cities" ? "城市" : "品牌"}词条失败：` + (e.message || "未知错误"));
    }
  }

  async function fetchStores() {
    try {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .order("city")
        .order("brand")
        .order("mall")
        .order("store_name");
      if (error) throw error;
      setStores(data || []);
    } catch (e) {
      // migration_v9 尚未执行时，历史工单仍使用原有文本字段。
    }
  }

  async function findStore(city, brand, mall) {
    if ([city, brand, mall].some((value) => !value.trim())) return null;
    const cached = stores.find((store) => store.city === city.trim() && store.brand === brand.trim() && store.mall === mall.trim());
    if (cached) return cached;
    const { data, error } = await supabase
      .from("stores")
      .select("*")
      .eq("city", city.trim())
      .eq("brand", brand.trim())
      .eq("mall", mall.trim())
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function createStore(data) {
    const { data: row, error } = await supabase.from("stores").insert(data).select().single();
    if (error) throw error;
    setStores((prev) => [...prev, row]);
    return row;
  }

  async function addVocabulary(table, value, setter) {
    const name = (value || "").trim();
    if (!name) return null;
    try {
      const { data, error } = await supabase
        .from(table)
        .insert({ name, pinyin_initials: pinyinInitials(name) })
        .select()
        .single();
      if (error) {
        const { data: existing, error: findError } = await supabase
          .from(table)
          .select("*")
          .ilike("name", name)
          .limit(1)
          .maybeSingle();
        if (findError || !existing) throw error;
        setter((prev) => (prev.some((item) => item.id === existing.id) ? prev : [...prev, existing].sort((a, b) => a.name.localeCompare(b.name))));
        return existing;
      }
      setter((prev) => (prev.some((item) => item.id === data.id) ? prev : [...prev, data].sort((a, b) => a.name.localeCompare(b.name))));
      return data;
    } catch (e) {
      setErrorMsg(`保存${table === "cities" ? "城市" : "品牌"}词条失败：` + (e.message || "未知错误"));
      return null;
    }
  }

  async function addTechnician(name, phone, city, address) {
    try {
      const { data, error } = await supabase
        .from("technicians")
        .insert({ name, phone: phone || null, city: city || null, address: address || null })
        .select()
        .single();
      if (error) throw error;
      setTechnicians((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      return data;
    } catch (e) {
      setErrorMsg("添加师傅失败：" + (e.message || "未知错误"));
      return null;
    }
  }

  async function addNamed(table, name, setter) {
    try {
      const { data, error } = await supabase.from(table).insert({ name }).select().single();
      if (error) throw error;
      setter((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      return data;
    } catch (e) {
      setErrorMsg("添加失败：" + (e.message || "未知错误"));
      return null;
    }
  }

  async function addFeePreset(label, chargeUnit) {
    try {
      const { data, error } = await supabase
        .from("fee_presets")
        .insert({
          label,
          amount: Number(chargeUnit) || 0,
          kind: "charge",
          charge_unit: Number(chargeUnit) || 0,
        })
        .select()
        .single();
      if (error) throw error;
      setFeePresets((prev) => [...prev, data]);
      return data;
    } catch (e) {
      setErrorMsg("添加常用项目失败：" + (e.message || "未知错误"));
      return null;
    }
  }

  async function deleteFeePreset(id) {
    if (!window.confirm("确定删除这个报价快捷标签吗？已保存的历史报价不会受影响。")) return false;
    try {
      const { error } = await supabase.from("fee_presets").delete().eq("id", id);
      if (error) throw error;
      setFeePresets((prev) => prev.filter((preset) => preset.id !== id));
      setErrorMsg("");
      return true;
    } catch (e) {
      setErrorMsg("删除报价快捷标签失败：" + (e.message || "未知错误"));
      return false;
    }
  }

  async function addOrder(data) {
    try {
      const [cityItem, brandItem] = await Promise.all([
        data.city ? addVocabulary("cities", data.city, setCities) : null,
        data.brand ? addVocabulary("brands", data.brand, setBrands) : null,
      ]);
      if ((data.city && !cityItem) || (data.brand && !brandItem)) throw new Error("城市或品牌词条保存失败");
      const reportTime = data.reportTime || new Date().toISOString();
      const reportDate = new Date(reportTime);
      const reportPrefix = `KT${reportDate.getFullYear()}${String(reportDate.getMonth() + 1).padStart(2, "0")}${String(
        reportDate.getDate()
      ).padStart(2, "0")}${String(reportDate.getHours()).padStart(2, "0")}${String(reportDate.getMinutes()).padStart(2, "0")}`;
      const { data: matchingTickets, error: ticketError } = await supabase
        .from("orders")
        .select("ticket_no")
        .like("ticket_no", `${reportPrefix}%`);
      if (ticketError) throw ticketError;
      const ticketNo = ticketNoFromReportTime(reportTime, (matchingTickets || []).map((row) => row.ticket_no));
      const { data: row, error } = await supabase
        .from("orders")
        .insert({
          ticket_no: ticketNo,
          city: data.city || null,
          mall: data.mall,
          brand: data.brand || null,
          contact_name: data.contactName || null,
          contact_phone: data.contactPhone || null,
          issue_desc: data.issueDesc,
          address: data.address || null,
          notes: data.notes || null,
          report_time: reportTime,
          expected_visit_time: data.expectedVisitTime || null,
          status: data.status || "待核实",
          pending_assignment_at: data.status === "待派工" ? new Date().toISOString() : null,
          pending_visit_at: data.status === "待上门" ? new Date().toISOString() : null,
          completed_at: data.status === "已完成" ? new Date().toISOString() : null,
          created_by: userEmail,
          related_order_id: data.relatedOrderId || null,
          client_id: data.clientId || null,
          follower_id: data.followerId || null,
          assigned_technician_id: data.assignedTechnicianId || null,
          store_id: data.storeId || null,
        })
        .select()
        .single();
      if (error) throw error;
      const newOrder = {
        ...orderFromDb({ ...row, visits: [] }),
        store: stores.find((store) => store.id === data.storeId) || null,
      };
      setOrders((prev) => [newOrder, ...prev].sort((a, b) => new Date(b.reportTime) - new Date(a.reportTime)));
      setShowNewOrder(false);
      setSelectedId(newOrder.id);
      setErrorMsg("");
    } catch (e) {
      setErrorMsg("创建工单失败：" + (e.message || "未知错误"));
    }
  }

  async function patchOrder(orderId, camelPatch) {
    try {
      const dbPatch = orderToDbPatch(camelPatch);
      const { error } = await supabase.from("orders").update(dbPatch).eq("id", orderId);
      if (error) throw error;
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, ...camelPatch, updatedAt: dbPatch.updated_at } : o))
      );
      setErrorMsg("");
      return true;
    } catch (e) {
      setErrorMsg("更新工单失败：" + (e.message || "未知错误"));
      return false;
    }
  }

  async function updateStatus(orderId, status, expectedVisitTimeOverride) {
    const order = orders.find((o) => o.id === orderId);
    const now = new Date().toISOString();
    const patch = { status };
    if (status === "待派工" && order?.status !== "待派工") {
      patch.pendingAssignmentAt = now;
    } else if (status !== "待派工") {
      patch.pendingAssignmentAt = null;
    }
    if (status === "待上门" && order?.status !== "待上门") {
      patch.pendingVisitAt = now;
    } else if (status !== "待上门") {
      patch.pendingVisitAt = null;
    }
    if (status === "已完成" && !order?.completedAt) {
      patch.completedAt = new Date().toISOString();
    }
    await patchOrder(orderId, patch);
    return true;
  }

  async function assignTechnician(orderId, technicianId) {
    await patchOrder(orderId, {
      assignedTechnicianId: technicianId,
      ...(technicianId ? { pendingAssignmentAt: null } : {}),
    });
  }

  async function toggleClientSettled(order) {
    const next = !order.clientSettled;
    if (!next && !window.confirm("甲方已结算，确认撤销结算并允许修改报价吗？")) return;
    await patchOrder(order.id, {
      clientSettled: next,
      clientSettledAt: next ? new Date().toISOString() : null,
    });
  }

  async function saveQuotes(orderId, quoteItems, quoteNote) {
    await patchOrder(orderId, {
      quoteItems,
      quoteNote,
      quoteUpdatedAt: new Date().toISOString(),
      quoteUpdatedBy: userEmail,
    });
  }

  async function addVisit(orderId, visit) {
    try {
      const { data: row, error } = await supabase
        .from("visits")
        .insert({
          order_id: orderId,
          visit_time: visit.visitTime,
          service_type: visit.serviceType || null,
          service_content: visit.serviceContent || null,
          master: visit.master,
          master_phone: visit.masterPhone || null,
          technician_id: visit.technicianId || null,
          result_type: visit.resultType,
          note: visit.note || null,
          created_by: userEmail,
        })
        .select()
        .single();
      if (error) throw error;

      const expenseRecords = await saveExpenseRecords(row.id, visit.expenseRecords || [], orderId);

      const order = orders.find((o) => o.id === orderId);
      let nextStatus = order ? order.status : "维修中";
      if (visit.resultType === "resolved") nextStatus = "已完成";
      else if (nextStatus !== "已取消") nextStatus = "维修中";

      const completionPatch = {
        status: nextStatus,
        updated_at: new Date().toISOString(),
      };
      if (nextStatus === "待派工" && order?.status !== "待派工") completionPatch.pending_assignment_at = completionPatch.updated_at;
      if (nextStatus !== "待派工") completionPatch.pending_assignment_at = null;
      if (nextStatus === "待上门" && order?.status !== "待上门") completionPatch.pending_visit_at = completionPatch.updated_at;
      if (nextStatus !== "待上门") completionPatch.pending_visit_at = null;
      if (nextStatus === "已完成" && !order?.completedAt) {
        completionPatch.completed_at = new Date().toISOString();
      }
      await supabase.from("orders").update(completionPatch).eq("id", orderId);

      const newVisit = { ...visitFromDb(row), expenseRecords };
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: nextStatus,
                completedAt: nextStatus === "已完成" && !o.completedAt ? completionPatch.completed_at : o.completedAt,
                updatedAt: completionPatch.updated_at,
                visits: [...o.visits, newVisit],
              }
            : o
        )
      );
      setVisitFormMode(null);
      setErrorMsg("");
    } catch (e) {
      setErrorMsg("保存上门记录失败：" + (e.message || "未知错误"));
    }
  }

  async function updateVisit(orderId, visitId, visit) {
    try {
      const { error } = await supabase
        .from("visits")
        .update({
          visit_time: visit.visitTime,
          service_type: visit.serviceType || null,
          service_content: visit.serviceContent || null,
          master: visit.master,
          master_phone: visit.masterPhone || null,
          technician_id: visit.technicianId || null,
          result_type: visit.resultType,
          note: visit.note || null,
        })
        .eq("id", visitId);
      if (error) throw error;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, visits: o.visits.map((v) => (v.id === visitId ? { ...v, ...visit } : v)) }
            : o
        )
      );
      setVisitFormMode(null);
      setErrorMsg("");
    } catch (e) {
      setErrorMsg("修改上门记录失败：" + (e.message || "未知错误"));
    }
  }

  async function saveExpenseRecords(visitId, records, orderId, replaceExisting = false) {
    if (replaceExisting) {
      const { error } = await supabase.from("expense_records").delete().eq("visit_id", visitId);
      if (error) throw error;
    }
    if (!records.length) return [];
    const rows = records.map((record) => ({
      visit_id: visitId,
      order_id: orderId,
      technician_id: record.technicianId || null,
      type: record.type,
      label: record.label,
      qty: Number(record.qty) || 0,
      unit_price: Number(record.unitPrice) || 0,
      amount: (Number(record.qty) || 0) * (Number(record.unitPrice) || 0),
      payment_method: record.paymentMethod,
      payer_name: record.paymentMethod === "advance" ? (record.payerName || null) : null,
      is_settled: record.paymentMethod === "advance" ? true : !!record.isSettled,
      settled_at: record.paymentMethod === "advance" ? (record.settledAt || new Date().toISOString()) : (record.isSettled ? (record.settledAt || new Date().toISOString()) : null),
      notes: record.notes || null,
    }));
    const { data, error } = await supabase.from("expense_records").insert(rows).select();
    if (error) throw error;
    const expenseRecords = (data || []).map(expenseRecordFromDb);
    await Promise.all(expenseRecords.map((expenseRecord) => (
      expenseRecord.paymentMethod === "advance" ? syncExpenseAdvance(expenseRecord, null) : null
    )));
    return expenseRecords;
  }

  async function deleteVisit(orderId, visitId) {
    try {
      const { error } = await supabase.from("visits").delete().eq("id", visitId);
      if (error) throw error;
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, visits: o.visits.filter((v) => v.id !== visitId) } : o))
      );
      setErrorMsg("");
    } catch (e) {
      setErrorMsg("删除上门记录失败：" + (e.message || "未知错误"));
    }
  }

  const filtered = useMemo(() => {
    const baseFiltered = orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (followerFilter !== "all" && o.followerId !== followerFilter) return false;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const storeDisplay = orderStoreDisplay(o);
        const hay = `${storeDisplay.city} ${storeDisplay.mall} ${storeDisplay.brand} ${storeDisplay.storeName} ${o.issueDesc} ${o.ticketNo}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    return filterOrdersByExportDate(baseFiltered, exportTimeType, exportRangeType, exportStartDate, exportEndDate, exportMonth).sort((a, b) => {
      if (!a.reportTime && !b.reportTime) return 0;
      if (!a.reportTime) return 1;
      if (!b.reportTime) return -1;
      return new Date(b.reportTime).getTime() - new Date(a.reportTime).getTime();
    });
  }, [orders, statusFilter, followerFilter, search, exportTimeType, exportRangeType, exportStartDate, exportEndDate, exportMonth]);

  const groupedOrders = useMemo(() => {
    const groups = new Map();
    filtered.forEach((order) => {
      const date = order.reportTime ? new Date(order.reportTime) : null;
      const key = date && !Number.isNaN(date.getTime())
        ? `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
        : "missing";
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          title: date && !Number.isNaN(date.getTime())
            ? `${date.getMonth() + 1}月${date.getDate()}日`
            : "未填写报修时间",
          orders: [],
          timestamp: date && !Number.isNaN(date.getTime()) ? date.getTime() : null,
        });
      }
      groups.get(key).orders.push(order);
    });
    return Array.from(groups.values()).sort((a, b) => {
      if (a.timestamp === null && b.timestamp === null) return 0;
      if (a.timestamp === null) return 1;
      if (b.timestamp === null) return -1;
      return b.timestamp - a.timestamp;
    });
  }, [filtered]);

  const counts = useMemo(() => {
    const c = { all: orders.length };
    STATUSES.forEach((s) => (c[s] = orders.filter((o) => o.status === s).length));
    return c;
  }, [orders]);

  const selected = orders.find((o) => o.id === selectedId) || null;

  async function deleteOrder(order) {
    try {
      const { error: visitsError } = await supabase.from("visits").delete().eq("order_id", order.id);
      if (visitsError) throw new Error(`删除服务记录失败：${visitsError.message || "未知错误"}`);
      const { error: orderError } = await supabase.from("orders").delete().eq("id", order.id);
      if (orderError) throw new Error(`删除工单失败：${orderError.message || "未知错误"}`);
      setOrders((prev) => prev.filter((item) => item.id !== order.id));
      setSelectedId(null);
      setDeleteTarget(null);
      setSuccessMsg(`工单 ${order.ticketNo || ""} 已删除`);
      setErrorMsg("");
    } catch (e) {
      setDeleteTarget(null);
      setErrorMsg(e.message || "删除工单失败");
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <div style={styles.title}>工单</div>
          <div style={styles.subtitle}>按报修时间从近到远排列</div>
        </div>
        <div style={styles.headerActions}>
          <div style={styles.exportWrap}>
            <button style={styles.exportBtn} onClick={() => setShowExportMenu((prev) => !prev)}>
              导出 Excel
            </button>
            {showExportMenu && (
              <div style={styles.exportMenu}>
                <button style={styles.exportMenuItem} onClick={() => { exportOrdersWorkbook(filtered, technicians, clients, employees, true); setShowExportMenu(false); }}>
                  导出当前筛选结果
                </button>
                <button style={styles.exportMenuItem} onClick={() => { exportOrdersWorkbook(orders, technicians, clients, employees, false); setShowExportMenu(false); }}>
                  导出全部工单
                </button>
              </div>
            )}
          </div>
          <button style={styles.primaryBtn} onClick={() => setShowNewOrder(true)}>
            <Plus size={16} /> 新建工单
          </button>
        </div>
      </div>

      {errorMsg && (
        <div style={styles.errorBar}>
          <AlertTriangle size={14} /> {errorMsg}
        </div>
      )}
      {successMsg && <div style={styles.successBar}>{successMsg}</div>}

      <div style={styles.filterBar}>
        <div style={styles.tabs}>
          <button style={{ ...styles.tab, ...(statusFilter === "all" ? styles.tabActive : {}) }} onClick={() => setStatusFilter("all")}>
            全部 <span style={styles.tabCount}>{counts.all}</span>
          </button>
          {STATUSES.map((s) => (
            <button key={s} style={{ ...styles.tab, ...(statusFilter === s ? styles.tabActive : {}) }} onClick={() => setStatusFilter(s)}>
              <span style={{ ...styles.dot, background: STATUS_STYLE[s].dot }} />
              {s} <span style={styles.tabCount}>{counts[s]}</span>
            </button>
          ))}
        </div>
        <div style={styles.searchBox}>
          <Search size={14} color="#8FA1A8" />
          <input
            style={styles.searchInput}
            placeholder="搜索城市 / 商场 / 品牌 / 故障 / 工单号"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label style={styles.filterSelectLabel}>
          跟单人
          <select style={styles.filterSelect} value={followerFilter} onChange={(e) => setFollowerFilter(e.target.value)}>
            <option value="all">全部</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.name}</option>
            ))}
          </select>
        </label>
        <div style={styles.timeFilterWrap}>
          <button
            type="button"
            style={styles.timeFilterButton}
            onClick={() => {
              setDraftTimeType(exportTimeType);
              setDraftRangeType(exportRangeType);
              setDraftStartDate(exportStartDate);
              setDraftEndDate(exportEndDate);
              setDraftMonth(exportMonth);
              setShowTimeFilter((prev) => !prev);
            }}
          >
            🕒 按时间筛选 {exportRangeType !== "all" ? "· 已启用" : "▼"}
          </button>
          {showTimeFilter && (
            <div style={styles.timeFilterPanel}>
              <label style={styles.timeFilterField}>时间类型
                <select style={styles.filterSelect} value={draftTimeType} onChange={(e) => setDraftTimeType(e.target.value)}>
                  <option value="report">报修时间</option>
                  <option value="completed">完工时间</option>
                </select>
              </label>
              <label style={styles.timeFilterField}>时间范围
                <select style={styles.filterSelect} value={draftRangeType} onChange={(e) => setDraftRangeType(e.target.value)}>
                  <option value="all">全部</option>
                  <option value="today">今天</option>
                  <option value="this_week">本周</option>
                  <option value="this_month">本月</option>
                  <option value="last_month">上月</option>
                  <option value="this_year">今年</option>
                  <option value="month">指定月份</option>
                  <option value="custom">自定义时间</option>
                </select>
              </label>
              {draftRangeType === "custom" && (
                <div style={styles.exportDateRow}>
                  <input style={styles.exportDateInput} type="date" value={draftStartDate} onChange={(e) => setDraftStartDate(e.target.value)} />
                  <span>至</span>
                  <input style={styles.exportDateInput} type="date" value={draftEndDate} onChange={(e) => setDraftEndDate(e.target.value)} />
                </div>
              )}
              {draftRangeType === "month" && (
                <input style={styles.exportMonthInput} type="month" value={draftMonth} onChange={(e) => setDraftMonth(e.target.value)} />
              )}
              <div style={styles.timeFilterActions}>
                <button
                  type="button"
                  style={styles.ghostBtn}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    clearTimeFilter();
                  }}
                >
                  取消
                </button>
                <button type="button" style={styles.smallPrimaryBtn} onClick={() => {
                  setExportTimeType(draftTimeType);
                  setExportRangeType(draftRangeType);
                  setExportMonth(draftMonth);
                  setExportStartDate(draftStartDate);
                  setExportEndDate(draftEndDate);
                  setShowTimeFilter(false);
                }}>确定</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div style={styles.centerState}>
          <Loader2 size={22} color="#1F7A8C" style={{ animation: "spin 1s linear infinite" }} />
          <div style={{ marginTop: 10, color: "#4C6169", fontSize: 13 }}>加载工单数据中…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={styles.centerState}>
          <ClipboardList size={32} color="#C7D5D3" />
          <div style={{ marginTop: 10, color: "#4C6169", fontSize: 14 }}>
            {orders.length === 0 ? "还没有工单，点击右上角新建一个" : "没有符合条件的工单"}
          </div>
        </div>
      ) : (
        <div style={styles.groupList}>
          {groupedOrders.map((group) => (
            <section key={group.key} style={styles.dateGroup}>
              <div style={styles.dateGroupHeader}>{group.title}</div>
              <div style={styles.grid}>
                {group.orders.map((o) => (
                  <OrderCard key={o.id} order={o} technicians={technicians} clients={clients} now={now} onClick={() => setSelectedId(o.id)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {selected && (
        <DetailPanel
          order={selected}
          orders={orders}
          technicians={technicians}
          feePresets={feePresets}
          clients={clients}
          stores={stores}
          cities={cities}
          employees={employees}
          onClose={() => {
            setSelectedId(null);
            setVisitFormMode(null);
          }}
          onNavigateToOrder={(id) => {
            setSelectedId(id);
            setVisitFormMode(null);
          }}
          onUpdateStatus={(status, expectedVisitTime) => updateStatus(selected.id, status, expectedVisitTime)}
          onAssignTechnician={(techId) => assignTechnician(selected.id, techId)}
          onAddTechnician={addTechnician}
          onAddFeePreset={addFeePreset}
          onAddClient={(name) => addNamed("clients", name, setClients)}
          onAddEmployee={(name) => addNamed("employees", name, setEmployees)}
          onFindStore={findStore}
          onCreateStore={createStore}
          onPatch={(camel) => patchOrder(selected.id, camel)}
          onSaveQuotes={(items, note) => saveQuotes(selected.id, items, note)}
          onDeleteFeePreset={deleteFeePreset}
          onToggleClientSettled={() => toggleClientSettled(selected)}
          visitFormMode={visitFormMode}
          onOpenNewVisit={() => setVisitFormMode("new")}
          onOpenEditVisit={(v) => setVisitFormMode(v)}
          onCancelVisitForm={() => setVisitFormMode(null)}
          onAddVisit={(v) => addVisit(selected.id, v)}
          onUpdateVisit={(visitId, v) => updateVisit(selected.id, visitId, v)}
          onDeleteVisit={(visitId) => deleteVisit(selected.id, visitId)}
          onCreateExpense={createExpenseRecord}
          onUpdateExpense={updateExpenseRecord}
          onDeleteExpense={deleteExpenseRecord}
          onUnsettleExpense={unsettleExpenseRecord}
          onExpenseRecordsChange={(records) => setOrders((prev) => prev.map((item) => item.id === selected.id ? { ...item, expenseRecords: records } : item))}
          onDeleteOrder={() => setDeleteTarget(selected)}
        />
      )}
      {deleteTarget && (
        <DeleteOrderConfirm
          order={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteOrder(deleteTarget)}
        />
      )}

      {showNewOrder && (
        <NewOrderModal
          onClose={() => setShowNewOrder(false)}
          onSubmit={addOrder}
          orders={orders}
           clients={clients}
           technicians={technicians}
           cities={cities}
           brands={brands}
           stores={stores}
           onCreateCity={(name) => addVocabulary("cities", name, setCities)}
           onCreateBrand={(name) => addVocabulary("brands", name, setBrands)}
           onAddTechnician={addTechnician}
          employees={employees}
          onAddClient={(name) => addNamed("clients", name, setClients)}
          onAddEmployee={(name) => addNamed("employees", name, setEmployees)}
           onFindStore={findStore}
           onCreateStore={createStore}
        />
      )}
    </div>
  );
}

function OrderCard({ order, technicians, clients, now, onClick }) {
  const st = STATUS_STYLE[order.status];
  const lastVisit = order.visits[order.visits.length - 1];
  const tech = technicians.find((t) => t.id === order.assignedTechnicianId);
  const client = clients.find((c) => c.id === order.clientId);
  const technicianCost = orderTechnicianCostTotal(order);
  const { assignmentOverdue, expectedVisitOverdue, visitTimeUndetermined } = getOrderTimeoutReminders(order, now);
  return (
    <button style={styles.card} className="card-hover" onClick={onClick}>
      <div style={styles.cardTop}>
        <span style={styles.ticketNo}>{order.ticketNo}</span>
        <span style={{ ...styles.statusBadge, background: st.bg, color: st.fg }}>
          <span style={{ ...styles.dot, background: st.dot }} />
          {order.status}
        </span>
      </div>
      <div style={styles.cardMall}>
        {order.city ? <span style={styles.cardCity}>{order.city} · </span> : null}
        {order.mall}
        {order.brand ? <span style={styles.cardBrand}> · {order.brand}</span> : null}
      </div>
      <div style={styles.cardIssue}>{order.issueDesc}</div>
      <div style={styles.cardMetaRow}>
        <span style={styles.cardMeta}>
          <Clock size={12} /> 报修时间：{fmtDate(order.reportTime)}
        </span>
        {order.completedAt && (
          <span style={styles.completedTimeBadge}>
            <span>⭐</span> 完工 {fmtDate(order.completedAt)}
          </span>
        )}
      </div>
      {(tech || client || technicianCost > 0 || !order.assignedTechnicianId) && (
        <div style={styles.cardMetaRow}>
          {client && <span style={styles.cardMeta}>甲方：{client.name}</span>}
          <span style={{ ...styles.cardMeta, ...(technicianCost > 0 ? { color: order.technicianSettled ? "#2C6B45" : "#A5661A" } : {}) }}>
            <Users size={12} /> {tech ? `指派：${tech.name}` : "师傅：未指派"}
            {technicianCost > 0 ? ` - ${order.technicianSettled ? "已结算" : `¥${technicianCost}`}` : ""}
          </span>
        </div>
      )}
      {assignmentOverdue && <div style={styles.timeoutAlert}>🔴 已超过2天未安排师傅</div>}
      {expectedVisitOverdue && <div style={styles.timeoutAlert}>⚠️ 已超过预计上门时间未上门</div>}
      {visitTimeUndetermined && <div style={styles.timeoutAlert}>⚠️ 待上门超2天未确定具体时间</div>}
      {lastVisit && (
        <div style={styles.lastVisitRow}>
          {(() => {
            const m = resultMeta(lastVisit.resultType);
            return (
              <>
                <span style={{ color: m.color }}>● {m.label}</span>
                <span style={{ color: "#8FA1A8" }}> · {lastVisit.master}</span>
              </>
            );
          })()}
        </div>
      )}
    </button>
  );
}

function TechnicianPicker({ technicians, valueId, onSelect, onAddTechnician, compact }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newCity, setNewCity] = useState("");

  if (adding) {
    return (
      <div style={styles.techAddRow}>
        <input style={styles.input} placeholder="师傅姓名" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
        <input style={styles.input} placeholder="城市" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
        <input style={styles.input} placeholder="电话（选填）" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
        <button
          style={styles.smallPrimaryBtn}
          onClick={async () => {
            if (!newName.trim()) return;
            const t = await onAddTechnician(newName.trim(), newPhone.trim(), newCity.trim());
            if (t) {
              onSelect(t);
              setAdding(false);
              setNewName("");
              setNewPhone("");
              setNewCity("");
            }
          }}
        >
          保存
        </button>
        <button style={styles.ghostBtn} onClick={() => setAdding(false)}>取消</button>
      </div>
    );
  }

  return (
    <select
      style={styles.input}
      value={valueId || ""}
      onChange={(e) => {
        if (e.target.value === "__add__") {
          setAdding(true);
          return;
        }
        const t = technicians.find((x) => x.id === e.target.value);
        onSelect(t || null);
      }}
    >
      <option value="">{compact ? "未指定" : "选择师傅…"}</option>
      {technicians.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
          {t.city ? `（${t.city}）` : ""}
        </option>
      ))}
      <option value="__add__">+ 添加新师傅</option>
    </select>
  );
}

function NamePicker({ items, valueId, onSelect, onAdd, placeholder }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  if (adding) {
    return (
      <div style={styles.techAddRow}>
        <input style={styles.input} placeholder="名称" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
        <button
          style={styles.smallPrimaryBtn}
          onClick={async () => {
            if (!newName.trim()) return;
            const row = await onAdd(newName.trim());
            if (row) {
              onSelect(row.id);
              setAdding(false);
              setNewName("");
            }
          }}
        >
          保存
        </button>
        <button style={styles.ghostBtn} onClick={() => setAdding(false)}>取消</button>
      </div>
    );
  }

  return (
    <select
      style={styles.input}
      value={valueId || ""}
      onChange={(e) => {
        if (e.target.value === "__add__") {
          setAdding(true);
          return;
        }
        onSelect(e.target.value || null);
      }}
    >
      <option value="">{placeholder}</option>
      {items.map((it) => (
        <option key={it.id} value={it.id}>{it.name}</option>
      ))}
      <option value="__add__">+ 新增</option>
    </select>
  );
}

function RelatedOrderField({ orders, currentId, valueId, onChange }) {
  const related = valueId ? orders.find((o) => o.id === valueId) : null;
  const [search, setSearch] = useState("");
  const results = useMemo(() => {
    if (!search.trim()) return [];
    const s = search.trim().toLowerCase();
    return orders
      .filter((o) => o.id !== currentId)
      .filter((o) => `${o.mall} ${o.ticketNo} ${o.issueDesc} ${o.city || ""}`.toLowerCase().includes(s))
      .slice(0, 6);
  }, [search, orders, currentId]);

  if (related) {
    return (
      <div style={styles.relatedChip}>
        <span>{related.ticketNo} · {related.city ? `${related.city} · ` : ""}{related.mall}</span>
        <button style={styles.relatedChipRemove} onClick={() => onChange(null)}>
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        style={styles.input}
        placeholder="搜索商场名或工单号"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {results.length > 0 && (
        <div style={styles.relatedResultsBox}>
          {results.map((o) => (
            <button
              key={o.id}
              style={styles.relatedResultItem}
              onClick={() => {
                onChange(o.id);
                setSearch("");
              }}
            >
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#8FA1A8" }}>{o.ticketNo}</span>{" "}
              {o.mall} <span style={{ color: "#8FA1A8" }}>· {o.issueDesc.slice(0, 16)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailPanel({
  order, orders, technicians, feePresets, clients, cities, employees, stores,
  onClose, onNavigateToOrder, onUpdateStatus, onAssignTechnician, onAddTechnician,
  onAddFeePreset, onDeleteFeePreset, onAddClient, onAddEmployee, onPatch, onSaveQuotes, onToggleClientSettled,
  visitFormMode, onOpenNewVisit, onOpenEditVisit, onCancelVisitForm,
  onAddVisit, onUpdateVisit, onDeleteVisit,
  onCreateExpense, onUpdateExpense, onDeleteExpense, onUnsettleExpense,
  onExpenseRecordsChange,
  onDeleteOrder,
}) {
  const relatedOrder = order.relatedOrderId ? orders.find((o) => o.id === order.relatedOrderId) : null;
  const assignedTech = technicians.find((t) => t.id === order.assignedTechnicianId);
  const client = clients.find((c) => c.id === order.clientId);
  const follower = employees.find((e) => e.id === order.followerId);
  const store = stores.find((item) => item.id === order.storeId) || order.store || null;
  const quoteItems = orderQuoteItems(order);
  const totalCharge = itemsChargeTotal(quoteItems);
  const insuranceRecords = (order.expenseRecords || []).filter((record) => record.type === "insurance");

  const [city, setCity] = useState(order.city || "");
  const [mall, setMall] = useState(order.mall || "");
  const [brand, setBrand] = useState(order.brand || "");
  const [contactName, setContactName] = useState(order.contactName || "");
  const [contactPhone, setContactPhone] = useState(order.contactPhone || "");
  const [address, setAddress] = useState(order.address || "");
  const [issueDesc, setIssueDesc] = useState(order.issueDesc || "");
  const [notes, setNotes] = useState(order.notes || "");
  const [reportTime, setReportTime] = useState(() => toDateTimeLocal(order.reportTime));
  const [expectedVisitTime, setExpectedVisitTime] = useState(() => toDateTimeLocal(order.expectedVisitTime));
  const [expectedVisitSaveState, setExpectedVisitSaveState] = useState("");
  const [completedAt, setCompletedAt] = useState(() => toDateTimeLocal(order.completedAt));
  const [statusHint, setStatusHint] = useState("");
  const [inspectUrl, setInspectUrl] = useState(order.inspectionPhotoUrl || "");
  const [compareUrl, setCompareUrl] = useState(order.comparePhotoUrl || "");
  const [editingRelated, setEditingRelated] = useState(false);

  useEffect(() => {
    setCity(order.city || "");
    setMall(order.mall || "");
    setBrand(order.brand || "");
    setContactName(order.contactName || "");
    setContactPhone(order.contactPhone || "");
    setAddress(order.address || "");
    setIssueDesc(order.issueDesc || "");
    setNotes(order.notes || "");
    setReportTime(toDateTimeLocal(order.reportTime));
    setExpectedVisitTime(toDateTimeLocal(order.expectedVisitTime));
    setExpectedVisitSaveState("");
    setCompletedAt(toDateTimeLocal(order.completedAt));
    setStatusHint("");
    setInspectUrl(order.inspectionPhotoUrl || "");
    setCompareUrl(order.comparePhotoUrl || "");
    setEditingRelated(false);
  }, [order.id]);

  async function handleStatusChange(nextStatus) {
    const savedExpectedTime = expectedVisitTime ? new Date(expectedVisitTime).toISOString() : order.expectedVisitTime;
    if (nextStatus === "待上门" && savedExpectedTime && savedExpectedTime !== order.expectedVisitTime) {
      await onPatch({ expectedVisitTime: savedExpectedTime });
    }
    setStatusHint("");
    await onUpdateStatus(nextStatus, savedExpectedTime);
  }

  async function saveExpectedVisitTime() {
    const value = expectedVisitTime ? new Date(expectedVisitTime).toISOString() : null;
    setExpectedVisitSaveState("saving");
    const saved = await onPatch({ expectedVisitTime: value });
    if (saved) {
      setExpectedVisitSaveState("saved");
      window.setTimeout(() => setExpectedVisitSaveState(""), 2200);
    } else {
      setExpectedVisitSaveState("error");
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.panelHeader}>
          <div>
            <div style={styles.ticketNoLg}>{order.ticketNo}</div>
            <div style={styles.panelMall}>
              {order.city ? `${order.city} · ` : ""}{order.mall}
            </div>
          </div>
          <button style={styles.iconBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={styles.panelBody} className="scrollbar">
          <div style={styles.sectionBlock}>
            <div style={styles.sectionTitle}>工单信息</div>
            {relatedOrder && !editingRelated && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <button style={styles.relatedLinkChip} onClick={() => onNavigateToOrder(relatedOrder.id)}>
                  <Link2 size={12} /> 关联工单：{relatedOrder.ticketNo} · {relatedOrder.mall}
                </button>
                <button style={styles.tinyIconBtn} onClick={() => setEditingRelated(true)} title="修改关联">
                  <Pencil size={12} />
                </button>
              </div>
            )}
            {(!relatedOrder || editingRelated) && (
              <Field label="关联历史工单">
                <RelatedOrderField
                  orders={orders}
                  currentId={order.id}
                  valueId={order.relatedOrderId}
                  onChange={(id) => {
                    onPatch({ relatedOrderId: id });
                    setEditingRelated(false);
                  }}
                />
              </Field>
            )}

            <div style={styles.formRow3}>
              <Field label="城市">
                <CityInput value={city} cities={cities} onChange={setCity} />
              </Field>
              <Field label="商场">
                <input style={styles.input} value={mall} onChange={(e) => setMall(e.target.value)} placeholder="如：断桥万达" />
              </Field>
              <Field label="品牌方">
                <input style={styles.input} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="如：满记甜品" />
              </Field>
            </div>
            {store && (
              <div style={styles.storeInfoBox}>
                <div style={styles.storeInfoTitle}>门店档案</div>
                <div>{store.city} · {store.brand} · {store.mall} · {store.store_name}</div>
                {store.address && <div>地址：{store.address}</div>}
                {store.contact_name && <div>联系人：{store.contact_name}{store.contact_phone ? ` · ${store.contact_phone}` : ""}</div>}
                {store.special_requirements && <div style={styles.storeWarning}>特殊要求：{store.special_requirements}</div>}
                {store.notes && <div>备注：{store.notes}</div>}
              </div>
            )}
            <div style={styles.formRow2}>
              <Field label="报修时间">
                <input
                  style={styles.input}
                  type="datetime-local"
                  value={reportTime}
                  onChange={(e) => setReportTime(e.target.value)}
                />
              </Field>
            </div>
            <div style={styles.formRow2}>
              <Field label="甲方公司">
                <NamePicker
                  items={clients}
                  valueId={order.clientId}
                  onSelect={(id) => onPatch({ clientId: id })}
                  onAdd={onAddClient}
                  placeholder="选择甲方…"
                />
              </Field>
              <Field label="跟单人">
                <NamePicker
                  items={employees}
                  valueId={order.followerId}
                  onSelect={(id) => onPatch({ followerId: id })}
                  onAdd={onAddEmployee}
                  placeholder="选择跟单人…"
                />
              </Field>
            </div>
            <div style={styles.formRow2}>
              <Field label="现场联系人">
                <input style={styles.input} value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </Field>
              <Field label="联系电话">
                <input style={styles.input} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
              </Field>
            </div>
            <Field label="详细地址">
              <input style={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <Field label="故障描述">
              <textarea style={{ ...styles.input, minHeight: 60, resize: "vertical" }} value={issueDesc} onChange={(e) => setIssueDesc(e.target.value)} />
            </Field>
            <Field label="备注">
              <textarea
                style={{ ...styles.input, minHeight: 80, resize: "vertical" }}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="记录需要长期保留的跟进信息"
              />
            </Field>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <button
                style={styles.smallPrimaryBtn}
                onClick={() =>
                  onPatch({
                    city: city.trim(),
                    mall: mall.trim(),
                    brand: brand.trim(),
                    contactName: contactName.trim(),
                    contactPhone: contactPhone.trim(),
                    address: address.trim(),
                    issueDesc: issueDesc.trim(),
                    notes: notes.trim(),
                    reportTime: reportTime ? new Date(reportTime).toISOString() : null,
                  })
                }
              >
                保存基本信息
              </button>
            </div>
            <div style={styles.metaHint}>
              登记人 {order.createdBy || "—"} · 报修 {fmtDate(order.reportTime)}
              {client ? ` · 甲方 ${client.name}` : ""}
              {follower ? ` · 跟单 ${follower.name}` : ""}
            </div>
          </div>

          <div style={styles.sectionBlock}>
            <div style={styles.sectionTitle}><Wrench size={13} /> 指派师傅</div>
            {assignedTech ? (
              <>
                <div style={styles.assignedTechInfo}>
                  <div style={styles.assignedTechName}>{assignedTech.name}</div>
                  <div style={styles.assignedTechMeta}>
                    {assignedTech.phone ? <><Phone size={11} /> {assignedTech.phone}</> : "暂无电话"}
                  </div>
                </div>
                <TechnicianPicker
                  technicians={technicians}
                  valueId={order.assignedTechnicianId}
                  onSelect={(t) => onAssignTechnician(t ? t.id : null)}
                  onAddTechnician={onAddTechnician}
                  compact
                />
              </>
            ) : (
              <>
                <div style={styles.unassignedHint}>暂未指派师傅</div>
                <TechnicianPicker
                  technicians={technicians}
                  valueId={null}
                  onSelect={(t) => onAssignTechnician(t ? t.id : null)}
                  onAddTechnician={onAddTechnician}
                  compact
                />
              </>
            )}
          </div>

          <div style={styles.sectionBlock}>
            <div style={styles.sectionTitle}>当前状态 / 上门记录</div>
            <div style={styles.statusRow}>
              <div style={styles.sectionLabel}>当前状态</div>
              <div style={styles.statusPills}>
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    style={{
                      ...styles.statusPill,
                      background: s === order.status ? STATUS_STYLE[s].bg : "#fff",
                      color: s === order.status ? STATUS_STYLE[s].fg : "#8FA1A8",
                      borderColor: s === order.status ? STATUS_STYLE[s].dot : "#E2E9E8",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {statusHint && <div style={styles.formErr}>{statusHint}</div>}
            {(order.status === "待上门" || statusHint) && (
              <Field label="预计上门时间">
                <input
                  style={styles.input}
                  type="datetime-local"
                  value={expectedVisitTime}
                  onChange={(e) => setExpectedVisitTime(e.target.value)}
                  onBlur={saveExpectedVisitTime}
                />
                {expectedVisitSaveState === "saving" && <div style={styles.saveStateHint}>保存中…</div>}
                {expectedVisitSaveState === "saved" && <div style={styles.saveStateSuccess}>已保存 ✓</div>}
                {expectedVisitSaveState === "error" && <div style={styles.saveStateError}>保存失败，请重试</div>}
                {!order.expectedVisitTime && <div style={styles.warningHint}>⚠ 未填写预计上门时间</div>}
              </Field>
            )}
            {order.status === "已完成" && (
              <Field label="完工时间">
                <input
                  style={styles.input}
                  type="datetime-local"
                  value={completedAt}
                  onChange={(e) => setCompletedAt(e.target.value)}
                  onBlur={() => onPatch({ completedAt: completedAt ? new Date(completedAt).toISOString() : null })}
                />
              </Field>
            )}
            <div style={styles.timelineSection}>
              <div style={styles.timelineHeader}>
                <div style={styles.sectionLabel}>上门记录（{order.visits.length}）</div>
                {!visitFormMode && (
                  <button style={styles.smallPrimaryBtn} onClick={onOpenNewVisit}>
                    <Plus size={13} /> 登记本次上门
                  </button>
                )}
              </div>

              {visitFormMode && (
                  <VisitForm
                  key={visitFormMode === "new" ? "new" : visitFormMode.id}
                  initialVisit={visitFormMode === "new" ? null : visitFormMode}
                  onCancel={onCancelVisitForm}
                  onSubmit={(v) => {
                    if (visitFormMode === "new") onAddVisit(v);
                    else onUpdateVisit(visitFormMode.id, v);
                  }}
                  visitId={visitFormMode === "new" ? null : visitFormMode.id}
                  orderId={order.id}
                  employees={employees}
                  onCreateExpense={createExpenseRecord}
                  onUpdateExpense={updateExpenseRecord}
                  onDeleteExpense={deleteExpenseRecord}
                  technicians={technicians}
                  onAddTechnician={onAddTechnician}
                />
              )}

              {order.visits.length === 0 && !visitFormMode ? (
                <div style={styles.emptyVisits}>还没有上门记录</div>
              ) : (
                <div style={styles.timeline}>
                  {order.visits.map((v, idx) => {
                    const m = resultMeta(v.resultType);
                    const isEditing = visitFormMode && visitFormMode !== "new" && visitFormMode.id === v.id;
                    const expenseTotal = (v.expenseRecords || []).reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
                    return (
                      <div key={v.id} style={styles.timelineItem}>
                        <div style={styles.timelineRail}>
                          <div style={{ ...styles.timelineNode, borderColor: m.color }} />
                          {idx < order.visits.length - 1 && <div style={styles.timelineLine} />}
                        </div>
                        <div style={styles.timelineContent}>
                          <div style={styles.timelineTop}>
                            <span style={{ color: m.color, fontWeight: 600 }}>第{idx + 1}次 · {m.label}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={styles.timelineDate}>{fmtDate(v.visitTime)}</span>
                              {!isEditing && (
                                <>
                                  <button style={styles.tinyIconBtn} onClick={() => onOpenEditVisit(v)} title="编辑"><Pencil size={12} /></button>
                                  <button style={{ ...styles.tinyIconBtn, color: "#C1443D" }} onClick={() => { if (window.confirm("确定删除这条上门记录吗？")) onDeleteVisit(v.id); }} title="删除"><Trash2 size={12} /></button>
                                </>
                              )}
                            </div>
                          </div>
                          <div style={styles.timelineMaster}><Wrench size={12} /> {v.master}{v.masterPhone ? ` · ${v.masterPhone}` : ""}</div>
                          <div style={styles.serviceRecordMeta}>服务类型：{v.serviceType || "历史上门记录"}</div>
                          {v.serviceContent && <div style={styles.serviceRecordContent}>服务内容：{v.serviceContent}</div>}
                          {expenseTotal > 0 && <div style={styles.serviceRecordCost}>本次支出：¥{expenseTotal}</div>}
                          {v.note && <div style={styles.timelineNote}>{v.note}</div>}
                          <div style={styles.timelineBy}>登记人：{v.createdBy || "—"}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div style={styles.sectionBlock}>
            <div style={styles.sectionTitle}>保险费用</div>
            <ExpenseRecordsEditor
              records={insuranceRecords}
              onChange={(records) => onExpenseRecordsChange([...(order.expenseRecords || []).filter((record) => record.type !== "insurance"), ...records])}
              orderId={order.id}
              employees={employees}
              technicians={technicians}
              fixedType="insurance"
              hideMonthly
              onCreateExpense={onCreateExpense}
              onUpdateExpense={onUpdateExpense}
              onDeleteExpense={onDeleteExpense}
              onUnsettleExpense={onUnsettleExpense}
            />
          </div>

          <div style={styles.sectionBlock}>
            <div style={styles.sectionTitle}><DollarSign size={13} /> 向甲方报价管理</div>
            <div style={styles.moneyRow}>
              {totalCharge > 0 && <div style={styles.moneyChip}>向甲方报价 ¥{totalCharge}</div>}
              <label style={styles.settlementCheckbox}>
                <input type="checkbox" checked={!!order.clientSettled} onChange={onToggleClientSettled} />
                已结算
              </label>
              {order.clientSettled && (
                <button type="button" style={{ ...styles.settleBtn, ...styles.settleBtnDone }} onClick={onToggleClientSettled}>
                  <CircleDollarSign size={12} /> 撤销结算
                </button>
              )}
            </div>
            {order.quoteUpdatedAt && (
              <div style={styles.metaHint}>
                最后修改：{fmtDate(order.quoteUpdatedAt)} · {order.quoteUpdatedBy || "—"}
              </div>
            )}
            <QuoteItemsEditor
              key={order.id + String(order.quoteUpdatedAt || "")}
              initialItems={quoteItems}
              initialNote={order.quoteNote}
              feePresets={feePresets}
              orders={orders}
              onAddPreset={onAddFeePreset}
              onDeletePreset={onDeleteFeePreset}
              onSave={onSaveQuotes}
              locked={!!order.clientSettled}
              onUnlock={() => {
                if (window.confirm("甲方已结算，确认撤销结算并允许修改报价吗？")) onPatch({ clientSettled: false, clientSettledAt: null });
              }}
            />
          </div>

          {store?.requires_construction_permit && (
            <div style={styles.storePermitHint}>⚠️ 本门店通常需要施工证</div>
          )}

          {order.status === "已完成" && (
            <div style={styles.sectionBlock}>
              <div style={styles.sectionTitle}><Camera size={13} /> 验收管理</div>
              <Field label="验工单照片链接（百度云）">
                <input style={styles.input} value={inspectUrl} onChange={(e) => setInspectUrl(e.target.value)} placeholder="https://…" />
              </Field>
              <Field label="清洗前后对比照片链接（百度云）">
                <input style={styles.input} value={compareUrl} onChange={(e) => setCompareUrl(e.target.value)} placeholder="https://…" />
              </Field>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  style={styles.smallPrimaryBtn}
                  onClick={() => onPatch({ inspectionPhotoUrl: inspectUrl.trim(), comparePhotoUrl: compareUrl.trim() })}
                >
                  保存验收链接
                </button>
              </div>
            </div>
          )}

          <div style={styles.dangerZone}>
            <div style={styles.dangerTitle}>危险操作</div>
            <button type="button" style={styles.deleteOrderBtn} onClick={onDeleteOrder}>
              <Trash2 size={14} /> 删除工单
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

function DeleteOrderConfirm({ order, onCancel, onConfirm }) {
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.confirmModal} onClick={(event) => event.stopPropagation()}>
        <div style={styles.confirmTitle}>确认硬删除工单？</div>
        <div style={styles.confirmWarning}>此操作不可恢复，并会同时删除该工单关联的所有服务记录（visits）。</div>
        <div style={styles.confirmInfo}>
          <div>工单号：{order.ticketNo || "—"}</div>
          <div>城市：{order.city || "—"}</div>
          <div>商场：{order.mall || "—"}</div>
          <div>报修时间：{order.reportTime ? fmtDate(order.reportTime) : "—"}</div>
          <div>服务记录：{order.visits?.length || 0} 条</div>
        </div>
        <div style={styles.confirmActions}>
          <button type="button" style={styles.ghostBtn} onClick={onCancel}>取消</button>
          <button type="button" style={styles.confirmDeleteBtn} onClick={onConfirm}>确认不可恢复删除</button>
        </div>
      </div>
    </div>
  );
}

function SearchableCreatable({ label, value, items = [], onChange, onCreate, placeholder }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  const matches = useMemo(() => {
    if (!normalizedQuery) return items;
    return items.filter((item) =>
      item.name.toLowerCase().includes(normalizedQuery) ||
      item.name.toLowerCase().replace(/\s+/g, "").includes(compactQuery) ||
      (item.pinyin_initials || pinyinInitials(item.name)).toLowerCase().replace(/\s+/g, "").includes(compactQuery)
    );
  }, [items, normalizedQuery, compactQuery]);
  const exactMatch = items.some((item) => item.name.trim().toLowerCase() === normalizedQuery);

  async function createNew() {
    const name = query.trim();
    if (!name) return;
    const item = await onCreate(name);
    if (item) {
      setQuery(item.name);
      onChange(item.name);
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} style={styles.searchableWrap}>
      <input
        style={styles.input}
        value={query}
        placeholder={placeholder || label}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <div style={styles.searchableMenu}>
            {matches.map((item) => (
              <button
                type="button"
                key={item.id}
                style={styles.searchableItem}
                onClick={() => {
                  setQuery(item.name);
                  onChange(item.name);
                  setOpen(false);
                }}
              >
                <span>{item.name}</span>
                <span style={styles.searchablePinyin}>{item.pinyin_initials || pinyinInitials(item.name)}</span>
              </button>
            ))}
            {query.trim() && !exactMatch && (
              <button type="button" style={styles.searchableCreate} onClick={createNew}>
                + 新增“{query.trim()}”
              </button>
            )}
            {!matches.length && !query.trim() && <div style={styles.searchableEmpty}>暂无词条</div>}
            {!matches.length && query.trim() && exactMatch === false && <div style={styles.searchableEmpty}>没有匹配词条，可点击上方新增</div>}
        </div>
      )}
    </div>
  );
}

function CityInput({ value, cities = [], onChange, onCreate = async () => null }) {
  return <SearchableCreatable label="城市" value={value} items={cities} onChange={onChange} onCreate={onCreate} placeholder="搜索或输入城市，如上海 / sh" />;
}

function QuoteItemsEditor({ initialItems, initialNote = "", feePresets, orders, onAddPreset, onDeletePreset, onSave, locked = false, onUnlock }) {
  const [items, setItems] = useState(() => (initialItems || []).map((it) => ({ ...it })));
  const [note, setNote] = useState(initialNote || "");
  const [label, setLabel] = useState("");
  const [qty, setQty] = useState("1");
  const [chargeUnit, setChargeUnit] = useState("");

  const hints = useMemo(() => searchPriceHistory(orders, label, 5), [orders, label]);

  function addLine(l, q, cu) {
    const row = {
      label: l,
      qty: Number(q) || 1,
      chargeUnit: Number(cu) || 0,
    };
    setItems((prev) => [...prev, row]);
  }

  function updateRow(idx, patch) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  const chargeTotal = itemsChargeTotal(items);

  return (
    <div>
      {!locked && feePresets.length > 0 && (
        <div style={styles.feePresetRow}>
          {feePresets.map((p) => {
            const cu = p.charge_unit ?? (p.kind === "charge" ? p.amount : 0) ?? 0;
            return (
              <span key={p.id} style={styles.feePresetChip}>
                <button type="button" style={styles.feePresetChipBtn} onClick={() => addLine(p.label, 1, cu)}>
                  {p.label} ¥{cu || 0}
                </button>
                <button type="button" style={styles.feePresetDeleteBtn} onClick={() => onDeletePreset(p.id)} title="删除快捷标签">
                  <X size={11} />
                </button>
              </span>
            );
          })}
        </div>
      )}
      {!locked && <div style={styles.quoteAddGrid}>
        <input style={styles.input} placeholder="项目名，如：清洗" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input style={styles.input} type="number" placeholder="数量" value={qty} onChange={(e) => setQty(e.target.value)} />
        <input style={styles.input} type="number" placeholder="甲方单价" value={chargeUnit} onChange={(e) => setChargeUnit(e.target.value)} />
        <button
          style={styles.smallPrimaryBtn}
          onClick={async () => {
            if (!label.trim()) return;
            addLine(label.trim(), qty, chargeUnit);
            await onAddPreset(label.trim(), Number(chargeUnit) || 0);
            setLabel("");
            setQty("1");
            setChargeUnit("");
          }}
        >
          <Plus size={12} /> 添加
        </button>
      </div>}
      {hints.length > 0 && (
        <div style={styles.priceRefBox}>
          <div style={styles.priceRefTitle}>历史参考（同一项目的甲方价）</div>
          {hints.map((r, i) => (
            <div key={i} style={styles.priceRefRow}>
              <span>{r.city ? `${r.city}·` : ""}{r.mall} · {r.label}</span>
              <span>甲 ¥{r.chargeUnit}</span>
              <span style={{ color: "#B7C4C2" }}>{fmtDate(r.date)}</span>
            </div>
          ))}
        </div>
      )}
      {items.length > 0 && (
        <div style={styles.feeItemsList}>
          {items.map((it, idx) => (
            <div key={idx} style={styles.quoteItemRow}>
              <input
                style={{ ...styles.input, flex: 1.4 }}
                value={it.label}
                onChange={(e) => updateRow(idx, { label: e.target.value })}
                disabled={locked}
                readOnly={locked}
              />
              <input
                style={{ ...styles.input, width: 52 }}
                type="number"
                value={it.qty}
                onChange={(e) => updateRow(idx, { qty: Number(e.target.value) || 0 })}
                disabled={locked}
                readOnly={locked}
              />
              <input
                style={{ ...styles.input, width: 72 }}
                type="number"
                value={it.chargeUnit}
                onChange={(e) => updateRow(idx, { chargeUnit: Number(e.target.value) || 0 })}
                disabled={locked}
                readOnly={locked}
              />
              <span style={styles.quoteSub}>合计 ¥{lineCharge(it)}</span>
              <button disabled={locked} style={styles.tinyIconBtn} onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}>
                <X size={12} />
              </button>
            </div>
          ))}
          <div style={styles.feeTotalRow}>
            向甲方报价合计 ¥{chargeTotal}
          </div>
        </div>
      )}
      <div style={styles.quoteNoteField}>
        <label style={styles.quoteNoteLabel}>报价备注（选填）</label>
        <textarea
          style={styles.quoteNoteInput}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="填写整单报价备注"
          disabled={locked}
          readOnly={locked}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        {locked ? <button type="button" style={styles.ghostBtn} onClick={onUnlock}>撤销甲方结算后修改</button> : <button style={styles.primaryBtn} onClick={() => onSave(items, note.trim())}>保存报价</button>}
      </div>
    </div>
  );
}

const EXPENSE_TYPE_LABELS = {
  technician_fee: "师傅费用",
  insurance: "保险费",
  other: "其他",
};

const EXPENSE_TYPE_STYLES = {
  technician_fee: { background: "#E3F0F1", color: "#145560" },
  insurance: { background: "#FBEEDD", color: "#A5661A" },
  other: { background: "#EDEFEE", color: "#4C6169" },
};

function ExpenseRecordsEditor({ records, onChange, visitId, orderId, employees = [], technicians = [], fixedType, hideMonthly = false, onCreateExpense, onUpdateExpense, onDeleteExpense, onUnsettleExpense }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(() => emptyExpenseRecord());

  function emptyExpenseRecord() {
    return {
      type: fixedType || "technician_fee",
      label: fixedType === "insurance" ? "保险费" : "",
      qty: 1,
      unitPrice: "",
      paymentMethod: null,
      payerName: "",
      isSettled: false,
      settledAt: null,
      notes: "",
    };
  }

  function beginNew() {
    setEditingId("new");
    setDraft(emptyExpenseRecord());
  }

  function beginEdit(record) {
    setEditingId(record.id);
    setDraft({ ...record, qty: record.qty ?? 1, unitPrice: record.unitPrice ?? "", payerName: record.payerName || "", notes: record.notes || "" });
  }

  function updateDraft(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function saveDraft() {
    if (!draft.label.trim() || draft.unitPrice === "") return;
    if (draft.paymentMethod === "advance" && !draft.payerName.trim()) return;
    const next = {
      ...draft,
      type: fixedType || "technician_fee",
      orderId: orderId || draft.orderId || null,
      technicianId: draft.technicianId || null,
      label: draft.label.trim(),
      qty: Number(draft.qty) || 0,
      unitPrice: Number(draft.unitPrice) || 0,
      amount: (Number(draft.qty) || 0) * (Number(draft.unitPrice) || 0),
      payerName: draft.paymentMethod === "advance" ? draft.payerName.trim() : "",
      settledAt: draft.isSettled ? (draft.settledAt || new Date().toISOString()) : null,
      notes: draft.notes.trim(),
    };
    const save = editingId === "new"
      ? ((visitId || orderId) ? onCreateExpense(visitId || null, next, orderId || null) : Promise.resolve(next))
      : ((visitId || orderId) ? onUpdateExpense(editingId, next) : Promise.resolve({ ...records.find((record) => record.id === editingId), ...next }));
    save.then((saved) => {
      onChange(editingId === "new" ? [...records, saved] : records.map((record) => (record.id === editingId ? saved : record)));
      setEditingId(null);
    }).catch(() => {});
  }

  function removeRecord(id) {
    if (visitId || orderId) {
      onDeleteExpense(id).then(() => onChange(records.filter((record) => record.id !== id))).catch(() => {});
    } else {
      onChange(records.filter((record) => record.id !== id));
    }
  }

  const draftAmount = (Number(draft.qty) || 0) * (Number(draft.unitPrice) || 0);
  const total = records.reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
  const editingRecord = records.find((record) => record.id === editingId);
  const amountLocked = !!editingRecord?.isSettled;

  return (
    <Field label={fixedType === "insurance" ? "保险费用" : "本次支出"}>
      {records.length > 0 && (
        <div style={styles.expenseList}>
          {records.map((record) => (
            <div key={record.id || `${record.label}-${record.amount}`} style={styles.expenseRow}>
              <div style={styles.expenseMain}>
                {fixedType === "insurance" && (
                  <span style={{ ...styles.expenseType, ...EXPENSE_TYPE_STYLES[record.type] }}>{EXPENSE_TYPE_LABELS[record.type] || "其他"}</span>
                )}
                <strong>{record.label}</strong>
                <span>{record.qty} × ¥{record.unitPrice} = ¥{record.amount}</span>
                <span>{record.paymentMethod === "advance" ? `员工垫付：${record.payerName || "未填写"}` : record.paymentMethod === "monthly_settlement" ? "月结" : "待定"}</span>
                <span style={record.isSettled ? styles.expenseSettled : styles.expenseUnsettled}>
                  {record.isSettled ? `已结清${record.settledAt ? ` · ${fmtDate(record.settledAt)}` : ""}` : "未结清"}
                </span>
                {record.notes && <span style={styles.expenseNote}>{record.notes}</span>}
              </div>
              <div style={styles.expenseActions}>
                <button type="button" style={styles.tinyIconBtn} onClick={() => beginEdit(record)} title="编辑"><Pencil size={12} /></button>
                <button type="button" style={{ ...styles.tinyIconBtn, color: "#C1443D" }} onClick={() => removeRecord(record.id)} title="删除"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
          <div style={styles.serviceCostTotal}>本次支出小计：¥{total}</div>
        </div>
      )}
      {editingId && (
        <div style={styles.expenseEditor}>
          <div style={styles.expenseFormGrid}>
            {fixedType && <div style={{ ...styles.input, background: "#F4F7F6" }}>{EXPENSE_TYPE_LABELS[fixedType]}</div>}
            <input style={styles.input} value={draft.label} onChange={(e) => updateDraft("label", e.target.value)} placeholder="费用名称" />
            <input style={styles.input} type="number" min="0" value={draft.qty} onChange={(e) => updateDraft("qty", e.target.value)} placeholder="数量" disabled={amountLocked} readOnly={amountLocked} />
            <input style={styles.input} type="number" min="0" value={draft.unitPrice} onChange={(e) => updateDraft("unitPrice", e.target.value)} placeholder="单价" disabled={amountLocked} readOnly={amountLocked} />
            <span style={styles.expenseAmountPreview}>金额 ¥{draftAmount}</span>
          </div>
          <div style={styles.expensePaymentRow}>
            <label><input type="radio" checked={draft.paymentMethod === null} onChange={() => { updateDraft("paymentMethod", null); updateDraft("isSettled", false); }} /> 待定</label>
            <label><input type="radio" checked={draft.paymentMethod === "advance"} onChange={() => { updateDraft("paymentMethod", "advance"); updateDraft("isSettled", true); }} /> 员工垫付</label>
            {!hideMonthly && <label><input type="radio" checked={draft.paymentMethod === "monthly_settlement"} onChange={() => { updateDraft("paymentMethod", "monthly_settlement"); updateDraft("isSettled", false); }} /> 月结</label>}
            {draft.paymentMethod === "advance" && (
              <select
                style={{ ...styles.input, width: 180 }}
                value={draft.payerName}
                onChange={(e) => updateDraft("payerName", e.target.value)}
                required
              >
                <option value="">选择垫付人 *</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.name}>{employee.name}</option>
                ))}
              </select>
            )}
            {fixedType === "insurance" && (
              <select style={{ ...styles.input, width: 180 }} value={draft.technicianId || ""} onChange={(e) => updateDraft("technicianId", e.target.value || null)}>
                <option value="">关联师傅（选填）</option>
                {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}
              </select>
            )}
            <label><input type="checkbox" checked={draft.paymentMethod === "advance" ? true : !!draft.isSettled} disabled={draft.paymentMethod !== "monthly_settlement"} onChange={(e) => updateDraft("isSettled", e.target.checked)} /> 已结清</label>
          </div>
          <input style={styles.input} value={draft.notes} onChange={(e) => updateDraft("notes", e.target.value)} placeholder="备注（选填）" />
          <div style={styles.expenseEditorActions}>
            {amountLocked && <button type="button" style={styles.ghostBtn} onClick={() => { if (window.confirm("该费用已结清，确认撤销结清并允许修改金额吗？")) onUnsettleExpense(editingId).then((saved) => { onChange(records.map((record) => record.id === editingId ? saved : record)); }).catch(() => {}); }}>撤销结清</button>}
            <button type="button" style={styles.ghostBtn} onClick={() => setEditingId(null)}>取消</button>
            <button type="button" style={styles.smallPrimaryBtn} onClick={saveDraft}>保存费用</button>
          </div>
        </div>
      )}
      {!editingId && <button type="button" style={styles.smallPrimaryBtn} onClick={beginNew}><Plus size={12} /> 新增支出</button>}
    </Field>
  );
}

function VisitForm({ initialVisit, onCancel, onSubmit, technicians, employees = [], orderId, onAddTechnician, onCreateExpense, onUpdateExpense, onDeleteExpense, onUnsettleExpense }) {
  const initTech = initialVisit ? technicians.find((t) => t.id === initialVisit.technicianId) : null;
  const [technician, setTechnician] = useState(initTech || null);
  const [serviceType, setServiceType] = useState(initialVisit?.serviceType || "");
  const [serviceContent, setServiceContent] = useState(initialVisit?.serviceContent || "");
  const [expenseRecords, setExpenseRecords] = useState(() => (initialVisit?.expenseRecords || []).map((record) => ({ ...record })));
  const [masterPhone, setMasterPhone] = useState(initialVisit?.masterPhone || "");
  const [freeMasterName, setFreeMasterName] = useState(initialVisit && !initTech ? initialVisit.master : "");
  const [visitTime, setVisitTime] = useState(() => {
    const base = initialVisit ? new Date(initialVisit.visitTime) : new Date();
    base.setMinutes(base.getMinutes() - base.getTimezoneOffset());
    return base.toISOString().slice(0, 16);
  });
  const [resultType, setResultType] = useState(initialVisit?.resultType || "scheduled");
  const [note, setNote] = useState(initialVisit?.note || "");
  const [err, setErr] = useState("");

  function submit() {
    const masterName = technician ? technician.name : freeMasterName.trim();
    if (!masterName) {
      setErr("请选择或填写师傅");
      return;
    }
    onSubmit({
      master: masterName,
      masterPhone: masterPhone.trim(),
      technicianId: technician?.id || null,
      serviceType: serviceType.trim(),
      serviceContent: serviceContent.trim(),
      visitTime: new Date(visitTime).toISOString(),
      resultType,
      expenseRecords,
      note: note.trim(),
    });
  }

  return (
    <div style={styles.visitForm}>
      <div style={styles.formRow2}>
        <Field label="师傅">
          <TechnicianPicker
            technicians={technicians}
            valueId={technician?.id}
            onSelect={(t) => {
              setTechnician(t);
              setMasterPhone(t?.phone || "");
              if (!t) setFreeMasterName("");
            }}
            onAddTechnician={onAddTechnician}
          />
        </Field>
        <Field label="师傅电话">
          <input style={styles.input} value={masterPhone} onChange={(e) => setMasterPhone(e.target.value)} placeholder="选填" />
        </Field>
      </div>
      {!technician && (
        <Field label="师傅姓名（名单外）">
          <input style={styles.input} value={freeMasterName} onChange={(e) => setFreeMasterName(e.target.value)} />
        </Field>
      )}
      <Field label="服务类型">
        <input style={styles.input} value={serviceType} onChange={(e) => setServiceType(e.target.value)} placeholder="如：上门检查 / 维修 / 复查" />
      </Field>
      <Field label="服务内容">
        <textarea style={{ ...styles.input, minHeight: 60, resize: "vertical" }} value={serviceContent} onChange={(e) => setServiceContent(e.target.value)} placeholder="记录本次实际服务内容" />
      </Field>
      <Field label="上门时间">
        <input style={styles.input} type="datetime-local" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} />
      </Field>
      <ExpenseRecordsEditor
        records={expenseRecords}
        onChange={setExpenseRecords}
        visitId={initialVisit?.id}
        orderId={orderId}
        employees={employees}
        onCreateExpense={onCreateExpense}
        onUpdateExpense={onUpdateExpense}
        onDeleteExpense={onDeleteExpense}
        onUnsettleExpense={onUnsettleExpense}
      />
      <Field label="处理结果">
        <div style={styles.resultChips}>
          {RESULT_TYPES.map((r) => {
            const active = resultType === r.key;
            return (
              <button
                key={r.key}
                onClick={() => setResultType(r.key)}
                style={{
                  ...styles.resultChip,
                  borderColor: active ? r.color : "#E2E9E8",
                  background: active ? `${r.color}14` : "#fff",
                  color: active ? r.color : "#4C6169",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="备注 / 处理详情">
        <textarea
          style={{ ...styles.input, minHeight: 60, resize: "vertical" }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      {err && <div style={styles.formErr}>{err}</div>}
      <div style={styles.formActions}>
        <button style={styles.primaryBtn} onClick={submit}>{initialVisit ? "保存修改" : "保存记录"}</button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={styles.fieldLabel}>{label}</div>
      {children}
    </div>
  );
}

function NewOrderModal({ onClose, onSubmit, orders, clients, employees, technicians = [], cities = [], brands = [], stores = [], onCreateCity, onCreateBrand, onAddTechnician, onAddClient, onAddEmployee, onFindStore, onCreateStore }) {
  const [city, setCity] = useState("");
  const [mall, setMall] = useState("");
  const [brand, setBrand] = useState("");
  const [storeName, setStoreName] = useState("");
  const [selectedStore, setSelectedStore] = useState(null);
  const [storeMessage, setStoreMessage] = useState("");
  const [showStoreForm, setShowStoreForm] = useState(false);
  const [storeAddress, setStoreAddress] = useState("");
  const [storeContactName, setStoreContactName] = useState("");
  const [storeContactPhone, setStoreContactPhone] = useState("");
  const [storeRequirements, setStoreRequirements] = useState("");
  const [storeNotes, setStoreNotes] = useState("");
  const [assignedTechnicianId, setAssignedTechnicianId] = useState(null);
  const [status, setStatus] = useState("待核实");
  const [expectedVisitTime, setExpectedVisitTime] = useState("");
  const [clientId, setClientId] = useState("");
  const [followerId, setFollowerId] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [issueDesc, setIssueDesc] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [relatedOrderId, setRelatedOrderId] = useState(null);
  const [reportTime, setReportTime] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!city.trim() || !brand.trim() || !mall.trim()) {
      setSelectedStore(null);
      setStoreMessage("");
      setStoreName("");
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const store = await onFindStore(city, brand, mall);
        if (cancelled) return;
        setSelectedStore(store);
        setStoreName(store?.store_name || generateStoreName(city.trim(), brand.trim(), mall.trim()));
        setStoreMessage(store ? "已找到历史门店" : "未找到对应门店");
      } catch (e) {
        if (!cancelled) setStoreMessage("门店查询失败，请稍后重试");
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [city, brand, mall, onFindStore]);

  async function submit() {
    if (!mall.trim() || !issueDesc.trim()) {
      setErr("请至少填写商场名称和故障描述");
      return;
    }
    setSubmitting(true);
    await onSubmit({
      city: city.trim(),
      mall: mall.trim(),
      brand: brand.trim(),
      assignedTechnicianId,
      status,
      expectedVisitTime: expectedVisitTime ? new Date(expectedVisitTime).toISOString() : null,
      clientId: clientId || null,
      followerId: followerId || null,
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      issueDesc: issueDesc.trim(),
      address: address.trim(),
      notes: notes.trim(),
      reportTime: new Date(reportTime).toISOString(),
      relatedOrderId,
      storeId: selectedStore?.id || null,
    });
    setSubmitting(false);
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>新建工单</span>
          <button style={styles.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={styles.modalBody}>
          <div style={styles.newOrderLocationGrid}>
            <Field label="城市">
              <CityInput value={city} cities={cities} onChange={setCity} onCreate={onCreateCity} />
            </Field>
            <Field label="商场 *">
              <input style={styles.input} value={mall} onChange={(e) => setMall(e.target.value)} placeholder="如：断桥万达" />
            </Field>
            <Field label="品牌方">
              <SearchableCreatable label="品牌方" value={brand} items={brands} onChange={setBrand} onCreate={onCreateBrand} placeholder="搜索或输入品牌，如格力 / gl" />
            </Field>
          </div>
          {storeMessage && (
            <div style={styles.storeMatchBox}>
              <div style={styles.storeMatchTitle}>{storeMessage}</div>
              {selectedStore ? (
                <>
                  <div>🏪 {selectedStore.city} · {selectedStore.brand} · {selectedStore.mall} · {selectedStore.store_name}</div>
                  <input style={styles.input} value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="门店名称" />
                  {selectedStore.special_requirements && <div style={styles.storeWarning}>⚠️ 门店特殊要求：{selectedStore.special_requirements}</div>}
                  {selectedStore.notes && <div>备注：{selectedStore.notes}</div>}
                  <button type="button" style={styles.smallPrimaryBtn} onClick={() => setStoreMessage("已选择历史门店")}>继续使用该门店</button>
                </>
              ) : (
                <>
                  <input style={styles.input} value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="门店名称" />
                  <button type="button" style={styles.smallPrimaryBtn} onClick={() => setShowStoreForm((value) => !value)}>＋ 新建门店</button>
                  {showStoreForm && (
                    <div style={styles.storeFormBox}>
                      <input style={styles.input} value={storeAddress} onChange={(e) => setStoreAddress(e.target.value)} placeholder="门店地址" />
                      <input style={styles.input} value={storeContactName} onChange={(e) => setStoreContactName(e.target.value)} placeholder="联系人" />
                      <input style={styles.input} value={storeContactPhone} onChange={(e) => setStoreContactPhone(e.target.value)} placeholder="联系电话" />
                      <textarea style={styles.input} value={storeRequirements} onChange={(e) => setStoreRequirements(e.target.value)} placeholder="特殊要求" />
                      <textarea style={styles.input} value={storeNotes} onChange={(e) => setStoreNotes(e.target.value)} placeholder="备注" />
                      <button type="button" style={styles.smallPrimaryBtn} onClick={async () => {
                        if (!city.trim() || !brand.trim() || !mall.trim() || !storeName.trim()) return;
                        try {
                          const store = await onCreateStore({ city: city.trim(), brand: brand.trim(), mall: mall.trim(), store_name: storeName.trim(), address: storeAddress.trim() || null, contact_name: storeContactName.trim() || null, contact_phone: storeContactPhone.trim() || null, special_requirements: storeRequirements.trim() || null, notes: storeNotes.trim() || null });
                          setSelectedStore(store);
                          setStoreMessage("已创建并选择门店");
                          setShowStoreForm(false);
                        } catch (e) {
                          setErr("创建门店失败：" + (e.message || "未知错误"));
                        }
                      }}>保存并使用门店</button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <div style={styles.newOrderPartyGrid}>
            <Field label="甲方公司">
              <NamePicker items={clients} valueId={clientId} onSelect={setClientId} onAdd={onAddClient} placeholder="选择甲方…" />
            </Field>
            <Field label="跟单人">
              <NamePicker items={employees} valueId={followerId} onSelect={setFollowerId} onAdd={onAddEmployee} placeholder="选择跟单人…" />
            </Field>
          </div>
          <div style={styles.formRow2}>
            <Field label="现场联系人">
              <input style={styles.input} value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </Field>
            <Field label="联系电话">
              <input style={styles.input} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </Field>
          </div>
          <Field label="报修时间">
            <input style={styles.input} type="datetime-local" value={reportTime} onChange={(e) => setReportTime(e.target.value)} />
          </Field>
          <Field label="详细地址（选填）">
            <input style={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="关联历史工单（选填）">
            <RelatedOrderField orders={orders} currentId={null} valueId={relatedOrderId} onChange={setRelatedOrderId} />
          </Field>
          <Field label="故障描述 *">
            <textarea style={{ ...styles.input, minHeight: 70, resize: "vertical" }} value={issueDesc} onChange={(e) => setIssueDesc(e.target.value)} />
          </Field>
          <Field label="指派师傅">
            <TechnicianPicker
              technicians={technicians}
              valueId={assignedTechnicianId}
              onSelect={(t) => setAssignedTechnicianId(t ? t.id : null)}
              onAddTechnician={onAddTechnician}
            />
          </Field>
          <Field label="当前状态">
            <div style={styles.statusPills}>
              {STATUSES.map((s) => (
                <button key={s} type="button" style={{ ...styles.statusPill, ...(status === s ? styles.chipOn : {}) }} onClick={() => setStatus(s)}>{s}</button>
              ))}
            </div>
          </Field>
          {(status === "待派工" || status === "待上门") && (
            <Field label="预计上门时间">
              <input
                style={styles.input}
                type="datetime-local"
                value={expectedVisitTime}
                onChange={(e) => setExpectedVisitTime(e.target.value)}
              />
            </Field>
          )}
          <Field label="备注（选填）">
            <textarea style={{ ...styles.input, minHeight: 50, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {err && <div style={styles.formErr}>{err}</div>}
          <div style={styles.formActions}>
            <button style={styles.ghostBtn} onClick={onClose}>取消</button>
            <button style={styles.primaryBtn} onClick={submit} disabled={submitting}>
              {submitting ? "创建中…" : "创建工单"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "28px 32px", maxWidth: 1200 },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 },
  headerActions: { display: "flex", alignItems: "center", gap: 8 },
  exportWrap: { position: "relative" },
  exportBtn: { background: "#F4F7F6", color: "#145560", border: "1px solid #1F7A8C55", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 600 },
  exportMenu: { position: "absolute", right: 0, top: "calc(100% + 6px)", width: 180, background: "#fff", border: "1px solid #E2E9E8", borderRadius: 8, boxShadow: "0 8px 20px rgba(18,32,36,0.12)", zIndex: 10, overflow: "hidden" },
  exportDateRow: { display: "flex", alignItems: "center", gap: 4, padding: "8px 10px", color: "#8FA1A8", fontSize: 11 },
  exportDateInput: { minWidth: 0, width: 70, border: "1px solid #E2E9E8", borderRadius: 6, padding: "5px 3px", fontSize: 10 },
  exportMenuItem: { display: "block", width: "100%", padding: "9px 11px", border: "none", borderBottom: "1px solid #F0F3F2", background: "#fff", color: "#16262B", textAlign: "left", fontSize: 12 },
  timeFilterWrap: { position: "relative" },
  timeFilterButton: { background: "#F4F7F6", color: "#145560", border: "1px solid #1F7A8C55", borderRadius: 8, padding: "7px 10px", fontSize: 12, fontWeight: 600 },
  timeFilterPanel: { position: "absolute", left: 0, top: "calc(100% + 6px)", width: 220, padding: 12, background: "#fff", border: "1px solid #E2E9E8", borderRadius: 9, boxShadow: "0 8px 20px rgba(18,32,36,0.12)", zIndex: 10 },
  timeFilterField: { display: "flex", flexDirection: "column", gap: 5, marginBottom: 10, color: "#4C6169", fontSize: 11.5, fontWeight: 600 },
  exportMonthInput: { width: "100%", border: "1px solid #E2E9E8", borderRadius: 6, padding: "6px 7px", background: "#F4F7F6", color: "#16262B", fontSize: 12, marginBottom: 10 },
  timeFilterActions: { display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 4 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22 },
  subtitle: { fontSize: 12.5, color: "#8FA1A8", marginTop: 4 },
  primaryBtn: { display: "flex", alignItems: "center", gap: 6, background: "#1F7A8C", color: "#fff", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 600 },
  smallPrimaryBtn: { display: "flex", alignItems: "center", gap: 5, background: "#1F7A8C", color: "#fff", border: "none", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 600 },
  ghostBtn: { background: "#fff", color: "#4C6169", border: "1px solid #E2E9E8", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600 },
  errorBar: { background: "#F6E7E6", color: "#A23931", fontSize: 12.5, padding: "10px 14px", borderRadius: 8, display: "flex", alignItems: "center", gap: 6, marginBottom: 12 },
  successBar: { background: "#E4F3E9", color: "#2C6B45", fontSize: 12.5, padding: "10px 14px", borderRadius: 8, marginBottom: 12 },
  filterBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 18, flexWrap: "wrap" },
  tabs: { display: "flex", gap: 6, flexWrap: "wrap" },
  tab: { display: "flex", alignItems: "center", gap: 5, background: "#F4F7F6", border: "1px solid transparent", borderRadius: 7, padding: "6px 10px", fontSize: 12.5, color: "#4C6169", fontWeight: 500 },
  tabActive: { background: "#E3F0F1", borderColor: "#1F7A8C55", color: "#145560", fontWeight: 700 },
  tabCount: { color: "#8FA1A8", fontSize: 11 },
  dot: { width: 6, height: 6, borderRadius: "50%", display: "inline-block" },
  searchBox: { display: "flex", alignItems: "center", gap: 6, background: "#F4F7F6", border: "1px solid #E2E9E8", borderRadius: 8, padding: "7px 10px", minWidth: 260 },
  searchInput: { border: "none", background: "transparent", outline: "none", fontSize: 12.5, width: "100%", color: "#16262B" },
  filterSelectLabel: { display: "flex", alignItems: "center", gap: 6, color: "#4C6169", fontSize: 12, whiteSpace: "nowrap" },
  filterSelect: { border: "1px solid #E2E9E8", borderRadius: 7, background: "#F4F7F6", color: "#4C6169", padding: "6px 8px", fontSize: 12 },
  centerState: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0" },
  groupList: { display: "flex", flexDirection: "column", gap: 18, paddingBottom: 32 },
  dateGroup: { background: "#F9FAFA", border: "1px solid #E2E9E8", borderRadius: 10, overflow: "hidden" },
  dateGroupHeader: { padding: "10px 14px", borderBottom: "1px solid #E2E9E8", background: "#fff", color: "#145560", fontSize: 14, fontWeight: 700 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, paddingBottom: 32 },
  card: { textAlign: "left", background: "#fff", border: "1px solid #E2E9E8", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 6 },
  cardTop: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  ticketNo: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: "#8FA1A8", letterSpacing: "0.02em" },
  statusBadge: { display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20 },
  cardMall: { fontWeight: 700, fontSize: 14.5, color: "#16262B" },
  cardCity: { fontWeight: 600, color: "#1F7A8C" },
  cardBrand: { fontWeight: 700, color: "#16262B", fontSize: 14.5 },
  cardIssue: { fontSize: 12.5, color: "#4C6169", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
  cardMetaRow: { display: "flex", gap: 12, marginTop: 2, flexWrap: "wrap" },
  completedTimeBadge: { display: "inline-flex", alignItems: "center", gap: 4, background: "#E4F3E9", border: "1px solid #3E8F6380", color: "#2C6B45", borderRadius: 7, padding: "5px 8px", fontSize: 11.5, fontWeight: 700 },
  cardMeta: { display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#8FA1A8" },
  timeoutAlert: { color: "#A23931", background: "#F6E7E6", borderRadius: 7, padding: "5px 8px", fontSize: 11.5, fontWeight: 700 },
  saveStateHint: { color: "#8FA1A8", fontSize: 11.5, marginTop: 5 },
  saveStateSuccess: { color: "#2C6B45", fontSize: 11.5, marginTop: 5 },
  saveStateError: { color: "#A23931", fontSize: 11.5, marginTop: 5 },
  lastVisitRow: { display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, borderTop: "1px dashed #E2E9E8", paddingTop: 7, marginTop: 2 },
  overlay: { position: "fixed", inset: 0, background: "rgba(18,32,36,0.35)", display: "flex", justifyContent: "flex-end", zIndex: 50, animation: "fadeIn .15s ease" },
  panel: { width: 540, maxWidth: "100%", background: "#F9FAFA", height: "100%", display: "flex", flexDirection: "column", animation: "slideIn .2s ease", boxShadow: "-8px 0 24px rgba(0,0,0,0.08)" },
  panelHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "18px 20px", background: "#fff", borderBottom: "1px solid #E2E9E8" },
  ticketNoLg: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#8FA1A8" },
  panelMall: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18, marginTop: 2 },
  iconBtn: { background: "#F4F7F6", border: "none", borderRadius: 8, padding: 6, display: "flex", color: "#4C6169" },
  panelBody: { flex: 1, overflowY: "auto", padding: 20 },
  sectionBlock: { background: "#fff", border: "1px solid #E2E9E8", borderRadius: 10, padding: 12, marginBottom: 14 },
  sectionTitle: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#145560", marginBottom: 10 },
  relatedLinkChip: { display: "inline-flex", alignItems: "center", gap: 5, background: "#E3F0F1", color: "#145560", border: "1px solid #1F7A8C40", borderRadius: 20, padding: "5px 11px", fontSize: 11.5, fontWeight: 600 },
  moneyRow: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 },
  moneyChip: { fontSize: 11.5, fontWeight: 700, background: "#F4F7F6", color: "#4C6169", padding: "5px 10px", borderRadius: 20 },
  settleBtn: { display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, background: "#FBEEDD", color: "#A5661A", border: "none", padding: "5px 10px", borderRadius: 20 },
  settleBtnDone: { background: "#E4F3E9", color: "#2C6B45" },
  settlementCheckbox: { display: "inline-flex", alignItems: "center", gap: 5, color: "#4C6169", fontSize: 12, fontWeight: 600 },
  settlementBadge: { display: "inline-flex", alignItems: "center", borderRadius: 12, padding: "3px 7px", fontSize: 10.5, fontWeight: 700 },
  settlementBadgeDone: { background: "#E4F3E9", color: "#2C6B45" },
  settlementBadgePending: { background: "#FBEEDD", color: "#A5661A" },
  metaHint: { fontSize: 11, color: "#8FA1A8", marginBottom: 8 },
  chipRow: { display: "flex", flexWrap: "wrap", gap: 6 },
  chipOn: { background: "#E3F0F1", borderColor: "#1F7A8C", color: "#145560" },
  cityChip: { border: "1px solid #E2E9E8", background: "#fff", borderRadius: 16, padding: "4px 10px", fontSize: 12, fontWeight: 600, color: "#4C6169" },
  searchableWrap: { position: "relative", zIndex: 3 },
  searchableBackdrop: { position: "fixed", inset: 0, border: "none", background: "transparent", zIndex: -1 },
  searchableMenu: { position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", background: "#fff", border: "1px solid #E2E9E8", borderRadius: 8, boxShadow: "0 8px 20px rgba(18,32,36,0.12)", overflow: "hidden", zIndex: 4 },
  searchableItem: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", border: "none", borderBottom: "1px solid #F0F3F2", background: "#fff", padding: "8px 10px", textAlign: "left", color: "#16262B", fontSize: 12.5 },
  searchablePinyin: { color: "#8FA1A8", fontSize: 11 },
  searchableCreate: { width: "100%", border: "none", background: "#E3F0F1", color: "#145560", padding: "9px 10px", textAlign: "left", fontSize: 12.5, fontWeight: 600 },
  searchableEmpty: { padding: "9px 10px", color: "#8FA1A8", fontSize: 12 },
  assignedTechInfo: { background: "#F4F7F6", borderRadius: 8, padding: "9px 10px", marginBottom: 8 },
  assignedTechName: { fontSize: 13.5, fontWeight: 700, color: "#16262B", marginBottom: 5 },
  assignedTechMeta: { display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "#4C6169", marginTop: 3 },
  unassignedHint: { fontSize: 12.5, color: "#8FA1A8", marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: "#8FA1A8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 },
  statusRow: { marginBottom: 18 },
  statusPills: { display: "flex", flexWrap: "wrap", gap: 6 },
  statusPill: { border: "1px solid", borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 600 },
  timelineSection: { marginTop: 4 },
  timelineHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  emptyVisits: { fontSize: 12.5, color: "#8FA1A8", background: "#fff", border: "1px dashed #E2E9E8", borderRadius: 9, padding: 16, textAlign: "center" },
  warningHint: { color: "#A5661A", background: "#FBEEDD", borderRadius: 7, padding: "6px 8px", marginTop: 6, fontSize: 11.5 },
  timeline: { display: "flex", flexDirection: "column" },
  timelineItem: { display: "flex", gap: 12 },
  timelineRail: { display: "flex", flexDirection: "column", alignItems: "center" },
  timelineNode: { width: 12, height: 12, borderRadius: "50%", background: "#fff", border: "2px solid", flexShrink: 0, marginTop: 5 },
  timelineLine: { width: 2, flex: 1, background: "#DCE4E3", minHeight: 24 },
  timelineContent: { flex: 1, paddingBottom: 18 },
  timelineTop: { display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12.5 },
  timelineDate: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#8FA1A8" },
  timelineMaster: { display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#4C6169", marginTop: 3 },
  serviceRecordMeta: { fontSize: 11.5, color: "#4C6169", marginTop: 5 },
  serviceRecordContent: { fontSize: 12, color: "#16262B", lineHeight: 1.45, marginTop: 4 },
  serviceRecordCost: { display: "inline-block", fontSize: 11.5, fontWeight: 700, color: "#A5661A", background: "#FBEEDD", borderRadius: 6, padding: "4px 7px", marginTop: 5 },
  timelineNote: { fontSize: 12.5, color: "#16262B", background: "#fff", border: "1px solid #E2E9E8", borderRadius: 8, padding: 8, marginTop: 6, lineHeight: 1.5 },
  timelineBy: { fontSize: 10.5, color: "#B7C4C2", marginTop: 5 },
  visitForm: { background: "#fff", border: "1px solid #E2E9E8", borderRadius: 10, padding: 14, marginBottom: 16 },
  serviceCostAddRow: { display: "flex", alignItems: "center", gap: 6 },
  serviceCostList: { marginTop: 8, background: "#F9FAFA", border: "1px solid #E2E9E8", borderRadius: 8, padding: "6px 9px" },
  serviceCostRow: { display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid #F0F3F2", fontSize: 12, color: "#4C6169" },
  serviceCostTotal: { textAlign: "right", color: "#A5661A", fontWeight: 700, fontSize: 12, paddingTop: 6 },
  expenseList: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 },
  expenseRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, background: "#F9FAFA", border: "1px solid #E2E9E8", borderRadius: 8, padding: "8px 9px", fontSize: 12 },
  expenseMain: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, lineHeight: 1.5 },
  expenseType: { borderRadius: 12, padding: "2px 6px", fontSize: 10.5, fontWeight: 700 },
  expenseActions: { display: "flex", flexShrink: 0, gap: 2 },
  expenseSettled: { color: "#2C6B45", fontWeight: 700 },
  expenseUnsettled: { color: "#A5661A", background: "#FBEEDD", borderRadius: 5, padding: "1px 4px", fontWeight: 700 },
  expenseNote: { color: "#8FA1A8" },
  expenseEditor: { display: "flex", flexDirection: "column", gap: 8, background: "#F4F7F6", border: "1px solid #BFD8D5", borderRadius: 8, padding: 10, marginBottom: 8 },
  expenseFormGrid: { display: "grid", gridTemplateColumns: "1fr 1.4fr .65fr .8fr auto", gap: 6, alignItems: "center" },
  expenseAmountPreview: { fontSize: 12, fontWeight: 700, color: "#145560", whiteSpace: "nowrap" },
  expensePaymentRow: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontSize: 12, color: "#4C6169" },
  expenseEditorActions: { display: "flex", justifyContent: "flex-end", gap: 6 },
  storeInfoBox: { background: "#F4F7F6", border: "1px solid #BFD8D5", borderRadius: 8, padding: "9px 10px", marginBottom: 12, fontSize: 12, lineHeight: 1.6, color: "#4C6169" },
  storeInfoTitle: { fontWeight: 700, color: "#145560", marginBottom: 3 },
  storePermitHint: { background: "#FBEEDD", border: "1px solid #E08E3380", borderRadius: 8, padding: "7px 9px", marginBottom: 12, color: "#A5661A", fontSize: 12, fontWeight: 700 },
  storeMatchBox: { background: "#F4F7F6", border: "1px solid #BFD8D5", borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12, lineHeight: 1.6, color: "#4C6169" },
  storeMatchTitle: { fontWeight: 700, color: "#145560", marginBottom: 4 },
  storeWarning: { whiteSpace: "pre-line", color: "#A5661A", background: "#FBEEDD", borderRadius: 6, padding: "5px 7px", margin: "5px 0" },
  storeFormBox: { display: "grid", gap: 7, marginTop: 8, paddingTop: 8, borderTop: "1px solid #DDE6E4" },
  formRow2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  formRow3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 },
  newOrderLocationGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 },
  newOrderPartyGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 },
  fieldLabel: { fontSize: 11.5, fontWeight: 600, color: "#4C6169", marginBottom: 5 },
  input: { width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid #E2E9E8", borderRadius: 7, padding: "8px 10px", fontSize: 13, outline: "none", color: "#16262B", background: "#fff" },
  resultChips: { display: "flex", flexWrap: "wrap", gap: 6 },
  resultChip: { display: "flex", alignItems: "center", gap: 5, border: "1px solid #E2E9E8", borderRadius: 20, padding: "6px 11px", fontSize: 12, fontWeight: 600, background: "#fff", color: "#4C6169" },
  formErr: { color: "#C1443D", fontSize: 12, marginBottom: 8 },
  formActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 },
  dangerZone: { marginTop: 24, paddingTop: 16, borderTop: "1px solid #F0D2D0" },
  dangerTitle: { color: "#A23931", fontSize: 12, fontWeight: 700, marginBottom: 8 },
  deleteOrderBtn: { display: "flex", alignItems: "center", gap: 6, background: "#F6E7E6", color: "#A23931", border: "1px solid #C1443D55", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700 },
  confirmModal: { width: 430, maxWidth: "92vw", margin: "auto", background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 12px 30px rgba(18,32,36,0.18)" },
  confirmTitle: { fontSize: 17, fontWeight: 700, color: "#A23931", marginBottom: 10 },
  confirmWarning: { color: "#A23931", background: "#F6E7E6", borderRadius: 8, padding: 10, fontSize: 12.5, lineHeight: 1.6 },
  confirmInfo: { background: "#F4F7F6", borderRadius: 8, padding: 10, marginTop: 12, fontSize: 12.5, lineHeight: 1.8, color: "#4C6169" },
  confirmActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 },
  confirmDeleteBtn: { background: "#C1443D", color: "#fff", border: "none", borderRadius: 8, padding: "9px 13px", fontSize: 12, fontWeight: 700 },
  modal: { background: "#fff", borderRadius: 14, width: 560, maxWidth: "92vw", maxHeight: "88vh", display: "flex", flexDirection: "column", margin: "auto" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", borderBottom: "1px solid #E2E9E8" },
  modalTitle: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16 },
  modalBody: { padding: 18, overflowY: "auto" },
  techAddRow: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  relatedChip: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#E3F0F1", border: "1px solid #1F7A8C40", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, color: "#145560", fontWeight: 600 },
  relatedChipRemove: { background: "none", border: "none", color: "#145560", display: "flex" },
  relatedResultsBox: { marginTop: 6, border: "1px solid #E2E9E8", borderRadius: 8, background: "#fff", overflow: "hidden" },
  relatedResultItem: { display: "block", width: "100%", textAlign: "left", padding: "8px 10px", fontSize: 12, border: "none", borderBottom: "1px solid #F0F3F2", background: "#fff", color: "#16262B" },
  feePresetRow: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  feePresetChip: { display: "inline-flex", alignItems: "center", background: "#F4F7F6", border: "1px solid #E2E9E8", borderRadius: 20, overflow: "hidden" },
  feePresetChipBtn: { background: "#F4F7F6", border: "1px solid #E2E9E8", borderRadius: 20, padding: "5px 10px", fontSize: 11.5, fontWeight: 600, color: "#16262B" },
  feePresetDeleteBtn: { display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", borderLeft: "1px solid #E2E9E8", color: "#A23931", padding: "5px 6px" },
  quoteNoteField: { marginTop: 10 },
  quoteNoteLabel: { display: "block", color: "#4C6169", fontSize: 11.5, fontWeight: 600, marginBottom: 5 },
  quoteNoteInput: { width: "100%", minHeight: 58, resize: "vertical", border: "1px solid #E2E9E8", borderRadius: 7, padding: "7px 9px", fontSize: 12, outline: "none", color: "#16262B", background: "#fff", boxSizing: "border-box" },
  tinyIconBtn: { background: "none", border: "none", color: "#8FA1A8", display: "flex", padding: 3 },
  quoteAddGrid: { display: "grid", gridTemplateColumns: "1.4fr 0.6fr 0.8fr 0.8fr auto", gap: 6, marginBottom: 6, alignItems: "center" },
  priceRefBox: { background: "#FBF8EE", border: "1px solid #EBDFB0", borderRadius: 8, padding: "6px 10px", marginBottom: 8 },
  priceRefTitle: { fontSize: 10.5, fontWeight: 700, color: "#A5661A", marginBottom: 4 },
  priceRefRow: { display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11.5, color: "#4C6169", padding: "2px 0" },
  feeItemsList: { background: "#F9FAFA", border: "1px solid #E2E9E8", borderRadius: 8, padding: 8 },
  quoteItemRow: { display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "4px 0", flexWrap: "wrap" },
  quoteSub: { fontSize: 10.5, color: "#8FA1A8", whiteSpace: "nowrap" },
  feeTotalRow: { fontSize: 12, fontWeight: 700, color: "#A5661A", textAlign: "right", marginTop: 4, paddingTop: 6, borderTop: "1px dashed #E2E9E8" },
};
