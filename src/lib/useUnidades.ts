import { useState, useEffect } from 'react';
import { supabase } from './supabase';

export type ConfigOpec = {
  mercado_id?: string;
  mercado_codigo?: string;
  mercado_descricao?: string;
  mercado_cnpj?: string;
};

export type Unidade = {
  id: string;
  nome: string;
  razao_social?: string;
  cnpj?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  config_opec?: ConfigOpec | null;
};

export function useUnidades(empresaId?: string) {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [loading, setLoading] = useState(false);

  const recarregar = async () => {
    if (!empresaId) return;
    setLoading(true);
    const { data } = await supabase
      .from('unidades')
      .select('id, nome, razao_social, cnpj, endereco, cidade, estado, config_opec')
      .eq('empresa_id', empresaId)
      .order('nome');
    setUnidades(data || []);
    setLoading(false);
  };

  useEffect(() => { recarregar(); }, [empresaId]);

  return { unidades, loading, recarregar };
}
