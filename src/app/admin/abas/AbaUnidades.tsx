"use client";
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { AbaProps, headersAuth } from './types';

type Unidade = { id: string; nome: string; razao_social?: string; cnpj?: string; endereco?: string; cidade?: string; estado?: string; };

export default function AbaUnidades({ empresa, token }: AbaProps) {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [nome, setNome] = useState('');
  const [razao, setRazao] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [endereco, setEndereco] = useState('');
  const [cidade, setCidade] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/unidades?empresa_id=${empresa.id}`, { headers: headersAuth(token) });
    setUnidades(res.ok ? await res.json() : []);
    setLoading(false);
  }, [empresa.id, token]);

  useEffect(() => { carregar(); }, [carregar]);

  const adicionar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/admin/unidades', {
      method: 'POST',
      headers: headersAuth(token),
      body: JSON.stringify({
        empresa_id: empresa.id, nome, razao_social: razao || null, cnpj: cnpj || null,
        endereco: endereco || null, cidade: cidade || null,
      }),
    });
    setNome(''); setRazao(''); setCnpj(''); setEndereco(''); setCidade('');
    await carregar();
    setSaving(false);
  };

  const remover = async (id: string) => {
    if (!confirm('Remover esta unidade?')) return;
    await fetch(`/api/admin/unidades?id=${id}`, { method: 'DELETE', headers: headersAuth(token) });
    setUnidades(prev => prev.filter(u => u.id !== id));
  };

  return (
    <div>
      <div className="space-y-2 mb-5 max-h-72 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-slate-600"/></div>
        ) : unidades.length === 0 ? (
          <p className="text-slate-600 text-xs text-center py-4">Nenhuma unidade cadastrada.</p>
        ) : unidades.map(u => (
          <div key={u.id} className="flex items-center justify-between bg-white/5 border border-white/5 rounded-xl px-4 py-3 group">
            <div>
              <p className="font-black text-sm">{u.nome}</p>
              {u.razao_social && <p className="text-[10px] text-slate-500 font-mono">{u.razao_social} · {u.cnpj}</p>}
              {u.cidade && <p className="text-[10px] text-slate-600">{u.cidade}, {u.estado}</p>}
            </div>
            <button onClick={() => remover(u.id)} className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-2">
              <Trash2 size={14}/>
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={adicionar} className="border-t border-white/5 pt-5 space-y-3">
        <p className="text-[10px] font-black uppercase text-slate-500">Nova Unidade</p>
        <input required placeholder="Nome da unidade *" value={nome} onChange={e => setNome(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
        <div className="grid grid-cols-2 gap-3">
          <input placeholder="Razão Social" value={razao} onChange={e => setRazao(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
          <input placeholder="CNPJ" value={cnpj} onChange={e => setCnpj(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
          <input placeholder="Cidade" value={cidade} onChange={e => setCidade(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
          <input placeholder="Endereço" value={endereco} onChange={e => setEndereco(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
        </div>
        <button type="submit" disabled={saving} className="w-full bg-blue-600 text-white py-3 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2">
          {saving ? <Loader2 size={12} className="animate-spin"/> : <Plus size={12}/>} Adicionar Unidade
        </button>
      </form>
    </div>
  );
}
