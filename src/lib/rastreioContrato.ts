// Contrato de prestação de serviço de rastreamento (instalador ↔ cliente final), gerado em PDF e
// enviado para assinatura eletrônica pelo DocuSeal (mesmo servidor/env do contrato de rádio).
// Ao concluir, o webhook do DocuSeal (api/docuseal/webhook) marca rastreio_contratos como
// assinado e arquiva o PDF + certificado no bucket contratos-assinados.
//
// Cláusulas = modelo genérico de mercado (comodato do equipamento, mensalidade, bloqueio,
// LGPD). Recomenda-se o instalador revisar com um advogado antes de usar em escala.
import PDFDocument from 'pdfkit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { carregarConfig, type ConfigCobranca } from '@/lib/rastreioCobranca';

const DOCUSEAL_URL = (process.env.DOCUSEAL_URL || '').replace(/\/$/, '');
const DOCUSEAL_TOKEN = process.env.DOCUSEAL_TOKEN || '';
const DOCUSEAL_SIGN_BASE = (process.env.DOCUSEAL_SIGN_BASE_URL || DOCUSEAL_URL).replace(/\/$/, '');
export const BUCKET_CONTRATOS = 'contratos-assinados';

const moeda = (v: number) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type ClienteContrato = {
  id: string; tipo: string; nome: string; documento: string | null; email: string | null; telefone: string | null;
  endereco: string | null; cidade: string | null; mensalidade: number; dia_vencimento: number | null; forma_pagamento: string | null;
};
type VeiculoContrato = { placa: string; descricao: string | null; tem_bloqueio: boolean; modelo_rastreador: string | null; imei: string };

/** O que falta preencher antes de dar para gerar o contrato. */
export function pendenciasContrato(cfg: ConfigCobranca, c: ClienteContrato, veics: VeiculoContrato[]) {
  const f: string[] = [];
  if (!cfg.emp_razao) f.push('razão social da empresa (Financeiro → Regras → Dados do contrato)');
  if (!String(cfg.emp_documento || '').replace(/\D/g, '')) f.push('CNPJ/CPF da empresa');
  if (!cfg.emp_cidade) f.push('cidade da empresa (foro)');
  const doc = String(c.documento || '').replace(/\D/g, '');
  if (doc.length !== 11 && doc.length !== 14) f.push(`CPF/CNPJ do cliente ${c.nome}`);
  if (!c.email && String(c.telefone || '').replace(/\D/g, '').length < 10) f.push('e-mail ou celular do cliente');
  if (!(Number(c.mensalidade) > 0)) f.push('mensalidade do cliente');
  if (!veics.length) f.push('pelo menos um veículo ativo');
  return f;
}

export function gerarContratoRastreioPdf(cfg: ConfigCobranca, c: ClienteContrato, veics: VeiculoContrato[], protocolo: string): Promise<{ buffer: Buffer; sigPage: number; sigYFrac: number }> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 70, left: 50, right: 50 }, bufferPages: true, info: { Title: `Contrato de rastreamento — ${c.nome}` } });
      const chunks: Buffer[] = [];
      doc.on('data', (b: Buffer) => chunks.push(b));
      doc.on('error', reject);
      let pagina = 1;
      doc.on('pageAdded', () => { pagina++; });
      const W = doc.page.width;

      const titulo = (t: string) => {
        doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).fillColor('#111').text(t, 50);
        doc.moveTo(50, doc.y).lineTo(W - 50, doc.y).strokeColor('#999').lineWidth(0.5).stroke();
        doc.moveDown(0.3);
      };
      const par = (t: string) => { doc.font('Helvetica').fontSize(8.5).fillColor('#000').text(t, 50, doc.y, { align: 'justify', width: W - 100 }); doc.moveDown(0.3); };
      const campo = (rot: string, val: string) => doc.font('Helvetica-Bold').fontSize(8.5).text(rot, 50, doc.y, { continued: true }).font('Helvetica').text(val || '—');

      const pj = String(c.documento || '').replace(/\D/g, '').length === 14;
      const contratada = cfg.emp_razao || '';
      const local = [cfg.emp_cidade, cfg.emp_uf].filter(Boolean).join('/');

      doc.font('Helvetica-Bold').fontSize(14).fillColor('#111').text('CONTRATO DE PRESTAÇÃO DE SERVIÇO DE RASTREAMENTO E MONITORAMENTO VEICULAR', { align: 'center' });
      doc.font('Helvetica').fontSize(8).fillColor('#555').text(`Protocolo ${protocolo}`, { align: 'center' });
      doc.moveDown(0.8);

      titulo('PARTES');
      campo('CONTRATADA: ', contratada.toUpperCase());
      campo('CNPJ/CPF: ', cfg.emp_documento || '');
      campo('Endereço: ', [cfg.emp_endereco, local].filter(Boolean).join(' — '));
      if (cfg.emp_telefone || cfg.emp_email) campo('Contato: ', [cfg.emp_telefone, cfg.emp_email].filter(Boolean).join(' · '));
      doc.moveDown(0.4);
      campo('CONTRATANTE: ', c.nome.toUpperCase());
      campo(pj ? 'CNPJ: ' : 'CPF: ', c.documento || '');
      campo('Endereço: ', [c.endereco, c.cidade].filter(Boolean).join(' — '));
      campo('Contato: ', [c.telefone, c.email].filter(Boolean).join(' · '));

      titulo('1. OBJETO');
      par('1.1. A CONTRATADA presta ao CONTRATANTE o serviço de rastreamento e monitoramento veicular via GPS/GPRS, com acesso ao aplicativo de acompanhamento (localização em tempo real, histórico de trajetos, alertas, cercas virtuais e, quando instalado o relé, bloqueio remoto), para o(s) veículo(s):');
      for (const v of veics) {
        par(`• Placa ${v.placa}${v.descricao ? ` — ${v.descricao}` : ''} · rastreador ${v.modelo_rastreador || 'GPS'} (IMEI ${v.imei})${v.tem_bloqueio ? ' · com bloqueio remoto' : ''}`);
      }

      titulo('2. EQUIPAMENTO EM COMODATO');
      par('2.1. O rastreador e o chip de dados são cedidos em comodato e continuam de propriedade da CONTRATADA. O CONTRATANTE se compromete a não remover, violar ou permitir que terceiros não autorizados mexam no equipamento.');
      par(`2.2. No fim do contrato o equipamento será retirado pela CONTRATADA. Em caso de perda, dano por mau uso ou não devolução, o CONTRATANTE pagará ${cfg.contrato_valor_equipamento > 0 ? moeda(cfg.contrato_valor_equipamento) + ' por equipamento' : 'o valor de reposição do equipamento'}.`);

      titulo('3. VALORES E PAGAMENTO');
      const formaTxt: Record<string, string> = { BOLETO: 'boleto bancário', PIX: 'Pix', CREDIT_CARD: 'cartão de crédito recorrente', UNDEFINED: 'boleto, Pix ou cartão, à escolha do CONTRATANTE' };
      par(`3.1. Mensalidade de ${moeda(c.mensalidade)}, com vencimento todo dia ${c.dia_vencimento || 10}, paga por ${formaTxt[c.forma_pagamento || 'UNDEFINED'] || formaTxt.UNDEFINED}, pelo link enviado ao CONTRATANTE.`);
      if (cfg.contrato_taxa_instalacao > 0) par(`3.2. Taxa de instalação de ${moeda(cfg.contrato_taxa_instalacao)}, cobrada uma única vez.`);
      par(`3.3. Atraso: multa de ${cfg.multa_pct}% e juros de ${cfg.juros_mes_pct}% ao mês. Com mais de ${cfg.dias_suspensao} dias de atraso, o acesso ao aplicativo pode ser suspenso até a regularização; o pagamento reativa o acesso automaticamente.`);
      par('3.4. A mensalidade é reajustada a cada 12 meses pelo IPCA (IBGE) ou outro índice que o substitua.');

      titulo('4. PRAZO E CANCELAMENTO');
      if (cfg.contrato_fidelidade_meses > 0) {
        par(`4.1. Prazo mínimo de ${cfg.contrato_fidelidade_meses} meses a partir da instalação, renovado automaticamente por prazo indeterminado. Cancelamento antes do prazo mínimo gera multa de 50% das mensalidades que faltam, proporcional ao tempo restante.`);
      } else {
        par('4.1. Prazo indeterminado, a partir da instalação.');
      }
      par('4.2. Qualquer das partes pode cancelar com aviso de 30 dias, por escrito (e-mail ou WhatsApp). O CONTRATANTE deve disponibilizar o veículo para a retirada do equipamento.');

      titulo('5. LIMITES DO SERVIÇO');
      par('5.1. O serviço depende de sinal de GPS e de operadora de celular, que podem falhar em garagens, túneis, áreas rurais ou por interferência (inclusive bloqueadores de sinal). A CONTRATADA não garante a recuperação do veículo e o serviço NÃO é seguro: não cobre roubo, furto, colisão ou danos.');
      par('5.2. O bloqueio remoto só é enviado com o veículo parado ou em baixa velocidade, por segurança, e fica registrado com data, hora e autor. O CONTRATANTE é responsável pelo uso do PIN e pela guarda do acesso ao aplicativo.');
      par('5.3. Em caso de roubo ou furto, o CONTRATANTE deve registrar boletim de ocorrência e avisar a CONTRATADA, que fornecerá as informações de localização disponíveis às autoridades.');

      titulo('6. DADOS PESSOAIS (LGPD)');
      par('6.1. A localização e os dados do veículo são tratados apenas para executar este contrato (Lei 13.709/2018, art. 7º, V), acessíveis ao CONTRATANTE, a quem ele autorizar no aplicativo e à CONTRATADA para suporte. Os dados não são vendidos nem compartilhados, salvo por ordem judicial ou de autoridade competente.');
      par('6.2. Se o veículo for usado por outras pessoas (familiares, funcionários), o CONTRATANTE declara que elas foram informadas do rastreamento.');

      if (cfg.contrato_texto_extra?.trim()) {
        titulo('7. CONDIÇÕES ADICIONAIS');
        for (const p of cfg.contrato_texto_extra.trim().split(/\n+/)) par(p);
      }

      titulo(cfg.contrato_texto_extra?.trim() ? '8. FORO E ASSINATURA' : '7. FORO E ASSINATURA');
      par(`As partes elegem o foro da comarca de ${local || '___'} e reconhecem a validade da assinatura eletrônica deste contrato (MP 2.200-2/2001, art. 10, §2º, e Lei 14.063/2020).`);
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(8.5).text(`${local || ''}, ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric' })}.`, 50);

      if (doc.y > doc.page.height - 170) doc.addPage();
      doc.moveDown(4);
      const sigPage = pagina;
      const sigY = doc.y;
      const sigW = 200;
      doc.moveTo(50, sigY).lineTo(50 + sigW, sigY).strokeColor('#000').lineWidth(0.8).stroke();
      doc.moveTo(W - 50 - sigW, sigY).lineTo(W - 50, sigY).stroke();
      doc.font('Helvetica-Bold').fontSize(8).text(`CONTRATADA — ${contratada}`, 50, sigY + 4, { width: sigW, align: 'center' });
      doc.text(`CONTRATANTE — ${c.nome}`, W - 50 - sigW, sigY + 4, { width: sigW, align: 'center' });

      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.page.margins.bottom = 0;
        doc.font('Helvetica').fontSize(7).fillColor('#999').text(`${contratada} · Protocolo ${protocolo} · página ${i + 1} de ${range.count}`, 50, doc.page.height - 50, { align: 'center', width: W - 100 });
      }
      doc.end();
      // assinatura: a área fica ACIMA da linha (y da linha menos a altura da caixa)
      doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), sigPage, sigYFrac: Math.max(0, (sigY - 48) / doc.page.height) }));
    } catch (e) { reject(e); }
  });
}

async function docuseal(method: string, path: string, body?: unknown) {
  const r = await fetch(`${DOCUSEAL_URL}${path}`, {
    method, headers: { 'X-Auth-Token': DOCUSEAL_TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`DocuSeal ${r.status}: ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
}

const foneE164 = (t: string | null) => {
  const d = String(t || '').replace(/\D/g, '');
  if (d.length < 10) return undefined;
  return `+${d.startsWith('55') && d.length >= 12 ? d : `55${d}`}`;
};

/** Gera o PDF e manda para assinatura: empresa assina primeiro, cliente depois. */
export async function enviarContrato(db: SupabaseClient, empresaId: string, clienteId: string, autor: { nome: string; email: string | null }) {
  if (!DOCUSEAL_URL || !DOCUSEAL_TOKEN) throw new Error('Assinatura eletrônica não configurada no servidor (DOCUSEAL_URL/DOCUSEAL_TOKEN).');
  const [cfg, { data: cli }, { data: veics }] = await Promise.all([
    carregarConfig(db, empresaId),
    db.from('rastreio_clientes').select('id, tipo, nome, documento, email, telefone, endereco, cidade, mensalidade, dia_vencimento, forma_pagamento').eq('id', clienteId).eq('empresa_id', empresaId).maybeSingle(),
    db.from('rastreio_veiculos').select('placa, descricao, tem_bloqueio, modelo_rastreador, imei').eq('cliente_id', clienteId).eq('empresa_id', empresaId).eq('status', 'ativo').order('placa'),
  ]);
  if (!cli) throw new Error('Cliente não encontrado.');
  const c = cli as ClienteContrato;
  const vs = (veics || []) as VeiculoContrato[];
  const falta = pendenciasContrato(cfg, c, vs);
  if (falta.length) throw new Error(`Falta preencher: ${falta.join('; ')}.`);
  const emailEmpresa = cfg.emp_email || autor.email;
  if (!emailEmpresa) throw new Error('Informe o e-mail da empresa em Financeiro → Regras → Dados do contrato.');

  const protocolo = `RST-${Date.now().toString(36).toUpperCase()}`;
  const { buffer, sigPage, sigYFrac } = await gerarContratoRastreioPdf(cfg, c, vs, protocolo);

  const template = await docuseal('POST', '/templates/pdf', {
    name: `Contrato rastreamento — ${c.nome} (${protocolo})`,
    documents: [{
      name: 'contrato-rastreamento.pdf',
      file: buffer.toString('base64'),
      fields: [
        { name: 'Assinatura Contratada', role: 'Contratada', type: 'signature', required: true, areas: [{ x: 0.08, y: sigYFrac, w: 0.32, h: 0.06, page: sigPage }] },
        { name: 'Assinatura Contratante', role: 'Contratante', type: 'signature', required: true, areas: [{ x: 0.60, y: sigYFrac, w: 0.32, h: 0.06, page: sigPage }] },
      ],
    }],
  });
  const submitters = await docuseal('POST', '/submissions', {
    template_id: template.id, send_email: true, order: 'preserved',
    submitters: [
      { name: autor.nome, email: emailEmpresa, role: 'Contratada', order: 0 },
      { name: c.nome, role: 'Contratante', order: 1, ...(c.email ? { email: c.email } : {}), ...(foneE164(c.telefone) ? { phone: foneE164(c.telefone) } : {}) },
    ],
  }) as { submission_id?: number; slug: string; role: string }[];
  const emp = submitters.find(s => s.role === 'Contratada') || submitters[0];
  const cliS = submitters.find(s => s.role === 'Contratante') || submitters[1];
  const submissionId = String(emp?.submission_id ?? cliS?.submission_id ?? '');

  // Contrato anterior ainda não assinado deixa de valer
  await db.from('rastreio_contratos').update({ status: 'cancelado' }).eq('cliente_id', clienteId).eq('status', 'enviado');
  const linkEmpresa = emp ? `${DOCUSEAL_SIGN_BASE}/s/${emp.slug}` : null;
  const linkCliente = cliS ? `${DOCUSEAL_SIGN_BASE}/s/${cliS.slug}` : null;
  const { error } = await db.from('rastreio_contratos').insert({
    empresa_id: empresaId, cliente_id: clienteId, status: 'enviado', submission_id: submissionId || null,
    link_empresa: linkEmpresa, link_cliente: linkCliente, enviado_por: autor.nome,
  });
  if (error) throw new Error(`Contrato enviado, mas não foi registrado: ${error.message}`);
  return { linkEmpresa, linkCliente, protocolo };
}

/** Chamado pelo webhook do DocuSeal quando todos assinaram. true = era um contrato do Rastreio. */
export async function concluirContratoRastreio(db: SupabaseClient, submissionId: string, submissao: {
  documents?: { name?: string; url?: string }[]; audit_log_url?: string; combined_document_url?: string;
}) {
  const { data: ct } = await db.from('rastreio_contratos').select('id, cliente_id').eq('submission_id', submissionId).maybeSingle();
  if (!ct) return false;
  const arquivos: { nome: string; path: string }[] = [];
  const guardar = async (url: string, nome: string) => {
    const r = await fetch(url);
    if (!r.ok) return;
    const path = `rastreio/${ct.cliente_id}/${ct.id}/${nome}`;
    const { error } = await db.storage.from(BUCKET_CONTRATOS).upload(path, Buffer.from(await r.arrayBuffer()), { contentType: 'application/pdf', upsert: true });
    if (!error) arquivos.push({ nome, path });
  };
  try {
    if (submissao.combined_document_url) await guardar(submissao.combined_document_url, 'contrato_assinado.pdf');
    else for (const d of submissao.documents || []) if (d.url) await guardar(d.url, 'contrato_assinado.pdf');
    if (submissao.audit_log_url) await guardar(submissao.audit_log_url, 'certificado_assinatura.pdf');
  } catch { /* o status assinado vale mesmo se o arquivo falhar */ }
  await db.from('rastreio_contratos').update({ status: 'assinado', assinado_em: new Date().toISOString(), ...(arquivos.length ? { arquivos } : {}) }).eq('id', ct.id);
  return true;
}

/** Link temporário (1 h) para baixar o contrato assinado. */
export async function linkArquivoContrato(db: SupabaseClient, path: string) {
  const { data } = await db.storage.from(BUCKET_CONTRATOS).createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}
