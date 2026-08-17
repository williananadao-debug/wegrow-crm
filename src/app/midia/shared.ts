// Payloads da API "Demais FM Comercial" do Leo (spec-api-demais-fm-comercial-v2) —
// audiência e site substituem os antigos campos manuais; downloads do app, monetização
// e aniversários são confidenciais (classe "interno"), restritos a diretor/gerente.
export type {
  DemaisFmAudienciaItem,
  DemaisFmAudienciaResposta,
  DemaisFmSiteItem,
  DemaisFmSiteResposta,
  DemaisFmAppDownloadItem,
  DemaisFmAppDownloadsResposta,
  DemaisFmMonetizacaoItem,
  DemaisFmMonetizacaoResposta,
  DemaisFmRedesSociaisItem,
  DemaisFmRedesSociaisTotalRede,
  DemaisFmRedesSociaisResposta,
  DemaisFmAniversarioItem,
  DemaisFmAniversariosResposta,
} from '@/lib/demais-fm-api';

export type MidiaMetricasMensais = {
  id: number;
  empresa_id: string;
  ano: number;
  mes: number;
  ouvintes_por_minuto_estimado: number | null;
  site_acessos: number | null;
  youtube_visualizacoes: number | null;
  youtube_observacoes: string | null;
  instagram_demais_news_visualizacoes: number | null;
  instagram_demais_news_interacoes: number | null;
  instagram_demais_news_seguidores: number | null;
  redes_sociais_visualizacoes: number | null;
  redes_sociais_interacoes: number | null;
  redes_sociais_visitas_perfil: number | null;
  app_downloads_apple_total: number | null;
  app_downloads_android_total: number | null;
  monetizacao_valor: number | null;
};

export type MidiaMetaConfig = {
  id: number;
  empresa_id: string;
  ig_business_account_id: string | null;
  fb_page_id: string | null;
  access_token: string | null;
  token_atualizado_em: string | null;
  youtube_channel_id: string | null;
  youtube_oauth_refresh_token: string | null;
  youtube_oauth_conectado_em: string | null;
};

export type InstagramInsightsResposta = {
  ano: number;
  mes: number;
  seguidores: number;
  visualizacoes: number;
  interacoes: number;
  visitasPerfil: number;
};

export type YoutubeInsightsResposta = {
  inscritos: number;
  visualizacoesTotais: number;
  videos: number;
};

export const MESES_LABEL = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

export const PRACAS = ['101.1', '104.7', '107.9'] as const;
export const PRACA_CIDADE_SEDE: Record<string, string> = {
  '101.1': 'Itaiópolis',
  '104.7': 'Taió',
  '107.9': 'Presidente Getúlio',
};

export type MidiaEmissoraAudiencia = {
  id: number;
  empresa_id: string;
  praca: string;
  ano: number;
  mes: number;
  ouvintes_por_minuto: number | null;
  share_audiencia: number | null;
};

export type MidiaAniversarioMunicipio = {
  id: number;
  empresa_id: string;
  municipio: string;
  uf: string | null;
  praca: string | null;
  dia: number;
  mes: number;
  observacao: string | null;
  ativo: boolean;
};

export type StatusVendaAniversario = 'nao_vendido' | 'sem_registro' | 'vendido' | 'vendido_sem_valor';

export type MidiaAniversarioResultado = {
  id: number;
  empresa_id: string;
  aniversario_id: number;
  ano: number;
  status: StatusVendaAniversario;
  valor: number | null;
  observacao: string | null;
};

export const STATUS_VENDA_LABELS: Record<StatusVendaAniversario, string> = {
  nao_vendido: 'Não vendido',
  sem_registro: 'Sem registro',
  vendido: 'Vendido',
  vendido_sem_valor: 'Vendido s/ valor',
};

export const STATUS_VENDA_CORES: Record<StatusVendaAniversario, string> = {
  nao_vendido: 'text-slate-400 bg-white/5 border-white/10',
  sem_registro: 'text-slate-500 bg-white/5 border-white/10',
  vendido: 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20',
  vendido_sem_valor: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
};

// Mesmo padrão de normalização usado no Reports/Max — remove acento e caixa pra casar
// nome de município digitado de formas ligeiramente diferentes no CRM.
export const normalizarNomeCidade = (str: string) => {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/gi, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
};

export type LeadCrmResumo = {
  id: number;
  empresa: string;
  cidade: string | null;
  valor_total: number;
  vendedor_nome: string | null;
  created_at: string;
};

// Data recorrente (só dia/mês) — calcula quantos dias faltam pra próxima ocorrência,
// já virando o ano quando a data deste ano já passou.
export function diasAteProximaOcorrencia(dia: number, mes: number, hoje = new Date()): number {
  const ano = hoje.getFullYear();
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  let proxima = new Date(ano, mes - 1, dia);
  if (proxima < hojeSemHora) proxima = new Date(ano + 1, mes - 1, dia);
  return Math.round((proxima.getTime() - hojeSemHora.getTime()) / 86400000);
}

// Lista de cidades atendidas pelas 3 praças da Demais FM, com data de emancipação
// pesquisada (Wikipédia — "Lista de municípios de Santa Catarina por data de criação"
// + fontes oficiais pra Rio Negro/PR). ⚠️ Em alguns municípios a data comemorada
// localmente é a de INSTALAÇÃO, não a da lei de criação (ex.: Taió: lei 30/12/1948,
// instalação 12/02/1949) — vale confirmar com cada prefeitura antes de usar pra vender.
// ⚠️ Confronto com o painel real de vendas 2026: o mês em que cada cidade aparece pra
// venda no painel da IAlto NÃO bate com a data legal de criação da Wikipédia em boa
// parte dos casos (13 de 26). Priorizei o mês do painel (é o que a operação usa de
// verdade) — nesses casos o DIA fica como 1 (placeholder, não confirmado) e a
// observação avisa. Confirmar dia exato com cada prefeitura antes de usar pra vender.
export const SUGESTOES_ANIVERSARIOS_DEMAIS_FM: { municipio: string; uf: string; praca: string; dia: number; mes: number; observacao?: string }[] = [
  { municipio: 'Ibirama', uf: 'SC', praca: '107.9', dia: 1, mes: 3, observacao: 'Painel de vendas usa março; Wikipédia (lei de criação) diz 17/02/1934 — dia não confirmado' },
  { municipio: 'José Boiteux', uf: 'SC', praca: '107.9', dia: 26, mes: 4 },
  { municipio: 'Rio do Sul', uf: 'SC', praca: '107.9 / 104.7', dia: 1, mes: 4, observacao: 'Cobertura sobreposta 107.9/104.7 — painel de vendas usa abril nas duas; Wikipédia (lei de criação) diz 10/10/1930 — dia não confirmado' },
  { municipio: 'Dona Emma', uf: 'SC', praca: '107.9', dia: 17, mes: 5 },
  { municipio: 'Apiúna', uf: 'SC', praca: '107.9', dia: 1, mes: 6, observacao: 'Painel de vendas usa junho; Wikipédia (lei de criação) diz 04/01/1988 — dia não confirmado' },
  { municipio: 'Presidente Getúlio', uf: 'SC', praca: '107.9', dia: 1, mes: 6, observacao: 'Painel de vendas usa junho; Wikipédia (lei de criação) diz 30/12/1953 — dia não confirmado' },
  { municipio: 'Lontras', uf: 'SC', praca: '107.9', dia: 19, mes: 12 },
  { municipio: 'Taió', uf: 'SC', praca: '104.7', dia: 12, mes: 2, observacao: 'Lei de criação foi 30/12/1948, mas a instalação (e o que o painel de vendas usa) foi 12/02/1949 — confirmado batendo com o painel' },
  { municipio: 'Vitor Meireles', uf: 'SC', praca: '104.7', dia: 26, mes: 4 },
  { municipio: 'Rio do Oeste', uf: 'SC', praca: '104.7', dia: 21, mes: 6 },
  { municipio: 'Santa Cecília', uf: 'SC', praca: '104.7', dia: 21, mes: 6 },
  { municipio: 'Witmarsum', uf: 'SC', praca: '104.7', dia: 1, mes: 6, observacao: 'Painel de vendas usa junho; Wikipédia (lei de criação) diz 17/05/1962 — dia não confirmado' },
  { municipio: 'Pouso Redondo', uf: 'SC', praca: '104.7', dia: 1, mes: 7, observacao: 'Painel de vendas usa julho; Wikipédia (lei de criação) diz 21/06/1958 — dia não confirmado' },
  { municipio: 'Braço do Trombudo', uf: 'SC', praca: '104.7', dia: 26, mes: 9 },
  { municipio: 'Mirim Doce', uf: 'SC', praca: '104.7', dia: 26, mes: 9 },
  { municipio: 'Santa Terezinha', uf: 'SC', praca: '104.7 / 101.1', dia: 26, mes: 9, observacao: 'Cobertura sobreposta 104.7/101.1 — evitar dupla contagem' },
  { municipio: 'Rio do Campo', uf: 'SC', praca: '104.7', dia: 20, mes: 12 },
  { municipio: 'Salete', uf: 'SC', praca: '104.7', dia: 20, mes: 12 },
  { municipio: 'Major Vieira', uf: 'SC', praca: '101.1', dia: 1, mes: 1, observacao: 'Painel de vendas usa janeiro; Wikipédia (lei de criação) diz 23/12/1960 — dia não confirmado' },
  { municipio: 'Campo Alegre', uf: 'SC', praca: '101.1', dia: 1, mes: 3, observacao: 'Painel de vendas usa março; Wikipédia (lei de criação) diz 17/10/1896 — dia não confirmado' },
  { municipio: 'Papanduva', uf: 'SC', praca: '101.1', dia: 1, mes: 4, observacao: 'Painel de vendas usa abril; Wikipédia (lei de criação) diz 30/12/1953 — dia não confirmado' },
  { municipio: 'Rio Negrinho', uf: 'SC', praca: '101.1', dia: 1, mes: 4, observacao: 'Painel de vendas usa abril; Wikipédia (lei de criação) diz 30/12/1953 — dia não confirmado' },
  { municipio: 'Monte Castelo', uf: 'SC', praca: '101.1', dia: 1, mes: 5, observacao: 'Painel de vendas usa maio; Wikipédia (lei de criação) diz 23/04/1962 — dia não confirmado' },
  { municipio: 'Mafra', uf: 'SC', praca: '101.1', dia: 1, mes: 9, observacao: 'Painel de vendas usa setembro; Wikipédia (lei de criação) diz 25/08/1917 — dia não confirmado' },
  { municipio: 'São Bento do Sul', uf: 'SC', praca: '101.1', dia: 1, mes: 9, observacao: 'Painel de vendas usa setembro; Wikipédia (lei de criação) diz 21/05/1883 — dia não confirmado' },
  { municipio: 'Itaiópolis', uf: 'SC', praca: '101.1', dia: 28, mes: 10 },
  { municipio: 'Rio Negro', uf: 'PR', praca: '101.1', dia: 15, mes: 11, observacao: 'Data de instalação/comemorada — decreto de criação foi 02/04/1870' },
];

// Resultado de venda 2026 de cada cidade, extraído do painel de prestação de contas da
// IAlto (aba Aniversários). Casado por nome de município com SUGESTOES_ANIVERSARIOS_DEMAIS_FM.
export const SUGESTOES_RESULTADOS_ANIVERSARIOS_2026: { municipio: string; status: StatusVendaAniversario; valor?: number; observacao?: string }[] = [
  { municipio: 'Ibirama', status: 'vendido_sem_valor', observacao: 'Teve divulgação da festa do município, porém não foi fechado pacote de aniversário' },
  { municipio: 'José Boiteux', status: 'vendido', valor: 957.00, observacao: '2 pacotes de aniversário (15 spots de 10 seg): Confecções Ivolinda R$ 478,50 e Conservas Alveira R$ 478,50. Também foi vendida divulgação para a festa (valor não registrado)' },
  { municipio: 'Rio do Sul', status: 'nao_vendido', observacao: 'Não foi vendido (reportado igual nas duas praças, 107.9 e 104.7)' },
  { municipio: 'Dona Emma', status: 'vendido_sem_valor', observacao: 'Vendida divulgação da festa do município (valor não registrado)' },
  { municipio: 'Apiúna', status: 'nao_vendido', observacao: 'Não foi vendido' },
  { municipio: 'Presidente Getúlio', status: 'vendido', valor: 12161.50, observacao: 'Prefeitura Municipal R$ 9.000,00 + estande; YG Empreendimentos R$ 638,00; Bela Visione R$ 450,00; Ivo Motos R$ 478,50; Morangos Vitória R$ 478,50; Impacto Têxtil R$ 478,50; Dalila Têxtil R$ 638,00. O estande é contrapartida não monetizada' },
  { municipio: 'Lontras', status: 'sem_registro' },
  { municipio: 'Taió', status: 'nao_vendido', observacao: 'Não foi vendido. A Prefeitura usou as inserções que já tinha para divulgar as comemorações da festa' },
  { municipio: 'Vitor Meireles', status: 'nao_vendido', observacao: 'Não foi vendido' },
  { municipio: 'Rio do Oeste', status: 'nao_vendido', observacao: 'Não foi vendido' },
  { municipio: 'Santa Cecília', status: 'nao_vendido', observacao: 'Não foi vendido' },
  { municipio: 'Witmarsum', status: 'nao_vendido', observacao: 'Não foi vendido' },
  { municipio: 'Pouso Redondo', status: 'nao_vendido' },
  { municipio: 'Braço do Trombudo', status: 'sem_registro' },
  { municipio: 'Mirim Doce', status: 'sem_registro' },
  { municipio: 'Santa Terezinha', status: 'sem_registro' },
  { municipio: 'Rio do Campo', status: 'sem_registro' },
  { municipio: 'Salete', status: 'sem_registro' },
  { municipio: 'Major Vieira', status: 'nao_vendido', observacao: 'Não foi vendido' },
  { municipio: 'Campo Alegre', status: 'nao_vendido', observacao: 'Não foi vendido' },
  { municipio: 'Papanduva', status: 'nao_vendido', observacao: 'Não foi vendido' },
  { municipio: 'Rio Negrinho', status: 'nao_vendido', observacao: 'Não foi vendido' },
  { municipio: 'Monte Castelo', status: 'nao_vendido', observacao: 'Não foi vendido' },
  { municipio: 'Mafra', status: 'sem_registro' },
  { municipio: 'São Bento do Sul', status: 'sem_registro' },
  { municipio: 'Itaiópolis', status: 'sem_registro' },
  { municipio: 'Rio Negro', status: 'sem_registro' },
];

export const fmtCompacto = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtMoeda = (v: number | null | undefined) =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

export const fmtNumero = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString('pt-BR');
