require('dotenv').config({ quiet: true });

const { REST, Routes } = require('discord.js');
const { buildTicketCommand } = require('./tickets/commands');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  throw new Error('Configure DISCORD_TOKEN e CLIENT_ID no arquivo .env.');
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

async function main() {
  const body = [buildTicketCommand().toJSON()];
  const route = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);

  await rest.put(route, { body });
  console.log('Comando /ticket registrado.');
}

main().catch((error) => {
  if (error.code === 50001) {
    console.error([
      'Não consegui registrar o /ticket neste servidor: Missing Access (403).',
      '',
      'Confira estes pontos:',
      `- GUILD_ID atual: ${GUILD_ID || 'vazio'}`,
      '- O bot precisa estar instalado nesse servidor.',
      '- CLIENT_ID precisa ser o ID da mesma aplicação do DISCORD_TOKEN.',
      '- Se não quiser registrar por servidor, deixe GUILD_ID vazio para registrar globalmente.',
      '',
      'Link de convite com bot + applications.commands:',
      `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands`,
    ].join('\n'));
    process.exitCode = 1;
    return;
  }

  console.error(error);
  process.exitCode = 1;
});
