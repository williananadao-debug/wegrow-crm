// Catálogo do produto: o que existe (módulos), como cada setor nasce configurado (modelos) e
// quem pode usar cada recurso fino. Fonte única pra telas, God Mode e Portal do Parceiro —
// antes cada tela checava `modulos.x` do seu jeito e coisas de fábrica (acessos sem e-mail,
// almoxarifado) apareciam numa rádio.
//
// Os módulos continuam gravados em empresas.modulos (JSON). Aqui só fica a regra.

export type Modulos = Record<string, any>;

export type ChaveModulo =
  | 'crm' | 'opec' | 'ia' | 'whatsapp' | 'financeiro' | 'assinatura' | 'redes_sociais' | 'nexus'
  | 'pulse' | 'portal_cliente' | 'thor' | 'max' | 'obras' | 'argus' | 'veiculos' | 'midia' | 'advocacia';

export const MODULOS: Record<ChaveModulo, { nome: string; descricao: string }> = {
  crm:            { nome: 'CRM', descricao: 'Funil de vendas, clientes, propostas, metas e visitas' },
  opec:           { nome: 'OPEC (rádio)', descricao: 'Produção de áudio e integração do contrato com a programação' },
  ia:             { nome: 'IA de prospecção', descricao: 'Pesquisa de empresas e sugestão de abordagem' },
  whatsapp:       { nome: 'WhatsApp', descricao: 'Conversas e follow-up pelo WhatsApp' },
  financeiro:     { nome: 'Financeiro', descricao: 'Contas a pagar/receber, cobrança Pix/boleto e NFS-e' },
  assinatura:     { nome: 'Assinatura eletrônica', descricao: 'Contrato assinado pelo celular (DocuSeal)' },
  redes_sociais:  { nome: 'Redes sociais', descricao: 'Planejamento e publicação de posts' },
  nexus:          { nome: 'Nexus', descricao: 'Central de atendimento e tarefas' },
  pulse:          { nome: 'Pulse (fábrica)', descricao: 'Estoque, produção, notas de entrada/saída e chão de fábrica' },
  portal_cliente: { nome: 'Portal do Cliente', descricao: 'Cliente acompanha o pedido por link' },
  thor:           { nome: 'THOR', descricao: 'Assistente de dados do negócio' },
  max:            { nome: 'Max', descricao: 'Assistente comercial com catálogo' },
  obras:          { nome: 'Obras', descricao: 'Gestão de obras e medições' },
  argus:          { nome: 'Argus', descricao: 'Torre de controle (licitações ou veículos)' },
  veiculos:       { nome: 'Veículos', descricao: 'Veículo de referência no lead' },
  midia:          { nome: 'Comercial de mídia', descricao: 'Grade e mapa comercial de rádio' },
  advocacia:      { nome: 'Advocacia', descricao: 'CRM jurídico com processos' },
};

// Modelos por setor: com quais módulos a empresa nasce. O God Mode e o Portal do Parceiro
// criam a empresa a partir de um modelo; depois os módulos podem ser ajustados um a um.
export type Setor = 'radio' | 'fabrica' | 'comercio_servicos' | 'obras' | 'advocacia' | 'licitacao' | 'veiculos';

export const SETORES: Record<Setor, { nome: string; descricao: string; modulos: Modulos }> = {
  radio:             { nome: 'Rádio / emissora', descricao: 'Venda de mídia, contrato, produção e OPEC', modulos: { crm: true, opec: true } },
  fabrica:           { nome: 'Fábrica / indústria', descricao: 'Venda técnica, estoque, produção e notas', modulos: { crm: true, pulse: true, financeiro: true } },
  comercio_servicos: { nome: 'Comércio e serviços', descricao: 'Funil de vendas e carteira de clientes', modulos: { crm: true } },
  obras:             { nome: 'Construção / obras', descricao: 'Obras, medições e funil', modulos: { crm: true, obras: true } },
  advocacia:         { nome: 'Advocacia', descricao: 'CRM jurídico', modulos: { crm: false, advocacia: true } },
  licitacao:         { nome: 'Licitações', descricao: 'Torre de controle de licitações', modulos: { crm: false, argus: true, argus_vertical: 'licitacao' } },
  veiculos:          { nome: 'Loja de veículos', descricao: 'Estoque de veículos e funil', modulos: { crm: true, veiculos: true, argus: true, argus_vertical: 'veiculos' } },
};

// Módulos de um setor, já marcando de qual modelo a empresa veio (modulos.setor).
export function modulosDoSetor(setor: Setor, extras: Modulos = {}): Modulos {
  return { ...SETORES[setor].modulos, setor, ...extras };
}

// Aplica um modelo a uma empresa existente: liga o que o modelo liga e desliga os módulos
// de outros setores. Rótulos internos (demo) e add-ons comprados à parte ficam como estão.
const ADDONS_AVULSOS: string[] = ['assinatura', 'whatsapp', 'ia', 'financeiro', 'redes_sociais', 'portal_cliente', 'thor', 'max', 'nexus'];
export function aplicarSetor(atuais: Modulos, setor: Setor): Modulos {
  const novo: Modulos = { ...atuais };
  for (const chave of Object.keys(MODULOS)) {
    if (ADDONS_AVULSOS.includes(chave)) continue;
    if (chave === 'crm') continue;
    novo[chave] = false;
  }
  return { ...novo, ...SETORES[setor].modulos, setor };
}

export function moduloAtivo(modulos: Modulos | null | undefined, chave: ChaveModulo): boolean {
  const m = modulos || {};
  // Ausente conta como ligado só pro CRM (empresas anteriores ao flag)
  return chave === 'crm' ? m.crm !== false : Boolean(m[chave]);
}

// Recursos finos: o que cada tela pergunta ("esta empresa pode X?"). A regra mora aqui.
export type Recurso =
  | 'equipe.acessos_sem_email'   // logins sem e-mail em lote (chão de fábrica)
  | 'equipe.cargo_almoxarifado'
  | 'equipe.cargo_producao'
  | 'equipe.cargo_opec'
  | 'vendas.funil_fabrica'       // funil técnico com engenharia/aprovação
  | 'catalogo.materia_prima';

const REGRAS: Record<Recurso, (m: Modulos) => boolean> = {
  'equipe.acessos_sem_email':  m => moduloAtivo(m, 'pulse'),
  'equipe.cargo_almoxarifado': m => moduloAtivo(m, 'pulse'),
  'equipe.cargo_producao':     m => moduloAtivo(m, 'pulse') || moduloAtivo(m, 'opec'),
  'equipe.cargo_opec':         m => moduloAtivo(m, 'opec'),
  'vendas.funil_fabrica':      m => moduloAtivo(m, 'pulse') && moduloAtivo(m, 'crm'),
  'catalogo.materia_prima':    m => moduloAtivo(m, 'pulse'),
};

export function temRecurso(modulos: Modulos | null | undefined, recurso: Recurso): boolean {
  return REGRAS[recurso](modulos || {});
}

// Planos comerciais (referência de preço e do que entra em cada um). A cobrança usa o valor
// negociado de cada cliente (clientes_wegrow.valor_mensal); isto é o padrão de tabela.
export const PLANOS = {
  essencial:  { nome: 'Essencial',  preco: 497,  resumo: 'CRM completo, usuários ilimitados, app no celular' },
  pro:        { nome: 'Pro',        preco: 897,  resumo: '+ IA de prospecção, risco por CNPJ, relatórios, produção e multi-unidade' },
  enterprise: { nome: 'Enterprise', preco: 1497, resumo: '+ API pública, implantação dedicada, SLA de 4h, multiempresa' },
} as const;
