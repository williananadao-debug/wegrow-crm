# WeGrow Rastreio — app nativo (Android e iPhone)

App da loja para o **cliente final** do rastreio. É um app só para todos os instaladores: o cliente entra pelo link de acesso (WhatsApp) e vê a marca do instalador dele (ex.: Steil). Por dentro, carrega `https://www.wegrow.app.br/meu-rastreio` e adiciona o que site não tem: **notificação no celular** (alarme, cerca, velocidade, bloqueio, manutenção), ícone e tela de abertura.

Atualizar o app do site (Vercel) já atualiza o app instalado — só é preciso publicar nova versão na loja quando mudar plugin nativo, ícone ou nome.

## O que precisa antes (uma vez só)

1. **D-U-N-S da WeGrow** (grátis): https://developer.apple.com/enroll/duns-lookup/
2. **Conta Google Play (empresa)**: https://play.google.com/console/signup — US$ 25 uma vez.
3. **Conta Apple Developer (empresa)**: https://developer.apple.com/programs/enroll/ — US$ 99/ano.
4. **Firebase** (notificações): https://console.firebase.google.com → criar projeto "WeGrow Rastreio".
   - Adicionar app **Android** com o pacote `br.app.wegrow.rastreio` → baixar `google-services.json` → colocar em `android/app/`.
   - Adicionar app **iOS** com o bundle `br.app.wegrow.rastreio` → baixar `GoogleService-Info.plist` → colocar em `ios/App/App/`.
   - Em Configurações do projeto → Cloud Messaging → enviar a **chave APNs** (.p8 gerada na Apple Developer → Keys).
   - Em Configurações do projeto → Contas de serviço → **Gerar nova chave privada** → copiar o JSON inteiro para a variável **`FIREBASE_SERVICE_ACCOUNT`** na Vercel e fazer Redeploy.

## Gerar o app

```bash
cd apps/rastreio-nativo
npm install
npx cap add android
npx cap add ios          # só no Mac (ou serviço na nuvem: Codemagic / Ionic Appflow)
# ícone 1024x1024 em assets/icon.png e splash 2732x2732 em assets/splash.png
npm run icones
npm run android          # abre o Android Studio → Build → Generate Signed Bundle (.aab)
npm run ios              # abre o Xcode → Product → Archive → enviar à App Store Connect
```

## Loja — textos e cuidados

- **Nome:** WeGrow Rastreio · **Categoria:** Navegação / Utilitários.
- **Conta de teste para a revisão** (Apple e Google pedem): gerar um link de acesso de um cliente demo no painel (Rastreio → Clientes → Acesso ao app) e colar na tela inicial do app ("Ou cole o link aqui").
- **Política de privacidade:** usa localização do **veículo** (não do celular) e notificações.
- A Apple recusa "site dentro de moldura" (diretriz 4.2): o que justifica o app são as notificações nativas, os canais de alarme e o uso contínuo. Mantenha as notificações funcionando antes de enviar.
