require('dotenv').config({ quiet: true });

const {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
} = require('discord.js');
const { TicketDatabase } = require('./tickets/database');
const { createTicketHandlers } = require('./tickets/handlers');
const { TicketService } = require('./tickets/service');

const { DISCORD_TOKEN } = process.env;

if (!DISCORD_TOKEN) {
  throw new Error('Configure DISCORD_TOKEN no arquivo .env.');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const ticketDatabase = new TicketDatabase();
const ticketService = new TicketService(ticketDatabase);
const ticketHandlers = createTicketHandlers(ticketService);

client.once(Events.ClientReady, (readyClient) => {
  console.log(`TicketSystem online como ${readyClient.user.tag}.`);

  setInterval(() => {
    ticketService.checkAutomation(readyClient).catch((error) => {
      console.error('Erro ao verificar automações de tickets:', error);
    });
  }, 5 * 60 * 1000);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (await ticketHandlers.handleCommand(interaction)) return;
    await ticketHandlers.handleInteraction(interaction);
  } catch (error) {
    console.error(error);

    const message = 'Não consegui processar essa ação de ticket. Tente novamente.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

client.on(Events.MessageCreate, (message) => {
  (async () => {
    if (await ticketHandlers.handlePrefixCommand(message)) return;
    await ticketService.onMessage(message);
  })().catch((error) => {
    console.error('Erro ao processar mensagem:', error);
  });
});

client.login(DISCORD_TOKEN);
