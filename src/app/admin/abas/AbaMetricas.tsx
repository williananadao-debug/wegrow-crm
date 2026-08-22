"use client";
import { useState, useEffect, useCallback } from 'react';
import { Loader2, TrendingUp, Activity, Users, Clock } from 'lucide-react';
import { AbaProps, headersAuth } from './types';

export default function AbaMetricas({ empresa, token }: AbaProps) {
  const [metrics, setMetrics] = useState<any>(null);

  const carregar = useCallback(async () => {
    setMetrics(null);
    const res = await fetch(`/api/admin/metrics?empresa_id=${empresa.id}`, { headers: headersAuth(token) });
    if (res.ok) setMetrics(await res.json());
  }, [empresa.id, token]);

  useEffect(() => { carregar(); }, [carregar]);

  if (!metrics) return <div className="flex justify-center py-6"><Loader2 className="animate-spin text-slate-600" size={20}/></div>;

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Leads Total', value: metrics.total_leads, icon: TrendingUp, color: 'text-blue-400' },
          { label: 'Leads no Mês', value: metrics.leads_mes, icon: Activity, color: 'text-orange-400' },
          { label: 'Ganhos no Mês', value: metrics.leads_ganhos_mes, icon: TrendingUp, color: 'text-[#22C55E]' },
          { label: 'Usuários Ativos', value: `${metrics.usuarios_ativos}/${metrics.total_usuarios}`, icon: Users, color: 'text-purple-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-[#0B1120] border border-white/5 rounded-2xl p-3 text-center">
            <Icon size={14} className={`${color} mx-auto mb-1`}/>
            <p className={`text-xl font-black ${color}`}>{value}</p>
            <p className="text-[8px] text-slate-500 uppercase font-black mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1 mb-3"><Clock size={10}/> Último Acesso por Usuário</p>
        <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar">
          {[...(metrics.profiles || [])].sort((a: any, b: any) =>
            (b.ultimo_acesso || '').localeCompare(a.ultimo_acesso || '')
          ).map((p: any) => (
            <div key={p.id} className="flex items-center justify-between bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.ativo_recente ? 'bg-[#22C55E]' : 'bg-slate-600'}`}/>
                <p className="text-xs font-black truncate">{p.nome || p.email}</p>
                <span className="text-[8px] text-slate-600 uppercase font-bold shrink-0">{p.cargo}</span>
              </div>
              <p className="text-[9px] text-slate-500 font-mono shrink-0 ml-2">
                {p.ultimo_acesso
                  ? new Date(p.ultimo_acesso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                  : 'nunca'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
