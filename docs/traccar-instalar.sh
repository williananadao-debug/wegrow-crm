#!/usr/bin/env bash
# Instala o servidor de rastreio (Traccar) numa VPS Ubuntu 22/24 limpa, com HTTPS e o repasse
# de posições/eventos para o WeGrow. Rodar como root:
#   bash traccar-instalar.sh rastreio.wegrow.app.br seu-email@dominio
# Antes: o registro DNS "A" do domínio já precisa apontar para o IP desta VPS (Vercel → Domains).
set -euo pipefail

DOMINIO="${1:?Informe o domínio, ex.: rastreio.wegrow.app.br}"
EMAIL="${2:?Informe um e-mail para o certificado HTTPS}"
WEGROW="https://www.wegrow.app.br/api/rastreio/traccar"
TOKEN="$(openssl rand -hex 24)"

echo "==> Pacotes"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y unzip curl nginx certbot python3-certbot-nginx ufw

echo "==> Traccar (última versão)"
URL_ZIP="$(curl -s https://api.github.com/repos/traccar/traccar/releases/latest | grep -o 'https://[^"]*traccar-linux-64-[^"]*\.zip' | head -1)"
[ -n "$URL_ZIP" ] || { echo "Não achei o download do Traccar"; exit 1; }
cd /tmp && curl -L -o traccar.zip "$URL_ZIP" && unzip -o traccar.zip && ./traccar.run
CONF=/opt/traccar/conf/traccar.xml

echo "==> Repasse para o WeGrow"
if ! grep -q "forward.url" "$CONF"; then
  sed -i "s#</properties>#    <entry key='forward.enable'>true</entry>\n    <entry key='forward.type'>json</entry>\n    <entry key='forward.url'>${WEGROW}?token=${TOKEN}</entry>\n    <entry key='event.forward.enable'>true</entry>\n    <entry key='event.forward.url'>${WEGROW}?token=${TOKEN}</entry>\n</properties>#" "$CONF"
else
  echo "(repasse já configurado — token mantido)"; TOKEN="$(grep -o 'token=[a-f0-9]*' "$CONF" | head -1 | cut -d= -f2)"
fi
systemctl enable traccar && systemctl restart traccar

echo "==> Nginx + HTTPS"
cat > /etc/nginx/sites-available/traccar <<NGX
server {
  listen 80;
  server_name ${DOMINIO};
  location / {
    proxy_pass http://127.0.0.1:8082;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 86400;
  }
}
NGX
ln -sf /etc/nginx/sites-available/traccar /etc/nginx/sites-enabled/traccar
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d "$DOMINIO" -m "$EMAIL" --agree-tos --non-interactive --redirect

echo "==> Firewall (SSH, web e portas dos rastreadores)"
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 5023/tcp   # GT06 / Concox / J16
ufw allow 5011/tcp   # Suntech
ufw allow 5027/tcp   # Teltonika
ufw allow 5055/tcp   # OsmAnd (app Traccar Client no celular)
ufw allow 5013/tcp   # H02 (vários modelos chineses)
ufw --force enable

echo
echo "================= PRONTO ================="
echo "Painel do Traccar: https://${DOMINIO}"
echo "1) Abra o painel e CRIE A PRIMEIRA CONTA (ela vira administradora)."
echo "2) Em Configurações > Servidor, DESMARQUE 'Registro' para ninguém mais criar conta."
echo "3) Na Vercel (Settings > Environment Variables), crie e faça Redeploy:"
echo "   TRACCAR_URL=https://${DOMINIO}"
echo "   TRACCAR_USER=<e-mail da conta criada no passo 1>"
echo "   TRACCAR_PASSWORD=<senha da conta criada no passo 1>"
echo "   TRACCAR_WEBHOOK_TOKEN=${TOKEN}"
echo "=========================================="
