<div align="center">

# 🎫 TicketSystem

**Sistema moderno de tickets e atendimento para Discord.**

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)
![Discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6%2B-F7DF1E?style=flat-square&logo=javascript&logoColor=black)

</div>

---

## ✨ Sobre

O **TicketSystem** é um bot de tickets desenvolvido com **discord.js**, focado em oferecer um sistema de atendimento completo, organizado e fácil de gerenciar.

Criado especialmente para comunidades e servidores de **Minecraft**.

### Principais recursos

- 🎫 Painéis e tickets privados;
- 👥 Claim, transferência e gerenciamento de atendimentos;
- 📄 Transcripts automáticos em HTML;
- ⭐ Sistema de avaliações;
- 📊 Estatísticas e rankings da equipe;
- 🕐 Controle e alertas de inatividade;
- 📋 Histórico, busca e logs;
- ⚙️ Configuração diretamente pelo Discord.

---

## 🚀 Instalação

Instale as dependências:

```bash
npm install
```

Crie o `.env` utilizando `.env.example`:

```env
DISCORD_TOKEN=token_do_bot
CLIENT_ID=id_da_aplicacao
GUILD_ID=id_do_servidor
```

Registre os comandos:

```bash
npm run register
```

Inicie o bot:

```bash
npm start
```

---

## ⚙️ Configuração

As configurações do sistema podem ser gerenciadas diretamente pelo Discord:

```text
/ticket config
```

Para enviar o painel de abertura de tickets:

```text
!ticket
!ticket #canal
```

Os dados são armazenados em:

```text
data/tickets.db
```

E os transcripts em:

```text
output/transcripts/
```

---

## 🔐 Intents

Ative no **Discord Developer Portal**:

- `Server Members Intent`
- `Message Content Intent`

> [!IMPORTANT]
> Nunca publique seu `.env` ou `DISCORD_TOKEN` no GitHub.

---

<div align="center">

Desenvolvido com **Node.js + discord.js**

</div>
