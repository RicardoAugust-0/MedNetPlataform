# Eventos do Bot Horizon

O MedNet ja registra automaticamente cada importacao aceita ou recusada e cada
resultado recebido pela rota de credenciais. Para exibir tambem etapas como
inicio de login e download concluido, o bot pode enviar eventos seguros para:

`POST <MEDNET_API_BASE>/api/horizon/activity`

Use o header `Authorization: Bearer <HORIZON_BOT_TOKEN>`.

Nunca envie senhas, tokens ou dados de CAPTCHA. Corpos aceitos:

```json
{ "phase": "started", "account": "ALP", "message": "Iniciando login." }
{ "phase": "progress", "account": "ALP", "message": "Relatorio baixado; enviando ao MedNet." }
{ "phase": "success", "account": "ALP", "message": "Relatorio importado com 42 eventos." }
{ "phase": "failure", "account": "ALP", "message": "Login nao concluido; revisar credencial." }
```

Fases aceitas: `started`, `progress`, `success` e `failure`.

## Cooldown de extração

Após uma importação bem-sucedida, o MedNet marca a conta com o horário da
extração. Durante os 15 minutos seguintes, `GET /api/horizon/credentials` não
devolve essa conta ao robô. Erros de login ou de importação não entram no
cooldown e permanecem elegíveis para nova tentativa.
