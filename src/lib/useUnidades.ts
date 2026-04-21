import { useState, useEffect } from 'react';
import { supabase } from './supabase';

export type Unidade = {
  id: string;
  nome: string;
  razao_social?: string;
  cnpj?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
};

export function useUnidades(empresaId?: string) {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [loading, setLoading] = useState(false);

  const recarregar = async () => {
    if (!empresaId) return;
    setLoading(true);
    const { data } = await supabase
      .from('unidades')
      .select('id, nome, razao_social, cnpj, endereco, cidade, estado')
      .eq('empresa_id', empresaId)
      .order('nome');
    setUnidades(data || []);
    setLoading(false);
  };

  useEffect(() => { recarregar(); }, [empresaId]);

  return { unidades, loading, recarregar };
}
