"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function TeamPage() {
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('profiles').select('*');
      setUsers(data || []);
    }
    load();
  }, []);

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">Membros da Equipe</h1>
      <div className="grid gap-4">
        {users.map(u => (
          <div key={u.id} className="bg-white/5 p-4 rounded-xl border border-white/10">
            <p className="font-bold">{u.nome}</p>
            <p className="text-xs text-slate-400">{u.email} - <span className="text-[#22C55E]">{u.cargo}</span></p>
          </div>
        ))}
      </div>
    </div>
  );
}