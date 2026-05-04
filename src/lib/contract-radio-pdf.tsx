import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, padding: 40, color: '#000', lineHeight: 1.5 },
  center: { textAlign: 'center' },
  bold: { fontFamily: 'Helvetica-Bold' },
  h2: { fontFamily: 'Helvetica-Bold', fontSize: 13, textAlign: 'center', textTransform: 'uppercase', marginBottom: 4 },
  h3: { fontFamily: 'Helvetica-Bold', fontSize: 9, textTransform: 'uppercase', marginTop: 14, marginBottom: 4, borderBottom: '1pt solid #999', paddingBottom: 2 },
  intro: { textAlign: 'justify', marginBottom: 10, lineHeight: 1.6 },
  row: { flexDirection: 'row', gap: 20, marginBottom: 3 },
  label: { fontFamily: 'Helvetica-Bold' },
  table: { marginBottom: 10 },
  th: { fontFamily: 'Helvetica-Bold', textAlign: 'center', backgroundColor: '#f0f0f0', padding: 5, border: '1pt solid #000', fontSize: 8 },
  td: { padding: 5, border: '1pt solid #000', fontSize: 8 },
  tdRight: { padding: 5, border: '1pt solid #000', fontSize: 8, textAlign: 'right' },
  tdCenter: { padding: 5, border: '1pt solid #000', fontSize: 8, textAlign: 'center' },
  tableRow: { flexDirection: 'row' },
  col1: { flex: 3 },
  col2: { flex: 1 },
  col3: { flex: 1.2 },
  cond: { fontSize: 8, marginBottom: 2 },
  sigBlock: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 60 },
  sigLine: { width: '42%', borderTop: '1pt solid #000', paddingTop: 4, textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 8 },
  footer: { marginTop: 20, fontSize: 7, color: '#666', textAlign: 'center' },
});

export type ContratoData = {
  protocolo: string;
  // Executante
  emissora_razao: string;
  emissora_endereco: string;
  emissora_cnpj: string;
  emissora_nome: string;
  // Cliente
  cliente: string;
  cnpj: string;
  inscricao_estadual: string;
  telefone: string;
  cidade: string;
  // Período
  contrato_inicio: string;
  contrato_fim: string;
  // Itens
  itens: { servico: string; quantidade: number; precoUnitario: number }[];
  desconto: number;
  valor_total: number;
  // Pagamento
  parcelas: string;
  vencimento: string;
};

function fmt(v: number) {
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function fmtData(d: string) {
  if (!d) return '___/___/______';
  try {
    const dt = new Date(d + (d.length === 10 ? 'T12:00:00' : ''));
    return dt.toLocaleDateString('pt-BR');
  } catch { return d; }
}

export function ContratoRadioPDF({ d }: { d: ContratoData }) {
  const subtotal = d.itens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0);
  const temDesconto = d.desconto > 0;

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={{ marginBottom: 12, alignItems: 'center' }}>
          <Text style={s.h2}>Contrato para Veiculação de Publicidade</Text>
          <Text style={{ fontSize: 8, color: '#555', marginTop: 2 }}>{d.emissora_nome} · Protocolo #{d.protocolo}</Text>
        </View>

        {/* Intro */}
        <Text style={s.intro}>
          Que entre si fazem de um lado a empresa <Text style={s.bold}>{d.emissora_razao}</Text>, emissora de radiodifusão com sede à {d.emissora_endereco}, CNPJ: {d.emissora_cnpj}, neste ato representada denominada de EXECUTANTE, e de outro lado o CLIENTE:
        </Text>

        {/* Dados do cliente */}
        <View style={{ marginBottom: 10, lineHeight: 1.8 }}>
          <Text><Text style={s.label}>CLIENTE: </Text>{d.cliente.toUpperCase()}</Text>
          <Text><Text style={s.label}>Razão Social: </Text>{d.cliente.toUpperCase()}</Text>
          <Text><Text style={s.label}>Nome Fantasia: </Text>{d.cliente.toUpperCase()}</Text>
          <View style={s.row}>
            <Text><Text style={s.label}>Inscrição CNPJ: </Text>{d.cnpj || '_________________________________'}</Text>
            <Text><Text style={s.label}>Inscrição Estadual: </Text>{d.inscricao_estadual || '_________________'}</Text>
          </View>
          <View style={s.row}>
            <Text><Text style={s.label}>Fone: </Text>{d.telefone || '___________________________'}</Text>
            <Text><Text style={s.label}>Município: </Text>{d.cidade || '___________________________'}</Text>
          </View>
        </View>

        <Text style={s.intro}>
          Visando a veiculação e divulgação da publicidade do CLIENTE acima, por meio da emissora de FM da EXECUTANTE, tudo conforme as condições a seguir indicadas.
        </Text>

        {/* Seção 1 */}
        <Text style={s.h3}>1. Veiculação/Custo da Publicidade</Text>
        <View style={[s.row, { marginBottom: 6 }]}>
          <Text style={s.bold}>INÍCIO DO CONTRATO: <Text style={{ fontFamily: 'Helvetica' }}>{fmtData(d.contrato_inicio)}</Text></Text>
          <Text style={s.bold}>TÉRMINO DO CONTRATO: <Text style={{ fontFamily: 'Helvetica' }}>{fmtData(d.contrato_fim)}</Text></Text>
        </View>

        <View style={s.table}>
          <View style={s.tableRow}>
            <View style={s.col1}><Text style={s.th}>PROGRAMAÇÃO</Text></View>
            <View style={s.col2}><Text style={s.th}>QUANT.</Text></View>
            <View style={s.col3}><Text style={s.th}>VALOR R$</Text></View>
          </View>
          {d.itens.map((item, i) => (
            <View key={i} style={s.tableRow}>
              <View style={s.col1}><Text style={s.td}>{item.servico}</Text></View>
              <View style={s.col2}><Text style={s.tdCenter}>{item.quantidade}</Text></View>
              <View style={s.col3}><Text style={s.tdRight}>{fmt(item.quantidade * item.precoUnitario)}</Text></View>
            </View>
          ))}
          {temDesconto && (
            <View style={s.tableRow}>
              <View style={s.col1}><Text style={[s.td, { fontFamily: 'Helvetica-Bold' }]}>Subtotal</Text></View>
              <View style={s.col2}><Text style={s.tdCenter}></Text></View>
              <View style={s.col3}><Text style={s.tdRight}>{fmt(subtotal)}</Text></View>
            </View>
          )}
          {temDesconto && (
            <View style={s.tableRow}>
              <View style={s.col1}><Text style={[s.td, { fontFamily: 'Helvetica-Bold' }]}>Desconto</Text></View>
              <View style={s.col2}><Text style={s.tdCenter}></Text></View>
              <View style={s.col3}><Text style={[s.tdRight, { color: '#c00' }]}>- {fmt(d.desconto)}</Text></View>
            </View>
          )}
          <View style={s.tableRow}>
            <View style={s.col1}><Text style={[s.td, { fontFamily: 'Helvetica-Bold', textAlign: 'right' }]}>TOTAL</Text></View>
            <View style={s.col2}><Text style={s.tdCenter}></Text></View>
            <View style={s.col3}><Text style={[s.tdRight, { fontFamily: 'Helvetica-Bold' }]}>{fmt(d.valor_total)}</Text></View>
          </View>
        </View>

        {/* Seção 2 */}
        <Text style={s.h3}>2. Outras Condições</Text>
        <View style={{ marginBottom: 10 }}>
          <Text style={s.cond}>1) O presente contrato tem caráter irrevogável;</Text>
          <Text style={s.cond}>2) As inserções objeto do presente contrato são intransferíveis;</Text>
          <Text style={s.cond}>3) As parcelas pagas fora do prazo de seus vencimentos incidirão em juros e mora estabelecidos na fatura;</Text>
          <Text style={s.cond}>4) O presente contrato somente poderá ser rescindido 30 (trinta) dias após sua contratação;</Text>
          <Text style={s.cond}>5) Caso o cliente solicite a rescisão antecipada do contrato (antes do término da vigência total acordada), esta só produzirá efeitos ao final do ciclo mensal de veiculação em andamento, considerando-se ciclos de 30 (trinta) dias corridos contados a partir do início do contrato. Cancelamentos não terão efeito imediato e não serão proporcionais.</Text>
          <Text style={s.cond}>6) Fica eleito o Fórum da Cidade de Taió para dirimir dúvidas ou questões oriundas do presente, bem como para ser ajuizada ação de cobrança.</Text>
        </View>

        {/* Seção 3 */}
        <Text style={s.h3}>3. Forma de Pagamento</Text>
        <View style={{ marginBottom: 10, lineHeight: 1.8 }}>
          <Text><Text style={s.label}>Parcela(s): </Text>{d.parcelas || '___'}</Text>
          <Text><Text style={s.label}>Vencimento(s): </Text>{fmtData(d.vencimento)}</Text>
          <Text style={{ marginTop: 4 }}><Text style={s.label}>Contato para envio da Fatura — WhatsApp: </Text>{d.telefone || '___________________________'}</Text>
          <Text><Text style={s.label}>Praça de Pagamento: </Text>{d.cidade || '___________________________'}</Text>
        </View>

        {/* Assinaturas */}
        <View style={s.sigBlock}>
          <View style={s.sigLine}>
            <Text>Assinatura do Cliente</Text>
          </View>
          <View style={s.sigLine}>
            <Text>Representante da {d.emissora_nome || 'Emissora'}</Text>
          </View>
        </View>

        <Text style={s.footer}>
          {d.emissora_razao} · CNPJ {d.emissora_cnpj} · Gerado em {new Date().toLocaleDateString('pt-BR')}
        </Text>
      </Page>
    </Document>
  );
}

export async function gerarContratoBuffer(data: ContratoData): Promise<Buffer> {
  const element = React.createElement(ContratoRadioPDF, { d: data });
  return await renderToBuffer(element as any);
}
