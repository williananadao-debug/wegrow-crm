"use client";
import { Info } from 'lucide-react';

export function InfoTooltip({ texto }: { texto: string }) {
  return (
    <span className="relative inline-flex group/tip ml-1 align-middle">
      <Info size={11} className="text-slate-600 hover:text-slate-300 cursor-help" />
      <span className="pointer-events-none absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 opacity-0 group-hover/tip:opacity-100 transition-opacity bg-[#1A2333] border border-white/10 rounded-xl px-3 py-2 text-[10px] font-semibold normal-case text-slate-300 shadow-2xl">
        {texto}
      </span>
    </span>
  );
}
