# Módulo Rastreio: como colocar no ar

## Peças
```
Rastreador (GT06, J16, Suntech, Teltonika...) ──TCP──▶ Traccar (VPS) ──HTTP forward──▶ /api/rastreio/traccar ──▶ Supabase
                                                       ▲
WeGrow /rastreio ── bloquear ──▶ /api/rastreio/comando ┘ (API REST do Traccar: engineStop / engineResume)
```

## 1. Banco
Migration `supabase/migrations/20261118120000_rastreio.sql`. Ela cria as tabelas `rastreio_clientes`, `rastreio_veiculos`, `rastreio_posicoes`, `rastreio_eventos` e `rastreio_comandos`, todas com RLS por empresa.

## 2. Servidor Traccar (VPS)
- **VPS:** Ubuntu 22/24 com 2 GB de RAM já atende centenas de veículos (Hetzner, Contabo, DigitalOcean...).
- **Instalação:** baixe o instalador Linux em traccar.org/download e rode `sudo ./traccar.run`. Depois `sudo systemctl start traccar`.
- **Domínio:** aponte `rastreio.wegrow.app.br` para o IP da VPS, coloque Nginx com HTTPS (certbot) e faça proxy para `localhost:8082`.
- **Firewall:** libere as portas TCP dos protocolos usados:
  - GT06/Concox/J16: **5023**
  - Suntech: **5011**
  - Teltonika: **5027**
  - OsmAnd (app de celular, para testes): **5055**
  - A lista completa está em traccar.org/devices.
- **Forward:** em `/opt/traccar/conf/traccar.xml`, adicione as linhas abaixo e reinicie o Traccar:
```xml
<entry key='forward.enable'>true</entry>
<entry key='forward.type'>json</entry>
<entry key='forward.url'>https://www.wegrow.app.br/api/rastreio/traccar?token=SEGREDO</entry>
<entry key='event.forward.enable'>true</entry>
<entry key='event.forward.url'>https://www.wegrow.app.br/api/rastreio/traccar?token=SEGREDO</entry>
```
- **Usuário:** crie um usuário admin no painel do Traccar (porta 8082). Ele é usado para a API.

## 3. Variáveis na Vercel
| Variável | Valor |
|---|---|
| `TRACCAR_URL` | `https://rastreio.wegrow.app.br` |
| `TRACCAR_USER` / `TRACCAR_PASSWORD` | usuário admin do Traccar |
| `TRACCAR_WEBHOOK_TOKEN` | o mesmo SEGREDO do traccar.xml (gere um aleatório) |

## 4. Ativar para o instalador
Em God Mode, abra a empresa, vá em **Módulos** e ligue **Rastreio veicular**. O menu passa a mostrar "Rastreio".

## 5. Configurar o rastreador (o instalador faz, por SMS ao chip do aparelho)
- **GT06/J16** (o formato varia por fabricante):
  - servidor: `SERVER,1,rastreio.wegrow.app.br,5023,0#`
  - APN da operadora: `APN,<apn>#`
  - intervalo de envio: `TIMER,30#`
- Depois, no WeGrow, abra **Rastreio → Nova instalação** e cadastre o cliente, a placa e o **IMEI**.

## Testar sem aparelho
- **Sem Traccar:** `node scripts/rastreio-simular.mjs <IMEI> http://localhost:3000`. O script manda posições falsas direto para o webhook.
- **Com Traccar:** instale o app **Traccar Client** no celular, aponte para `rastreio.wegrow.app.br:5055` e use como IMEI o identificador que o app mostra. O celular vira um rastreador.

## Regras de segurança do bloqueio
- Só diretor ou gerente pode enviar.
- Motivo obrigatório.
- Bloqueio só com a posição de até 10 min e o veículo **abaixo de 20 km/h**.
- Tudo fica em `rastreio_comandos`, inclusive as recusas.
- Aparelho offline: o Traccar guarda o comando na fila e executa quando o aparelho comunicar.

## Próximas fases
1. App do cliente final, que vê só os próprios veículos: login próprio, mapa, trajeto, botão de bloqueio e link de compartilhar localização.
2. Cobrança mensal automática no Asaas (rastreio_clientes.mensalidade e dia_vencimento), com suspensão por inadimplência.
3. Push no celular para alertas (ignição fora de hora, violação, bateria cortada).
4. Cercas virtuais desenhadas no mapa (geofences do Traccar).
5. Publicar na Play Store e na App Store (Capacitor).
