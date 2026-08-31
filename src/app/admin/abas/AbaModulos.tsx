"use client";
import { useState, useEffect } from 'react';
import { Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import { AbaProps, headersAuth } from './types';

// "crm" é o macro-toggle: liga/desliga o produto inteiro de pipeline/vendas de uma vez.
// Ausente no JSON (empresas criadas antes disso existir) conta como ligado — só desliga
// se alguém marcar explicitamente crm:false, senão o deploy apagaria o menu de quem já usa.
// "financeiro" saiu daqui: já é vendável sozinho (ex: cliente só quer controle de
// contas a pagar/receber, sem funil de vendas) e ficava travado quando CRM estava
// desligado — o bloco de submódulos vira opacity-40 + pointer-events-none junto com CRM.
const CRM_SUBMODULOS = ['opec', 'ia', 'whatsapp', 'assinatura'];

export default function AbaModulos({ empresa, token, onAtualizado }: AbaProps) {
  const [modulos, setModulos] = useState<Record<string, any>>(empresa.modulos || {});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { setModulos(empresa.modulos || {}); }, [empresa.id]);

  const setModulo = async (chave: string, valor: boolean | string) => {
    // atualização funcional — se clicar em 2 toggles rápido, o segundo clique não pode
    // ler um "modulos" desatualizado (fechado no clique anterior) e perder a mudança dele.
    let novo: Record<string, any> = {};
    setModulos(prev => { novo = { ...prev, [chave]: valor }; return novo; });
    setSalvando(true);
    try {
      const res = await fetch('/api/admin/empresas', {
        method: 'PATCH',
        headers: headersAuth(token),
        body: JSON.stringify({ id: empresa.id, modulos: { ...empresa.modulos, ...novo } }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.erro || 'Erro ao salvar módulo.');
      }
    } finally {
      setSalvando(false);
      onAtualizado();
    }
  };

  const Toggle = ({ label, chave, corAtivo, sufixo }: { label: string; chave: string; corAtivo: string; sufixo?: React.ReactNode }) => {
    const ativo = chave === 'crm' ? modulos.crm !== false : Boolean(modulos[chave]);
    return (
      <div>
        <button
          type="button"
          onClick={() => setModulo(chave, chave === 'crm' ? (ativo ? false : true) : !ativo)}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-sm font-black uppercase ${ativo ? corAtivo : 'bg-white/5 border-white/10 text-slate-500'}`}
        >
          {label}
          {ativo ? <ToggleRight size={18}/> : <ToggleLeft size={18}/>}
        </button>
        {sufixo}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-slate-400 text-xs">Clique pra ativar ou desativar. Salva em tempo real.</p>
        {salvando && <Loader2 size={14} className="animate-spin text-slate-500"/>}
      </div>

      <div>
        <Toggle label="CRM" chave="crm" corAtivo="bg-[#22C55E]/10 border-[#22C55E]/40 text-[#22C55E]" />
        <div className={`grid grid-cols-2 gap-2 mt-2 ml-2 pl-3 border-l border-white/10 transition-opacity ${modulos.crm === false ? 'opacity-40 pointer-events-none' : ''}`}>
          {CRM_SUBMODULOS.map(mod => (
            <button
              key={mod}
              type="button"
              onClick={() => setModulo(mod, !modulos[mod])}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-sm font-black uppercase ${modulos[mod] ? 'bg-[#22C55E]/10 border-[#22C55E]/40 text-[#22C55E]' : 'bg-white/5 border-white/10 text-slate-500'}`}
            >
              {mod.replace('_', ' ')}
              {modulos[mod] ? <ToggleRight size={18}/> : <ToggleLeft size={18}/>}
            </button>
          ))}
        </div>
      </div>

      <Toggle label="Financeiro" chave="financeiro" corAtivo="bg-emerald-500/10 border-emerald-500/40 text-emerald-400" />
      <Toggle label="Redes Sociais" chave="redes_sociais" corAtivo="bg-fuchsia-500/10 border-fuchsia-500/40 text-fuchsia-400" />
      <Toggle label="Nexus" chave="nexus" corAtivo="bg-indigo-500/10 border-indigo-500/40 text-indigo-400" />
      <Toggle label="Pulse" chave="pulse" corAtivo="bg-amber-500/10 border-amber-500/40 text-amber-400" />
      <Toggle label="THOR" chave="thor" corAtivo="bg-purple-500/10 border-purple-500/40 text-purple-400" />
      <Toggle label="Max" chave="max" corAtivo="bg-rose-500/10 border-rose-500/40 text-rose-400" />
      <Toggle label="Obras" chave="obras" corAtivo="bg-orange-500/10 border-orange-500/40 text-orange-400" />

      <Toggle
        label="Argus (torre de controle)" chave="argus" corAtivo="bg-yellow-500/10 border-yellow-500/40 text-yellow-400"
        sufixo={Boolean(modulos.argus) && (
          <select
            value={String(modulos.argus_vertical || 'licitacao')}
            onChange={e => setModulo('argus_vertical', e.target.value)}
            className="w-full mt-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold uppercase text-slate-300 outline-none"
          >
            <option value="licitacao" className="bg-[#0B1120]">Vertical: Licitações</option>
            <option value="veiculos" className="bg-[#0B1120]">Vertical: Veículos (loja de automóveis)</option>
          </select>
        )}
      />

      <Toggle label="Veículos (referência no lead)" chave="veiculos" corAtivo="bg-amber-500/10 border-amber-500/40 text-amber-400" />
      <Toggle label="Demais FM Comercial" chave="midia" corAtivo="bg-pink-500/10 border-pink-500/40 text-pink-400" />
      <Toggle label="Advocacia (CRM jurídico)" chave="advocacia" corAtivo="bg-amber-500/10 border-amber-500/40 text-amber-500" />
    </div>
  );
}
