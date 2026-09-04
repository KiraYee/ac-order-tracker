"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AppShell from "./components/AppShell";
import OverviewAnomalyList from "./components/OverviewAnomalyList";
import OverviewFinanceSummary from "./components/OverviewFinanceSummary";
import OverviewResourceDistribution from "./components/OverviewResourceDistribution";
import { getFinanceSummary, getOrderExceptions, orderFromDb, orderStoreDisplay } from "../lib/dataHelpers";

export default function DashboardPage() {
  return <AppShell active="dashboard"><DashboardContent /></AppShell>;
}

function DashboardContent() {
  const [orders, setOrders] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [stores, setStores] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: orderRows }, { data: technicianRows }, { data: storeRows }, { data: advanceRows }] = await Promise.all([
        supabase.from("orders").select("*, expense_records(*), visits(*, expense_records(*))"),
        supabase.from("technicians").select("*"),
        supabase.from("stores").select("*"),
        supabase.from("advances").select("*").order("created_at", { ascending: false }),
      ]);
      const storeById = new Map((storeRows || []).map((store) => [store.id, store]));
      setOrders((orderRows || []).map(orderFromDb).map((order) => ({ ...order, store: storeById.get(order.storeId) || null })));
      setTechnicians(technicianRows || []);
      setStores(storeRows || []);
      setAdvances(advanceRows || []);
      setLoading(false);
    })();
  }, []);

  const anomalies = useMemo(() => orders.flatMap((order) => {
    const types = getOrderExceptions(order, now);
    if (!types.length) return [];
    const display = orderStoreDisplay(order);
    return [{ order, types, location: [display.city, display.brand, display.mall].filter(Boolean).join(" · ") || "未填写地点" }];
  }), [orders, now]);
  const financeSummary = useMemo(() => getFinanceSummary(orders, advances), [orders, advances]);

  if (loading) return <div className="overview-loading"><Loader2 size={22} /><span>加载总览数据中…</span></div>;

  return <main className="overview-page">
    <header className="overview-top">
      <div><h1>总览</h1><p>跨模块掌握异常、财务与资源情况</p></div>
      <Link href="/orders" className="overview-top-link">工单列表 <span>›</span></Link>
    </header>
    <OverviewAnomalyList items={anomalies} />
    <OverviewFinanceSummary summary={financeSummary} />
    <OverviewResourceDistribution technicians={technicians} stores={stores} />
  </main>;
}