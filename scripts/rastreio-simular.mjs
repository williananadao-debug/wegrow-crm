// Simula um rastreador andando, mandando posições no mesmo formato do forward do Traccar.
// Serve para testar o módulo Rastreio sem aparelho e sem servidor Traccar.
//
//   node scripts/rastreio-simular.mjs <IMEI> [url-base] [pontos]
//   ex.: node scripts/rastreio-simular.mjs 359339070000001 http://localhost:3000 40
//
// Lê TRACCAR_WEBHOOK_TOKEN do .env.local. O IMEI precisa estar cadastrado em um veículo ativo.
import fs from 'node:fs';

const [imei, base = 'http://localhost:3000', qtd = '30'] = process.argv.slice(2);
if (!imei) { console.error('Uso: node scripts/rastreio-simular.mjs <IMEI> [url-base] [pontos]'); process.exit(1); }

const env = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
const token = process.env.TRACCAR_WEBHOOK_TOKEN || env.match(/^TRACCAR_WEBHOOK_TOKEN=(.*)$/m)?.[1]?.trim().replace(/^"|"$/g, '');
if (!token) { console.error('Defina TRACCAR_WEBHOOK_TOKEN no .env.local'); process.exit(1); }

const url = `${base.replace(/\/$/, '')}/api/rastreio/traccar?token=${encodeURIComponent(token)}`;
const enviar = async corpo => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  return `${r.status} ${await r.text()}`;
};

// Trajeto pelo centro de Curitiba: anda para nordeste e para no final.
let lat = -25.4400, lng = -49.2800;
const device = { id: 0, uniqueId: imei, name: imei };
console.log(await enviar({ device, event: { type: 'ignitionOn', eventTime: new Date().toISOString() }, position: { latitude: lat, longitude: lng } }));

for (let i = 0; i < Number(qtd); i++) {
  const parado = i >= Number(qtd) - 3;
  const kmh = parado ? 0 : 30 + Math.round(Math.random() * 40);
  if (!parado) { lat += 0.0009 + Math.random() * 0.0004; lng += 0.0007 + Math.random() * 0.0004; }
  const position = {
    latitude: lat, longitude: lng, speed: kmh / 1.852, course: 40, valid: true, fixTime: new Date().toISOString(),
    attributes: { ignition: !parado || i < Number(qtd) - 1, power: 12.6, motion: !parado },
  };
  console.log(i + 1, `${kmh} km/h`, await enviar({ device, position }));
  await new Promise(r => setTimeout(r, 1500));
}
console.log(await enviar({ device, event: { type: 'ignitionOff', eventTime: new Date().toISOString() }, position: { latitude: lat, longitude: lng } }));
