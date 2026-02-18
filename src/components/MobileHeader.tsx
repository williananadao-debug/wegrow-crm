"use client";
// AQUI ESTAVA O ERRO: O arquivo existe como NotificationBell (Maiúsculo)
import NotificationBell from './NotificationBell'; 

export default function MobileHeader() {
  return (
    <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[#0B1120]/95 backdrop-blur-md border-b border-white/10 z-50 flex items-center justify-between px-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-[#22C55E] rounded-lg flex items-center justify-center font-black text-[#0F172A] text-lg">W</div>
        <span className="text-lg font-black italic text-white tracking-tighter">WEGROW</span>
      </div>
      <NotificationBell />
    </div>
  );
}