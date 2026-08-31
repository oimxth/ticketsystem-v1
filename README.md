# TicketSystem Discord Bot

Sistema de tickets para Discord desenvolvido com discord.js, com painéis configuráveis, atendimento privado, transcripts, avaliações, logs, estatísticas e embeds modernos para servidores de Minecraft.

Bot profissional de tickets para Discord, focado exclusivamente em atendimento e suporte.

## Como usar

1. Instale as dependências:

```bash
npm install
```

2. Crie o arquivo `.env` a partir de `.env.example` e preencha:

```env
# Obrigatório para ligar o bot.
DISCORD_TOKEN=token_do_bot

# Obrigatório para registrar os slash commands.
CLIENT_ID=id_da_aplicação

# Opcional: registra o /ticket mais rápido em um servidor de teste.
GUILD_ID=id_do_servidor_de_teste
```

3. Registre os comandos slash:

```bash
npm run register
```

4. Inicie o bot:

```bash
npm start
```

## Configuração no Discord

Para enviar o painel de abertura de tickets, use comando de mensagem:

```text
!ticket
!ticket #canal-do-painel
```

O bot tenta apagar a mensagem `!ticket` automaticamente. Para isso, ele precisa
da permissão `Gerenciar Mensagens` no canal onde o comando for usado.

As configurações ficam em um painel único:

```text
/ticket config
```

Nesse painel você configura categoria, cargo da equipe, canal de logs, canal de
transcripts, aparência, textos, prefixo dos canais e inatividade.

Essas configurações não ficam no `.env`; tudo é salvo em `data/tickets.db`.

O transcript é gerado como arquivo HTML em `output/transcripts`, salvo no ticket
e enviado para o canal configurado em `/ticket config`.

Depois de mudar comandos slash no código, rode `npm run register` novamente para
o Discord receber as novas opções de configuração.

Se aparecer `Missing Access (403)` ao registrar:

- confira se o `GUILD_ID` é o ID do servidor correto;
- confira se o bot está instalado nesse servidor;
- confira se o `CLIENT_ID` é da mesma aplicação do `DISCORD_TOKEN`;
- ou deixe `GUILD_ID` vazio para registrar o comando globalmente.

O painel abre um modal com nick do Minecraft, assunto e motivo. O ticket criado
usa a cabeça do jogador em:

```text
https://mc-heads.net/head/<nick>
```

## Funcionalidades

- abertura com modal e canal privado;
- identificação permanente por ID incremental;
- claim, liberação e transferência de atendimento;
- adicionar/remover participantes, renomear e status;
- solicitação de resposta e solicitação de fechamento;
- fechamento com avaliação e transcript HTML;
- avaliação de 1 a 5 estrelas com comentário opcional;
- histórico por usuário e busca por ID;
- estatísticas gerais, estatísticas individuais e rankings de atendentes;
- alertas de inatividade;
- logs configuráveis para eventos importantes.

Dados persistentes ficam em `data/tickets.db`. Transcripts ficam em `output/transcripts`.

Ative no Developer Portal do Discord os intents `Server Members Intent` e
`Message Content Intent` para registrar primeira resposta e métricas.
