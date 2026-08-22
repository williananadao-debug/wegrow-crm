"use client";
import { useState, useEffect } from 'react';
import { Loader2, Save, Upload, Image as ImageIcon } from 'lucide-react';
import { AbaProps, headersAuth } from './types';

const PLANOS = ['essencial', 'pro', 'enterprise'];
const STATUS_OPTS = ['trial', 'ativa', 'suspensa'];

export default function AbaGeral({ empresa, token, onAtualizado }: AbaProps) {
  const [nome, setNome] = useState(empresa.nome);
  const [plano, setPlano] = useState(empresa.plano);
  const [status, setStatus] = useState(empresa.status);
  const [logoUrl, setLogoUrl] = useState<string | null>(empresa.logo_url || null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNome(empresa.nome);
    setPlano(empresa.plano);
    setStatus(empresa.status);
    setLogoUrl(empresa.logo_url || null);
  }, [empresa.id]);

  const salvar = async () => {
    if (!nome.trim()) { alert('O nome da empresa não pode ficar vazio.'); return; }
    setSaving(true);
    await fetch('/api/admin/empresas', {
      method: 'PATCH',
      headers: headersAuth(token),
      body: JSON.stringify({ id: empresa.id, nome: nome.trim(), plano, status, modulos: empresa.modulos }),
    });
    setSaving(false);
    onAtualizado();
  };

  const uploadLogo = async (file: File) => {
    setUploadingLogo(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const ext = file.name.split('.').pop() || 'png';
      const res = await fetch('/api/admin/empresas/logo', {
        method: 'POST',
        headers: headersAuth(token),
        body: JSON.stringify({ empresaId: empresa.id, imagemBase64: base64, extensao: ext }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { alert(json.erro || `Erro ao subir logo (HTTP ${res.status}).`); return; }
      setLogoUrl(json.logoUrl);
      onAtualizado();
    } catch (err: any) {
      alert('Erro ao subir logo: ' + (err?.message || 'erro desconhecido.'));
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Nome da Empresa</label>
        <input value={nome} onChange={e => setNome(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
      </div>

      <div>
        <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Logo (aparece no menu lateral do cliente)</label>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
            {logoUrl ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain"/> : <ImageIcon size={18} className="text-slate-600"/>}
          </div>
          <label className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-black uppercase text-slate-400 hover:text-white cursor-pointer transition-all">
            {uploadingLogo ? <Loader2 size={14} className="animate-spin"/> : <Upload size={14}/>}
            {uploadingLogo ? 'Enviando...' : 'Subir logo'}
            <input type="file" accept="image/*" className="hidden" disabled={uploadingLogo} onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }}/>
          </label>
        </div>
        <p className="text-[9px] text-slate-600 mt-1.5">Sem logo, o menu mostra um quadrado com a inicial do nome.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Plano</label>
          <select value={plano} onChange={e => setPlano(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm font-bold outline-none">
            {PLANOS.map(p => <option key={p} value={p} className="bg-[#0B1120] capitalize">{p}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm font-bold outline-none">
            {STATUS_OPTS.map(s => <option key={s} value={s} className="bg-[#0B1120] capitalize">{s}</option>)}
          </select>
        </div>
      </div>

      <button onClick={salvar} disabled={saving} className="bg-[#22C55E] text-[#0B1120] px-4 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2">
        {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Salvar
      </button>

      <div className="pt-4 border-t border-white/5">
        <p className="text-[10px] text-slate-600 font-mono">ID: {empresa.id}</p>
      </div>
    </div>
  );
}
