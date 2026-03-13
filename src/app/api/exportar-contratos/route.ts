import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const tokenCorreto = `Bearer ${process.env.TOKEN_INTEGRACAO_OPEC}`;

    if (!authHeader || authHeader !== tokenCorreto) {
      return NextResponse.json({ error: 'Acesso Negado: Token inválido ou ausente.' }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Busca os contratos Ganhos
    const { data: contratos, error: contratosError } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('status', 'ganho')
      .order('created_at', { ascending: false });

    if (contratosError) throw contratosError;

    // 2. Busca os CPFs dos vendedores na tabela profiles
    const { data: perfis } = await supabaseAdmin
      .from('profiles')
      .select('id, cpf');

    // Mapeia os CPFs para ficar fácil de achar
    const cpfMap: Record<string, string> = {};
    if (perfis) {
      perfis.forEach(p => { cpfMap[p.id] = p.cpf || ""; });
    }

    // 3. O Mapeamento (De / Para): Agora com o CPF!
    const dadosParaOpec = contratos.map(c => {
      let itensFormatados = [];
      try {
        const itensArray = Array.isArray(c.itens) ? c.itens : JSON.parse(c.itens || '[]');
        itensFormatados = itensArray.map((item: any, idx: number) => ({
          iditem: (idx + 1).toString(),
          programa: item.servico || "",
          quantidade: item.quantidade?.toString() || "1",
          valor_total: (Number(item.precoUnitario || 0) * Number(item.quantidade || 1)).toFixed(2)
        }));
      } catch (e) {
        itensFormatados = [];
      }

      return {
        numero_contrato: c.id.toString(),
        cliente: c.empresa || "",
        cnpj_cliente: c.cnpj || "",
        vendedor: c.vendedor_nome || "",
        // 👇 AQUI ESTÁ O CPF NOVO ENTRANDO NO JSON 👇
        cpf_vendedor: cpfMap[c.user_id] || "", 
        valor_total: c.valor_total?.toString() || "0",
        data_contrato: c.created_at ? c.created_at.split('T')[0] : "",
        data_inicio: c.contrato_inicio || "",
        data_fim: c.contrato_fim || "",
        observacao_proposta: c.descricao || "",
        itens: itensFormatados
      };
    });

    return NextResponse.json(dadosParaOpec);

  } catch (error: any) {
    console.error("Erro na exportação para OPEC:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}