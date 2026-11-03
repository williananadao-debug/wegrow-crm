// Executor de SQL no banco de produção (Supabase), sem precisar colar no SQL Editor.
//
//   node scripts/rodar-sql.mjs caminho/do/arquivo.sql [outro.sql ...]
//   node scripts/rodar-sql.mjs --sql "select count(*) from leads"
//
// Lê SUPABASE_DB_URL do .env.local (connection string do Supabase → Project Settings → Database →
// Session pooler, com a senha do banco). O .env.local não vai para o Git e o endereço nunca é
// impresso. Cada arquivo roda numa transação: se der erro no meio, nada daquele arquivo fica
// aplicado. Avisos (RAISE NOTICE) e o resultado do último SELECT aparecem no terminal.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

function lerEnv() {
  const arq = path.resolve('.env.local');
  if (!fs.existsSync(arq)) return {};
  const env = {};
  for (const linha of fs.readFileSync(arq, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

const url = process.env.SUPABASE_DB_URL || lerEnv().SUPABASE_DB_URL;
if (!url) {
  console.error('Falta SUPABASE_DB_URL no .env.local (Supabase → Project Settings → Database → Session pooler).');
  process.exit(1);
}

const args = process.argv.slice(2);
const tarefas = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--sql') tarefas.push({ nome: 'comando', sql: args[++i] });
  else tarefas.push({ nome: args[i], sql: fs.readFileSync(args[i], 'utf8') });
}
if (!tarefas.length) { console.error('Uso: node scripts/rodar-sql.mjs arquivo.sql | --sql "..."'); process.exit(1); }

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
client.on('notice', n => console.log(`  aviso: ${n.message}`));

let falhou = false;
try {
  await client.connect();
  for (const t of tarefas) {
    console.log(`\n▶ ${t.nome}`);
    // Arquivo que já gerencia transação própria ou usa comandos que não rodam dentro de uma
    // (ex.: CREATE INDEX CONCURRENTLY) roda sem o BEGIN/COMMIT de fora.
    const semTransacao = /\b(concurrently|begin\s*;|commit\s*;)/i.test(t.sql);
    try {
      if (!semTransacao) await client.query('begin');
      const res = await client.query(t.sql);
      if (!semTransacao) await client.query('commit');
      const lista = Array.isArray(res) ? res : [res];
      const ultimo = [...lista].reverse().find(r => r.command === 'SELECT' && r.rows);
      if (ultimo) {
        console.log(`  ${ultimo.rowCount} linha(s):`);
        if (ultimo.rows.length) console.table(ultimo.rows.slice(0, 50));
      }
      console.log('  ✔ ok');
    } catch (e) {
      falhou = true;
      if (!semTransacao) await client.query('rollback').catch(() => {});
      console.error(`  ✖ erro: ${e.message}${e.position ? ` (posição ${e.position})` : ''}${e.where ? `\n    onde: ${e.where}` : ''}`);
      console.error('  nada deste arquivo foi aplicado.');
      break;
    }
  }
} catch (e) {
  falhou = true;
  console.error(`Não consegui conectar ao banco: ${e.message}`);
} finally {
  await client.end().catch(() => {});
}
process.exit(falhou ? 1 : 0);
