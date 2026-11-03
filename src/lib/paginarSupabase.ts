// O Supabase devolve no máximo 1000 linhas por consulta (mesmo com .limit maior). Busca a 1ª página
// sozinha — quase sempre o recorte cabe nela e é 1 requisição só — e só quando ela vem cheia busca
// as seguintes, 3 por vez em paralelo. montar() precisa devolver uma query nova a cada chamada.
export async function paginarSupabase<T = any>(montar: () => any, max = 20000): Promise<{ data: T[]; error: any }> {
  const primeira = await montar().range(0, 999);
  if (primeira.error) return { data: [], error: primeira.error };
  const todos: T[] = [...(primeira.data || [])];
  if (todos.length < 1000) return { data: todos, error: null };
  for (let de = 1000; de < max; de += 3000) {
    const lote = await Promise.all([0, 1, 2].map(i => montar().range(de + i * 1000, de + i * 1000 + 999)));
    for (const { data, error } of lote) {
      if (error) return { data: todos, error };
      todos.push(...(data || []));
      if (!data || data.length < 1000) return { data: todos, error: null };
    }
  }
  return { data: todos, error: null };
}
