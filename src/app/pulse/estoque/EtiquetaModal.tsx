'use client';

import { useEffect, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Tag, X } from 'lucide-react';

// Rolo de etiqueta adesiva (Elgin/Bematech e afins): N colunas lado a lado por linha. Cada
// "página" impressa = uma linha do rolo; o tamanho vem da configuração (guardada no navegador,
// porque é da impressora daquele computador, não da empresa).
type ConfigEtiqueta = { largura: number; altura: number; colunas: number; espaco: number; margemEsq: number };

const PADRAO: ConfigEtiqueta = { largura: 40, altura: 25, colunas: 2, espaco: 3, margemEsq: 0 };
const CHAVE = 'pulse_etiqueta_config';

function lerConfig(): ConfigEtiqueta {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (salvo && typeof salvo === 'object') return { ...PADRAO, ...salvo };
  } catch { /* sem storage: usa o padrão */ }
  return PADRAO;
}

function escapar(t: string) {
  return t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

export default function EtiquetaModal({ produto, onClose }: { produto: { nome: string; sku: string }; onClose: () => void }) {
  const [cfg, setCfg] = useState<ConfigEtiqueta>(PADRAO);
  const [quantidade, setQuantidade] = useState('2');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => { setCfg(lerConfig()); }, []);

  const campo = (k: keyof ConfigEtiqueta) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value.replace(',', '.'));
    setCfg(c => ({ ...c, [k]: Number.isFinite(v) ? v : 0 }));
  };

  const imprimir = () => {
    const qtd = Math.max(1, Math.min(500, parseInt(quantidade, 10) || 1));
    const { largura, altura, colunas, espaco, margemEsq } = cfg;
    if (!(largura > 5 && altura > 5 && colunas >= 1 && colunas <= 6)) { setErro('Confira largura, altura e colunas.'); return; }

    // Cada barra precisa ter um número inteiro de pontos da térmica (203 dpi = 0,125 mm por
    // ponto). Esticar o código pra caber na largura deixava barras de larguras desiguais e o
    // leitor não lia. Aqui: 1 módulo = N pontos, o maior que cabe, mínimo 0,25 mm.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    try {
      JsBarcode(svg, produto.sku, { format: 'CODE128', width: 1, height: 60, displayValue: false, margin: 0 });
    } catch {
      setErro('SKU com caractere que o código de barras (CODE128) não aceita.');
      return;
    }
    const modulos = Number(svg.getAttribute('width')) || 1;
    const PONTO = 0.125;
    const zonaQuieta = 2.5; // margem branca mínima de cada lado pro leitor achar o começo/fim
    const disponivel = largura - 2 * zonaQuieta;
    const modulo = Math.max(2 * PONTO, Math.floor(disponivel / modulos / PONTO) * PONTO);
    const larguraCodigo = modulos * modulo;
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('shape-rendering', 'crispEdges');
    const codigo = svg.outerHTML;

    try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch { /* segue */ }

    const larguraLinha = margemEsq + colunas * largura + (colunas - 1) * espaco;
    const linhas = Math.ceil(qtd / colunas);
    const etiqueta = `<div class="et"><p>${escapar(produto.nome)}</p><div class="cb">${codigo}</div><span class="sku">${escapar(produto.sku)}</span></div>`;
    let html = '';
    for (let l = 0; l < linhas; l++) {
      const nessa = Math.min(colunas, qtd - l * colunas);
      html += `<div class="linha">${Array.from({ length: colunas }, (_, i) => (i < nessa ? etiqueta : '<div class="et"></div>')).join('')}</div>`;
    }

    const win = window.open('', '_blank', 'width=420,height=320');
    if (!win) { setErro('O navegador bloqueou a janela de impressão — permita pop-up para este site.'); return; }
    win.document.write(`<!DOCTYPE html><html><head><title>Etiqueta</title><style>
      /* Sem "size": página mais larga que alta o Chrome manda como paisagem e o driver da
         térmica gira 90°. O tamanho do papel vem do driver (largura do rolo × altura da etiqueta). */
      @page { margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; }
      .linha { width: ${larguraLinha}mm; height: ${altura}mm; padding-left: ${margemEsq}mm; display: flex; gap: ${espaco}mm; page-break-after: always; break-after: page; overflow: hidden; }
      .linha:last-child { page-break-after: auto; break-after: auto; }
      .et { width: ${largura}mm; height: ${altura}mm; flex: none; padding: 2mm ${zonaQuieta}mm 2.5mm; display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
      .et p { font-size: ${Math.max(6, Math.min(9, largura / 5))}pt; font-weight: 900; text-transform: uppercase; text-align: center; margin: 0 0 1mm; line-height: 1.1; max-height: 2.3em; overflow: hidden; }
      .cb { flex: 1; min-height: 0; display: flex; justify-content: center; }
      .sku { font-size: 7pt; text-align: center; letter-spacing: 0.5px; margin-top: 0.6mm; line-height: 1; }
      .cb svg { width: ${larguraCodigo}mm; height: 100%; display: block; flex: none; }
    </style></head><body>${html}<script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };<\/script></body></html>`);
    win.document.close();
    onClose();
  };

  const input = 'w-full bg-black/40 border border-white/10 rounded-xl py-2 px-2 text-white text-sm outline-none focus:border-blue-400/60';
  const rotulo = 'text-[9px] font-black text-slate-500 uppercase mb-0.5 block';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="min-w-0">
            <h3 className="font-black text-white uppercase italic text-lg flex items-center gap-2"><Tag size={16} className="text-blue-400" /> Etiqueta</h3>
            <p className="text-slate-500 text-xs font-bold truncate">{produto.nome} · {produto.sku}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
        </div>

        <label className={rotulo}>Quantidade de etiquetas</label>
        <input value={quantidade} onChange={e => setQuantidade(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={`${input} mb-4`} />

        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Rolo da impressora (fica salvo neste computador)</p>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={rotulo}>Largura da etiqueta (mm)</label><input value={cfg.largura} onChange={campo('largura')} inputMode="decimal" className={input} /></div>
          <div><label className={rotulo}>Altura da etiqueta (mm)</label><input value={cfg.altura} onChange={campo('altura')} inputMode="decimal" className={input} /></div>
          <div><label className={rotulo}>Colunas no rolo</label><input value={cfg.colunas} onChange={campo('colunas')} inputMode="numeric" className={input} /></div>
          <div><label className={rotulo}>Espaço entre colunas (mm)</label><input value={cfg.espaco} onChange={campo('espaco')} inputMode="decimal" className={input} /></div>
          <div className="col-span-2"><label className={rotulo}>Margem esquerda (mm) — se sair deslocado</label><input value={cfg.margemEsq} onChange={campo('margemEsq')} inputMode="decimal" className={input} /></div>
        </div>
        <p className="text-slate-500 text-[10px] leading-snug mt-2">Meça com régua uma etiqueta e o vão entre as duas. Na janela de impressão: margens &quot;Nenhuma&quot; e escala 100%. No driver da impressora (Windows), o papel deve ser {cfg.margemEsq + cfg.colunas * cfg.largura + (cfg.colunas - 1) * cfg.espaco} × {cfg.altura} mm, orientação retrato.</p>

        {erro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl mt-3">{erro}</div>}
        <button onClick={imprimir} className="w-full mt-4 bg-blue-500 hover:bg-blue-600 text-white font-black uppercase text-xs tracking-widest py-3.5 rounded-xl flex items-center justify-center gap-2">
          <Tag size={14} /> Imprimir
        </button>
      </div>
    </div>
  );
}
