<div align="center">

# 🎫 TicketSystem

### Sistema completo e moderno de tickets para Discord

Um bot desenvolvido com **discord.js** para gerenciamento de atendimentos e suporte, com foco em organização, automação e experiência da equipe e dos usuários.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6%2B-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/License-Private-lightgrey?style=for-the-badge)

</div>

---

## 📖 Sobre o projeto

O **TicketSystem** é um sistema profissional de tickets desenvolvido especialmente para servidores do Discord, com suporte a comunidades e servidores de **Minecraft**.

O projeto centraliza todo o fluxo de atendimento em um único bot, desde a abertura do ticket até seu encerramento, incluindo **transcripts, avaliações, estatísticas, rankings, logs e gerenciamento completo pela equipe**.

O sistema também possui painéis configuráveis e armazenamento persistente, permitindo que grande parte das configurações seja realizada diretamente pelo Discord.

---

## ✨ Funcionalidades

### 🎫 Sistema de Tickets

- Abertura de tickets através de painel interativo;
- Modal personalizado para criação do atendimento;
- Canais privados para cada ticket;
- ID incremental e permanente para identificação;
- Nick do Minecraft, assunto e motivo do atendimento;
- Status individual de cada ticket;
- Renomeação dos canais;
- Adição e remoção de participantes.

### 👥 Gerenciamento da Equipe

- Sistema de **claim** de atendimento;
- Liberação de tickets;
- Transferência entre atendentes;
- Solicitação de resposta;
- Solicitação de fechamento;
- Alertas automáticos de inatividade;
- Histórico individual dos atendentes.

### ⭐ Avaliações

Após o encerramento, o usuário pode avaliar o atendimento recebido.

- Avaliação de **1 a 5 estrelas**;
- Comentário opcional;
- Média de avaliações por atendente;
- Histórico de avaliações;
- Métricas integradas às estatísticas.

### 📊 Estatísticas

O sistema registra automaticamente métricas dos atendimentos, incluindo:

- Total de tickets criados;
- Tickets abertos e encerrados;
- Tickets por usuário;
- Tickets atendidos por membro da equipe;
- Tempo médio de atendimento;
- Tempo médio para primeira resposta;
- Estatísticas individuais;
- Rankings de atendentes;
- Histórico e busca através do ID do ticket.

### 📄 Transcripts

Ao finalizar um atendimento, o bot gera automaticamente um **transcript em HTML**.

O arquivo é:

1. Gerado no encerramento;
2. Armazenado localmente;
3. Vinculado ao registro do ticket;
4. Enviado para o canal de transcripts configurado.

Os arquivos ficam armazenados em:

```text
output/transcripts/
```

### 📋 Logs

Eventos importantes do sistema podem ser registrados automaticamente em um canal configurável, facilitando o acompanhamento das ações realizadas pela equipe.

---

## 🛠️ Tecnologias

| Tecnologia | Utilização |
| :--- | :--- |
| **Node.js** | Ambiente de execução |
| **discord.js** | Integração com a API do Discord |
| **SQLite** | Persistência dos tickets e configurações |
| **HTML** | Geração dos transcripts |
| **JavaScript** | Desenvolvimento do sistema |

---

## 🚀 Instalação

### 1. Instale as dependências

Clone o projeto e execute:

```bash
npm install
```

### 2. Configure as variáveis de ambiente

Crie um arquivo `.env` utilizando o `.env.example` como referência:

```env
# Token utilizado para iniciar o bot.
DISCORD_TOKEN=token_do_bot

# ID da aplicação. Necessário para registrar os slash commands.
CLIENT_ID=id_da_aplicacao

# Opcional.
# Permite registrar os comandos imediatamente em um servidor de desenvolvimento.
GUILD_ID=id_do_servidor_de_teste
```

> [!IMPORTANT]
> Nunca publique seu `DISCORD_TOKEN` no GitHub ou compartilhe o arquivo `.env`.

### 3. Registre os comandos

```bash
npm run register
```

### 4. Inicie o TicketSystem

```bash
npm start
```

Pronto! O bot estará disponível no Discord após conectar-se corretamente.

---

## ⚙️ Configuração

As principais configurações do TicketSystem são realizadas **diretamente pelo Discord**.

Utilize:

```text
/ticket config
```

Através desse painel é possível configurar:

- Categoria dos tickets;
- Cargo responsável pelos atendimentos;
- Canal de logs;
- Canal de transcripts;
- Aparência dos painéis;
- Textos utilizados pelo sistema;
- Prefixo dos canais;
- Sistema de inatividade.

As configurações são armazenadas em:

```text
data/tickets.db
```

Portanto, configurações específicas de cada servidor **não precisam ser adicionadas ao `.env`**.

---

## 🎨 Painel de Tickets

Para enviar o painel responsável pela abertura dos atendimentos, utilize:

```text
!ticket
```

Para enviar em um canal específico:

```text
!ticket #canal-do-painel
```

O bot tentará remover automaticamente a mensagem utilizada para executar o comando.

> [!NOTE]
> Para apagar a mensagem `!ticket`, o bot precisa possuir a permissão **Gerenciar Mensagens** no respectivo canal.

---

## 📝 Abertura de Ticket

Ao iniciar um novo atendimento, um modal solicita informações como:

```text
Nick do Minecraft
Assunto
Motivo do atendimento
```

Após o envio, um canal privado é criado automaticamente para o usuário e para a equipe responsável.

### 🧱 Integração com Minecraft

A cabeça do jogador é carregada automaticamente utilizando o nick informado:

```text
https://mc-heads.net/head/<nick>
```

Isso permite personalizar os embeds do atendimento com a skin correspondente ao jogador.

---

## 💾 Armazenamento

O TicketSystem mantém os dados importantes de forma persistente.

```text
data/
└── tickets.db

output/
└── transcripts/
    ├── ticket-0001.html
    ├── ticket-0002.html
    └── ...
```

### Banco de dados

```text
data/tickets.db
```

Armazena informações relacionadas a:

- Tickets;
- Usuários;
- Atendentes;
- Avaliações;
- Estatísticas;
- Configurações;
- Histórico dos atendimentos.

### Transcripts

```text
output/transcripts/
```

Armazena os transcripts HTML gerados durante o encerramento dos tickets.

---

## 🔐 Intents necessários

No **Discord Developer Portal**, habilite:

```text
Server Members Intent
Message Content Intent
```

Esses intents são utilizados pelo sistema para funcionalidades como registro de primeira resposta e determinadas métricas dos atendimentos.

---

## 🔄 Atualizando Slash Commands

Sempre que houver alterações na estrutura dos slash commands, execute novamente:

```bash
npm run register
```

Isso fará com que as alterações sejam enviadas ao Discord.

> [!TIP]
> Durante o desenvolvimento, configure `GUILD_ID`. Comandos registrados diretamente em um servidor costumam ser atualizados mais rapidamente que comandos globais.

---

## ⚠️ Missing Access (403)

Caso apareça o erro:

```text
Missing Access (403)
```

ao registrar os comandos, verifique:

1. Se `GUILD_ID` corresponde ao servidor correto;
2. Se o bot está instalado nesse servidor;
3. Se `CLIENT_ID` pertence à mesma aplicação do `DISCORD_TOKEN`;
4. Se a aplicação possui as permissões necessárias.

Como alternativa, deixe:

```env
GUILD_ID=
```

para realizar o registro global dos comandos.

---

## 📁 Estrutura de dados

```text
TicketSystem/
├── data/
│   └── tickets.db
│
├── output/
│   └── transcripts/
│
├── .env
├── .env.example
├── package.json
└── ...
```

> [!WARNING]
> Não envie o arquivo `.env` para repositórios públicos. Certifique-se de adicioná-lo ao `.gitignore`.

---

## 🎯 Objetivo

O TicketSystem foi desenvolvido para oferecer uma experiência de suporte **simples para o usuário e completa para a equipe**.

A proposta é substituir sistemas de tickets básicos por uma solução capaz de centralizar todo o processo de atendimento:

**Abertura → Atendimento → Gerenciamento → Encerramento → Transcript → Avaliação → Estatísticas**

---

<div align="center">

### 🎫 TicketSystem

**Atendimento organizado. Gestão eficiente.**

Desenvolvido com **Node.js** e **discord.js**.

</div>
