"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Plus, Trash2, Image as ImageIcon } from 'lucide-react';
import { AbaProps, headersAuth } from './types';
import { extrairCorDominante } from '@/lib/extrair-cor-logo';

type Unidade = { id: string; nome: string; razao_social?: string; cnpj?: string; endereco?: string; cidade?: string; estado?: string; logo_url?: string | null; cor?: string | null; };

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

  // Marca da unidade (redes com várias emissoras, cada uma com logo e cor próprias)
  const [subindoLogo, setSubindoLogo] = useState<string | null>(null);
  const [erroMarca, setErroMarca] = useState<string | null>(null);

  const salvarCor = async (id: string, cor: string) => {
    setUnidades(prev => prev.map(x => x.id === id ? { ...x, cor } : x));
    const res = await fetch('/api/admin/unidades', { method: 'PATCH', headers: headersAuth(token), body: JSON.stringify({ id, cor }) });
    if (!res.ok) { setErroMarca((await res.json().catch(() => ({}))).erro || 'Erro ao salvar a cor.'); carregar(); }
  };

  // O seletor de cor dispara a cada movimento; salva só quando para de mexer
  const timersCor = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const mudarCor = (id: string, cor: string) => {
    setUnidades(prev => prev.map(x => x.id === id ? { ...x, cor } : x));
    clearTimeout(timersCor.current[id]);
    timersCor.current[id] = setTimeout(() => salvarCor(id, cor), 600);
  };

  const subirLogo = async (u: Unidade, file: File) => {
    setErroMarca(null);
    if (!/^image\/(png|jpe?g)$/.test(file.type)) { setErroMarca('Use uma imagem PNG ou JPG (a logo vai para o contrato em PDF).'); return; }
    setSubindoLogo(u.id);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/admin/unidades/logo', {
        method: 'POST', headers: headersAuth(token), body: JSON.stringify({ unidadeId: u.id, imagemBase64: base64 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErroMarca(json.erro || `Erro ao subir logo (HTTP ${res.status}).`); return; }
      setUnidades(prev => prev.map(x => x.id === u.id ? { ...x, logo_url: json.logoUrl } : x));
      // Sem cor definida ainda, já usa a cor dominante da logo (dá pra trocar depois)
      if (!u.cor) {
        const cor = await extrairCorDominante(base64);
        if (cor) await salvarCor(u.id, cor);
      }
    } catch (err: any) {
      setErroMarca('Erro ao subir logo: ' + (err?.message || 'erro desconhecido.'));
    } finally {
      setSubindoLogo(null);
    }
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
          <div key={u.id} className="flex items-center justify-between bg-white/5 border border-white/5 rounded-xl px-4 py-3 group" style={u.cor ? { borderLeft: `3px solid ${u.cor}` } : undefined}>
            <label title="Logo da unidade (PNG ou JPG)" className="w-11 h-11 mr-3 rounded-lg bg-white border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-[#22C55E]/60">
              {subindoLogo === u.id ? <Loader2 size={14} className="animate-spin text-slate-500"/>
                : u.logo_url ? <img src={u.logo_url} alt="" className="w-full h-full object-contain p-0.5"/>
                : <ImageIcon size={15} className="text-slate-400"/>}
              <input type="file" accept="image/png,image/jpeg" className="hidden" disabled={!!subindoLogo} onChange={e => { const f = e.target.files?.[0]; if (f) subirLogo(u, f); e.target.value = ''; }}/>
            </label>
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm">{u.nome}</p>
              {u.razao_social && <p className="text-[10px] text-slate-500 font-mono">{u.razao_social} · {u.cnpj}</p>}
              {u.cidade && <p className="text-[10px] text-slate-600">{u.cidade}, {u.estado}</p>}
            </div>
            <input type="color" title="Cor da unidade" value={u.cor || '#22C55E'} onChange={e => mudarCor(u.id, e.target.value)}
              className="w-8 h-8 ml-2 rounded-md bg-transparent border border-white/10 cursor-pointer flex-shrink-0"/>
            <button onClick={() => remover(u.id)} className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-2">
              <Trash2 size={14}/>
            </button>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-slate-600 -mt-3 mb-4">Clique no quadrado para subir a logo de cada unidade e no quadradinho colorido para a cor. Os dois aparecem no contrato da emissora.</p>
      {erroMarca && <p className="text-xs text-red-400 -mt-2 mb-4">{erroMarca}</p>}

      <form onSubmit={adicionar} className="border-t border-white/5 pt-5 space-y-3">
        <p className="text-xs font-semibold text-slate-500">Nova Unidade</p>
        <input required placeholder="Nome da unidade *" value={nome} onChange={e => setNome(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm font-medium outline-none focus:border-[#22C55E]"/>
        <div className="grid grid-cols-2 gap-3">
          <input placeholder="Razão Social" value={razao} onChange={e => setRazao(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
          <input placeholder="CNPJ" value={cnpj} onChange={e => setCnpj(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
          <input placeholder="Cidade" value={cidade} onChange={e => setCidade(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
          <input placeholder="Endereço" value={endereco} onChange={e => setEndereco(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
        </div>
        <button type="submit" disabled={saving} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2">
          {saving ? <Loader2 size={12} className="animate-spin"/> : <Plus size={12}/>} Adicionar Unidade
        </button>
      </form>
    </div>
  );
}
