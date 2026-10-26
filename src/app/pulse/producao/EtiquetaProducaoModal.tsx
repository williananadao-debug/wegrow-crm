'use client';

import { useState } from 'react';
import { BrowserQRCodeSvgWriter } from '@zxing/browser';
import { QrCode, X } from 'lucide-react';
import { CHAVE, lerConfig, escapar, type ConfigEtiqueta } from '../estoque/EtiquetaModal';

// Etiqueta da produção: QR code + número do pedido, colada no trailer/peça. O QR leva pro link
// /pulse/producao?abrir=<id> — o "Ler QR" do chão de fábrica (ou a câmera nativa do celular)
// abre direto o processo daquela produção. Mesmo rolo/configuração da etiqueta do estoque.
export default function EtiquetaProducaoModal({ producao, onClose }: {
  // pedido = "Pedido LD-0012" quando nasceu de uma venda (vai em linha menor; o número grande é o
  // da produção, o mesmo que se digita no "Ler QR" se a etiqueta estiver ilegível).
  producao: { id: number; pedido: string | null; nome: string };
  onClose: () => void;
}) {
  // Modal só abre por clique (nunca no SSR), então dá pra ler a config do navegador já no início.
  const [cfg, setCfg] = useState<ConfigEtiqueta>(lerConfig);
  const [quantidade, setQuantidade] = useState('1');
  const [erro, setErro] = useState<string | null>(null);

  const campo = (k: keyof ConfigEtiqueta) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value.replace(',', '.'));
    setCfg(c => ({ ...c, [k]: Number.isFinite(v) ? v : 0 }));
  };

  const imprimir = () => {
    const qtd = Math.max(1, Math.min(50, parseInt(quantidade, 10) || 1));
    const { largura, altura, colunas, espaco, margemEsq } = cfg;
    if (!(largura > 5 && altura > 5 && colunas >= 1 && colunas <= 6)) { setErro('Confira largura, altura e colunas.'); return; }

    const url = `${window.location.origin}/pulse/producao?abrir=${producao.id}`;
    const svg = new BrowserQRCodeSvgWriter().write(url, 200, 200);
    svg.setAttribute('shape-rendering', 'crispEdges');
    const qr = svg.outerHTML;

    try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch { /* segue */ }

    // QR quadrado do lado esquerdo ocupando a altura; número e produto à direita.
    const lado = Math.min(altura - 2, largura * 0.55);
    const larguraLinha = margemEsq + colunas * largura + (colunas - 1) * espaco;
    const linhas = Math.ceil(qtd / colunas);
    const etiqueta = `<div class="et"><div class="qr">${qr}</div><div class="tx"><span class="num">#${producao.id}</span>${producao.pedido ? `<span class="ped">${escapar(producao.pedido)}</span>` : ''}<p>${escapar(producao.nome)}</p></div></div>`;
    let html = '';
    for (let l = 0; l < linhas; l++) {
      const nessa = Math.min(colunas, qtd - l * colunas);
      html += `<div class="linha">${Array.from({ length: colunas }, (_, i) => (i < nessa ? etiqueta : '<div class="et"></div>')).join('')}</div>`;
    }

    const win = window.open('', '_blank', 'width=420,height=320');
    if (!win) { setErro('O navegador bloqueou a janela de impressão — permita pop-up para este site.'); return; }
    win.document.write(`<!DOCTYPE html><html><head><title>Etiqueta da produção</title><style>
      @page { margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; }
      .linha { width: ${larguraLinha}mm; height: ${altura}mm; padding-left: ${margemEsq}mm; display: flex; gap: ${espaco}mm; page-break-after: always; break-after: page; overflow: hidden; }
      .linha:last-child { page-break-after: auto; break-after: auto; }
      .et { width: ${largura}mm; height: ${altura}mm; flex: none; padding: 1mm; display: flex; align-items: center; gap: 1mm; overflow: hidden; }
      .qr { width: ${lado}mm; height: ${lado}mm; flex: none; }
      .qr svg { width: 100%; height: 100%; display: block; }
      .tx { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
      .num { font-size: ${Math.max(8, Math.min(14, largura / 3.5))}pt; font-weight: 900; line-height: 1.05; word-break: break-word; }
      .ped { font-size: 6pt; font-weight: 900; text-transform: uppercase; margin-top: 0.5mm; }
      .tx p { font-size: 6pt; font-weight: 700; text-transform: uppercase; margin: 1mm 0 0; line-height: 1.1; max-height: 3.3em; overflow: hidden; }
    </style></head><body>${html}<script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };<\/script></body></html>`);
    win.document.close();
    onClose();
  };

  const input = 'w-full bg-black/40 border border-white/10 rounded-xl py-2 px-2 text-white text-sm outline-none focus:border-amber-400/60';
  const rotulo = 'text-[9px] font-black text-slate-500 uppercase mb-0.5 block';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="min-w-0">
            <h3 className="font-black text-white uppercase italic text-lg flex items-center gap-2"><QrCode size={16} className="text-amber-400" /> Etiqueta QR</h3>
            <p className="text-slate-500 text-xs font-bold truncate">#{producao.id}{producao.pedido ? ` · ${producao.pedido}` : ''} · {producao.nome}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
        </div>

        <label className={rotulo}>Quantidade de etiquetas</label>
        <input value={quantidade} onChange={e => setQuantidade(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={`${input} mb-4`} />

        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Rolo da impressora (o mesmo do estoque)</p>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={rotulo}>Largura da etiqueta (mm)</label><input value={cfg.largura} onChange={campo('largura')} inputMode="decimal" className={input} /></div>
          <div><label className={rotulo}>Altura da etiqueta (mm)</label><input value={cfg.altura} onChange={campo('altura')} inputMode="decimal" className={input} /></div>
          <div><label className={rotulo}>Colunas no rolo</label><input value={cfg.colunas} onChange={campo('colunas')} inputMode="numeric" className={input} /></div>
          <div><label className={rotulo}>Espaço entre colunas (mm)</label><input value={cfg.espaco} onChange={campo('espaco')} inputMode="decimal" className={input} /></div>
        </div>
        <p className="text-slate-500 text-[10px] leading-snug mt-2">Quem ler o QR (botão &quot;Ler QR&quot; ou a câmera do celular) cai direto no processo dessa produção. Na janela de impressão: margens &quot;Nenhuma&quot; e escala 100%.</p>

        {erro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl mt-3">{erro}</div>}
        <button onClick={imprimir} className="w-full mt-4 bg-amber-500 hover:bg-amber-400 text-[#0B1120] font-black uppercase text-xs tracking-widest py-3.5 rounded-xl flex items-center justify-center gap-2">
          <QrCode size={14} /> Imprimir
        </button>
      </div>
    </div>
  );
}
