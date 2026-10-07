import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const FINANCE_RANGE_LABELS = {
  month: "本月",
  last_month: "上月",
  quarter: "本季度",
  year: "今年",
  all: "全部",
  custom: "自定义",
};

export function financeRangeDisplayLabel(filters) {
  if (filters?.range === "custom") {
    return "所选期间";
  }
  return FINANCE_RANGE_LABELS[filters?.range] || "本月";
}

const pad = (value) => String(value).padStart(2, "0");

// Return a wall-clock date in Asia/Shanghai without relying on the browser timezone.
export function beijingParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

function beijingUtc(year, month, day) {
  return Date.UTC(year, month - 1, day) - (8 * 60 * 60 * 1000);
}

export function financeDateRange(range = "month", start = "", end = "", now = new Date()) {
  if (range === "all") return { start: null, end: null };
  if (range === "custom") {
    return {
      start: start ? beijingUtc(...start.split("-").map(Number)) : null,
      end: end ? beijingUtc(...end.split("-").map(Number)) + 24 * 60 * 60 * 1000 : null,
    };
  }
  const { year, month } = beijingParts(now);
  if (range === "last_month") {
    const monthStart = new Date(Date.UTC(year, month - 2, 1));
    return { start: beijingUtc(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1), end: beijingUtc(year, month, 1) };
  }
  if (range === "quarter") {
    const quarterMonth = Math.floor((month - 1) / 3) * 3 + 1;
    return { start: beijingUtc(year, quarterMonth, 1), end: beijingUtc(year, quarterMonth + 3, 1) };
  }
  if (range === "year") return { start: beijingUtc(year, 1, 1), end: beijingUtc(year + 1, 1, 1) };
  return { start: beijingUtc(year, month, 1), end: beijingUtc(year, month + 1, 1) };
}

export function financeDateKey(timestamp) {
  if (!timestamp) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp));
  const values = parts.reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${values.year}-${values.month}-${values.day}`;
}

export function isFinanceDateInRange(timestamp, range) {
  if (!timestamp) return false;
  const value = new Date(timestamp).getTime();
  if (Number.isNaN(value)) return false;
  return (range.start === null || value >= range.start) && (range.end === null || value < range.end);
}

export function useFinanceTimeFilter() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setLocalFilters] = useState({ range: "month", start: "", end: "" });
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const range = searchParams.get("finance_range");
    if (!range || !FINANCE_RANGE_LABELS[range]) return;
    setLocalFilters({ range, start: searchParams.get("finance_start") || "", end: searchParams.get("finance_end") || "" });
  }, [searchParams]);
  const update = useCallback((patch) => {
    setLocalFilters((current) => {
      const next = { ...current, ...patch };
      const params = new URLSearchParams(searchParams.toString());
      params.set("finance_range", next.range);
      if (next.start) params.set("finance_start", next.start); else params.delete("finance_start");
      if (next.end) params.set("finance_end", next.end); else params.delete("finance_end");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      return next;
    });
  }, [pathname, router, searchParams]);
  useEffect(() => {
    const refresh = () => setClock(Date.now());
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  const bounds = useMemo(() => financeDateRange(filters.range, filters.start, filters.end, new Date(clock)), [filters, clock]);
  return { filters, setFilters: update, bounds, label: FINANCE_RANGE_LABELS[filters.range] || "本月" };
}

export function financeItemDate(item, kind) {
  if (kind === "advance") return item?.created_at;
  return kind === "technician" ? item?.order?.completedAt : item?.completedAt;
}

export function financeFilterOptions(filters, bounds, kind, item, orders = []) {
  const order = kind === "advance" ? orders.find((candidate) => candidate.id === item?.order_id) : kind === "technician" ? item?.order : item;
  if (!isFinanceDateInRange(financeItemDate(item, kind), bounds)) return false;
  if (filters.storeId && order?.storeId !== filters.storeId) return false;
  if (filters.followerId && order?.followerId !== filters.followerId) return false;
  if (kind === "technician" && filters.technicianId && item?.technicianId !== filters.technicianId) return false;
  if (kind === "advance" && filters.employeeName && item?.employee_name !== filters.employeeName) return false;
  return true;
}