import React from "react";
import { Card, CardContent } from "./ui/Card";

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export default function StatsSection({ summaryStats }) {
  if (summaryStats.length === 0) return null;

  return (
    <section className="grid gap-3 grid-cols-1 md:grid-cols-3 flex-shrink-0">
      {summaryStats.map(item => (
        <Card key={item.key} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
              <h3 className="text-xs font-bold text-slate-850 dark:text-cyan-200 truncate" title={item.name}>{item.name}</h3>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-2 text-center border border-slate-150 dark:border-slate-900 shadow-xs">
                <p className="text-slate-400">Mín</p>
                <p className="font-bold text-slate-850 dark:text-slate-200">{numberFormat.format(item.min)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-2 text-center border border-slate-150 dark:border-slate-900 shadow-xs">
                <p className="text-slate-400">Média</p>
                <p className="font-bold text-slate-850 dark:text-slate-200">{numberFormat.format(item.avg)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-2 text-center border border-slate-150 dark:border-slate-900 shadow-xs">
                <p className="text-slate-400">Máx</p>
                <p className="font-bold text-slate-850 dark:text-slate-200">{numberFormat.format(item.max)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
