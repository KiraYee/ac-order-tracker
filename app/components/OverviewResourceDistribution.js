"use client";

import Link from "next/link";
import { Store, Users } from "lucide-react";

function cityEntries(rows, getCity) {
  const counts = new Map();
  rows.forEach((row) => {
    const city = getCity(row) || "未分类";
    counts.set(city, (counts.get(city) || 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"));
}

function CityBars({ entries, label }) {
  const max = Math.max(...entries.filter(([city]) => city !== "未分类").map(([, count]) => count), 0);
  return (
    <div className="overview-city-bars">
      {entries.slice(0, 5).map(([city, count]) => {
        const isUnclassified = city === "未分类";
        const width = !isUnclassified && max > 0 ? `${20 + (count / max) * 80}%` : "0%";
        return (
          <div key={city} className={`overview-city-item ${isUnclassified ? "muted" : ""}`}>
            <div className="overview-city-top"><span>{city}</span><span className="mono">{count}{label}</span></div>
            <div className="overview-city-track">{!isUnclassified && <div className="overview-city-fill" style={{ width }} />}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function OverviewResourceDistribution({ technicians = [], stores = [] }) {
  const technicianCities = cityEntries(technicians, (item) => item.city);
  const storeCities = cityEntries(stores, (item) => item.city);
  const brandCount = new Set(stores.map((store) => store.brand).filter(Boolean)).size;

  return (
    <section className="overview-section overview-resources">
      <div className="overview-section-head"><h2>资源分布</h2></div>
      <div className="overview-resource-block">
        <div className="overview-resource-head"><Users size={15} /><b>师傅</b></div>
        <CityBars entries={technicianCities} label="人" />
      </div>
      <div className="overview-resource-block">
        <div className="overview-resource-head"><Store size={15} /><b>服务门店</b><span>· 共 {storeCities.length} 城市 · {brandCount} 个品牌</span></div>
        <CityBars entries={storeCities} label="家" />
        <Link href="/stores" className="overview-view-all">查看全部城市 <span>›</span></Link>
      </div>
    </section>
  );
}