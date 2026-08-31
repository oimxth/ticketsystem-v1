const { SlashCommandBuilder } = require('discord.js');
const { PERIODS, RANKING_TYPES } = require('./constants');

function buildTicketCommand() {
  return new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Sistema profissional de tickets de suporte.')
    .addSubcommand((subcommand) => subcommand
      .setName('config')
      .setDescription('Abre o painel de configuração do sistema de tickets.'))
    .addSubcommand((subcommand) => subcommand
      .setName('buscar')
      .setDescription('Pesquisa um atendimento pelo ID.')
      .addIntegerOption((option) => option
        .setName('id')
        .setDescription('ID numérico do ticket.')
        .setMinValue(1)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('usuario')
      .setDescription('Consulta o histórico de tickets de um usuário.')
      .addUserOption((option) => option
        .setName('usuario')
        .setDescription('Usuário consultado.')
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('estatisticas')
      .setDescription('Mostra estatísticas gerais dos atendimentos.')
      .addStringOption(addPeriodChoices))
    .addSubcommand((subcommand) => subcommand
      .setName('atendente')
      .setDescription('Mostra estatísticas individuais de um atendente.')
      .addUserOption((option) => option
        .setName('usuario')
        .setDescription('Atendente consultado.')
        .setRequired(true))
      .addStringOption(addPeriodChoices))
    .addSubcommand((subcommand) => subcommand
      .setName('ranking')
      .setDescription('Mostra rankings da equipe de atendimento.')
      .addStringOption((option) => option
        .setName('tipo')
        .setDescription('Critério do ranking.')
        .setRequired(false)
        .addChoices(...Object.entries(RANKING_TYPES).map(([value, name]) => ({ name, value }))))
      .addStringOption(addPeriodChoices));
}

function addPeriodChoices(option) {
  return option
    .setName('periodo')
    .setDescription('Período consultado.')
    .setRequired(false)
    .addChoices(...Object.entries(PERIODS).map(([value, name]) => ({ name, value })));
}

module.exports = {
  buildTicketCommand,
};
