"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Essencial: export default function
export default function TeamPage() {
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('profiles').select('*').order('nome');
      setMembers(data || []);
    }
    load();
  }, []);

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-black uppercase italic text-[#22C55E] mb-6">Gestão de Equipe</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map((m) => (
          <div key={m.id} className="bg-white/5 border border-white/10 p-5 rounded-3xl">
            <p className="font-bold">{m.nome}</p>
            <p className="text-xs text-slate-500">{m.email}</p>
            <span className="text-[10px] font-black uppercase text-[#22C55E] mt-2 block">{m.cargo}</span>
          </div>
        ))}
      </div>
    </div>
  );
}