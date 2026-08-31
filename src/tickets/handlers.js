const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const {
  createAppearanceConfigModal,
  createAutomationConfigModal,
  createCloseModal,
  createConfigAppearancePayload,
  createConfigAutomationPayload,
  createConfigHomePayload,
  createConfigPanelPayload,
  createConfigTargetsPayload,
  createConfigTicketPayload,
  createManagePayload,
  createOpenTicketModal,
  createPanelPayload,
  createPanelControlsConfigModal,
  createPanelTextConfigModal,
  createRenameModal,
  createReviewModal,
  createStatusMenu,
  createTicketConfigModal,
  createTicketKeptOpenPayload,
  createUserSelectPayload,
} = require('./components');
const { EVENT_TYPES } = require('./constants');
const { padTicketId } = require('./format');

function createTicketHandlers(service) {
  const db = service.db;

  async function handleCommand(interaction) {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'ticket') return false;

    const subcommand = interaction.options.getSubcommand(false);
    if (!subcommand) {
      await interaction.reply(ephemeral('Use um subcomando de `/ticket`. Se as opções novas ainda não apareceram, rode `npm run register` e reinicie o Discord.'));
      return true;
    }
    const configCommands = [
      'config',
      'config-categoria',
      'config-equipe',
      'config-logs',
      'config-transcripts',
      'config-aparencia',
      'config-painel',
      'config-ticket',
      'config-ver',
      'config-inatividade',
    ];

    if (configCommands.includes(subcommand) && !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply(ephemeral('Você precisa da permissão Gerenciar Servidor para configurar tickets.'));
      return true;
    }

    if (['buscar', 'usuario', 'estatisticas', 'atendente', 'ranking'].includes(subcommand)
      && !service.isStaff(interaction.member)) {
      await interaction.reply(ephemeral('Apenas a equipe de atendimento pode consultar histórico e estatísticas.'));
      return true;
    }

    if (subcommand === 'config') {
      await interaction.reply(asEphemeral(createConfigHomePayload(db.getConfig(interaction.guildId))));
      return true;
    }

    if (subcommand === 'config-categoria') {
      const category = interaction.options.getChannel('categoria', true);
      db.upsertConfig(interaction.guildId, { categoryId: category.id });
      await interaction.reply(ephemeral(`Categoria de tickets definida como ${category.name}.`));
      return true;
    }

    if (subcommand === 'config-equipe') {
      const role = interaction.options.getRole('cargo', true);
      db.upsertConfig(interaction.guildId, { staffRoleId: role.id });
      await interaction.reply(ephemeral(`Cargo da equipe definido como ${role}.`));
      return true;
    }

    if (subcommand === 'config-logs') {
      const channel = interaction.options.getChannel('canal', true);
      db.upsertConfig(interaction.guildId, { logChannelId: channel.id });
      await interaction.reply(ephemeral(`Canal de logs definido como ${channel}.`));
      return true;
    }

    if (subcommand === 'config-transcripts') {
      const channel = interaction.options.getChannel('canal', true);
      db.upsertConfig(interaction.guildId, { transcriptChannelId: channel.id });
      await interaction.reply(ephemeral(`Canal de transcripts definido como ${channel}.`));
      return true;
    }

    if (subcommand === 'config-aparencia') {
      const changes = {};
      const brandColor = interaction.options.getString('cor_principal');
      const accentColor = interaction.options.getString('cor_secundaria');
      const imageUrl = interaction.options.getString('imagem_url');
      const defaultImage = interaction.options.getBoolean('imagem_padrao');

      if (brandColor) {
        const parsed = parseHexColor(brandColor);
        if (parsed === null) {
          await interaction.reply(ephemeral('Cor principal inválida. Use hexadecimal, por exemplo `#ef476f`.'));
          return true;
        }
        changes.brandColor = parsed;
      }

      if (accentColor) {
        const parsed = parseHexColor(accentColor);
        if (parsed === null) {
          await interaction.reply(ephemeral('Cor secundária inválida. Use hexadecimal, por exemplo `#5865f2`.'));
          return true;
        }
        changes.accentColor = parsed;
      }

      if (imageUrl) {
        if (!/^https?:\/\/\S+$/i.test(imageUrl)) {
          await interaction.reply(ephemeral('URL da imagem inválida. Use uma URL começando com `https://` ou `http://`.'));
          return true;
        }
        changes.panelImageUrl = imageUrl;
      }

      if (defaultImage) changes.panelImageUrl = null;
      if (!Object.keys(changes).length) {
        await interaction.reply(ephemeral('Informe pelo menos uma opção para alterar a aparência.'));
        return true;
      }

      db.upsertConfig(interaction.guildId, changes);
      await interaction.reply(ephemeral('Aparência dos embeds atualizada.'));
      return true;
    }

    if (subcommand === 'config-painel') {
      const changes = pickStringOptions(interaction, {
        titulo: 'panelTitle',
        descricao: 'panelDescription',
        diretrizes: 'panelGuidelines',
        botao: 'panelButtonLabel',
        seletor: 'panelSelectLabel',
        descricao_seletor: 'panelSelectDescription',
      });

      if (!Object.keys(changes).length) {
        await interaction.reply(ephemeral('Informe pelo menos um texto para alterar o painel.'));
        return true;
      }

      db.upsertConfig(interaction.guildId, changes);
      await interaction.reply(ephemeral('Textos do painel atualizados. Envie um novo painel com `!ticket` para aplicar.'));
      return true;
    }

    if (subcommand === 'config-ticket') {
      const changes = pickStringOptions(interaction, {
        titulo: 'ticketWelcomeTitle',
        descricao: 'ticketWelcomeDescription',
        prefixo_canal: 'ticketChannelPrefix',
      });

      if (!Object.keys(changes).length) {
        await interaction.reply(ephemeral('Informe pelo menos um texto para alterar a mensagem inicial dos tickets.'));
        return true;
      }

      db.upsertConfig(interaction.guildId, changes);
      await interaction.reply(ephemeral('Mensagem inicial dos tickets atualizada.'));
      return true;
    }

    if (subcommand === 'config-ver') {
      await interaction.reply(service.configPayload(interaction.guildId));
      return true;
    }

    if (subcommand === 'config-inatividade') {
      const warning = interaction.options.getInteger('aviso_horas', true);
      const closing = interaction.options.getInteger('fechamento_horas', true);
      const autoClose = interaction.options.getBoolean('auto_fechar', true);
      if (closing <= warning) {
        await interaction.reply(ephemeral('O aviso de fechamento precisa ser maior que o primeiro aviso.'));
        return true;
      }
      db.upsertConfig(interaction.guildId, {
        inactivityWarningHours: warning,
        inactivityCloseHours: closing,
        autoCloseInactive: autoClose ? 1 : 0,
      });
      await interaction.reply({
        content: `Inatividade configurada: aviso em ${warning}h, aviso de fechamento em ${closing}h, auto-fechar ${autoClose ? 'ativado' : 'desativado'}.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (subcommand === 'buscar') {
      const id = interaction.options.getInteger('id', true);
      const ticket = db.findTicket(interaction.guildId, id);
      if (!ticket) {
        await interaction.reply(ephemeral(`Não encontrei o ticket #${padTicketId(id)} neste servidor.`));
        return true;
      }

      const ticketUser = await interaction.client.users.fetch(ticket.userId).catch(() => null);
      const ticketMember = await interaction.guild.members.fetch(ticket.userId).catch(() => null);
      const ticketChannel = ticket.channelId
        ? await interaction.guild.channels.fetch(ticket.channelId).catch(() => null)
        : null;
      let openUrl = null;
      if (ticketChannel) {
        let messageId = null;
        if (ticket.mainMessageId && ticketChannel.messages?.fetch) {
          const mainMessage = await ticketChannel.messages.fetch(ticket.mainMessageId).catch(() => null);
          if (mainMessage) messageId = ticket.mainMessageId;
        }
        openUrl = `https://discord.com/channels/${ticket.guildId}/${ticket.channelId}${messageId ? `/${messageId}` : ''}`;
      }
      await interaction.reply(service.ticketSummaryPayload(ticket, {
        displayName: ticketMember?.displayName || ticketUser?.displayName || ticketUser?.globalName || ticketUser?.username,
        avatarUrl: ticketMember?.displayAvatarURL({ extension: 'png', size: 256 })
          || ticketUser?.displayAvatarURL({ extension: 'png', size: 256 }),
        openUrl,
      }));
      return true;
    }

    if (subcommand === 'usuario') {
      const user = interaction.options.getUser('usuario', true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      await interaction.reply(service.userHistoryPayload(interaction.guildId, user.id, {
        displayName: member?.displayName || user.displayName || user.globalName || user.username,
        avatarUrl: member?.displayAvatarURL({ extension: 'png', size: 256 })
          || user.displayAvatarURL({ extension: 'png', size: 256 }),
        searchCommandMention: `</ticket buscar:${interaction.commandId}>`,
      }));
      return true;
    }

    if (subcommand === 'estatisticas') {
      await interaction.reply(service.statsPayload(interaction.guildId, interaction.options.getString('periodo') || 'all'));
      return true;
    }

    if (subcommand === 'atendente') {
      const user = interaction.options.getUser('usuario', true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      await interaction.reply(service.staffStatsPayload(
        interaction.guildId,
        user.id,
        interaction.options.getString('periodo') || 'all',
        {
          displayName: member?.displayName || user.displayName || user.globalName || user.username,
          avatarUrl: member?.displayAvatarURL({ extension: 'png', size: 256 })
            || user.displayAvatarURL({ extension: 'png', size: 256 }),
        },
      ));
      return true;
    }

    if (subcommand === 'ranking') {
      await interaction.reply(service.rankingPayload(
        interaction.guildId,
        interaction.options.getString('tipo') || 'tickets',
        interaction.options.getString('periodo') || 'month',
      ));
      return true;
    }

    return true;
  }

  async function handleInteraction(interaction) {
    if (!interaction.guildId) return false;

    if (interaction.customId?.startsWith('ticket:config:')) {
      await handleConfigInteraction(interaction);
      return true;
    }

    if ((interaction.isButton() && interaction.customId === 'ticket:open_button')
      || (interaction.isStringSelectMenu() && interaction.customId === 'ticket:open_menu')) {
      await interaction.showModal(createOpenTicketModal({
        channelId: interaction.channelId,
        messageId: interaction.message?.id,
      }));
      setTimeout(() => {
        resetPanelMenuMessage(interaction, db.getConfig(interaction.guildId)).catch(() => null);
      }, 1_000);
      return true;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket:open_modal')) {
      await service.createTicketFromModal(interaction);
      return true;
    }

    if (!interaction.customId?.startsWith('ticket:')) return false;
    const parts = interaction.customId.split(':');
    const ticketId = Number(parts[1]);
    const action = parts[2];
    const extra = parts[3];
    const ticket = db.findTicket(interaction.guildId, ticketId);

    if (!ticket) {
      await replyMissing(interaction, ticketId);
      return true;
    }

    if (interaction.isButton()) {
      if (action === 'claim') {
        await service.claim(interaction, ticket);
        return true;
      }

      if (action === 'close') {
        await interaction.showModal(createCloseModal(ticket));
        return true;
      }

      if (action === 'manage') {
        if (!await service.requireStaff(interaction)) return true;
        await interaction.reply(createManagePayload(ticket, db.getConfig(interaction.guildId)));
        return true;
      }

      if (action === 'show_transcript') {
        await service.showTranscript(interaction, ticket);
        return true;
      }

      if (action === 'show_user') {
        const ticketUser = await interaction.client.users.fetch(ticket.userId).catch(() => null);
        const ticketMember = await interaction.guild.members.fetch(ticket.userId).catch(() => null);
        await interaction.reply(service.userHistoryPayload(interaction.guildId, ticket.userId, {
          displayName: ticketMember?.displayName || ticketUser?.displayName || ticketUser?.globalName || ticketUser?.username,
          avatarUrl: ticketMember?.displayAvatarURL({ extension: 'png', size: 256 })
            || ticketUser?.displayAvatarURL({ extension: 'png', size: 256 }),
        }));
        return true;
      }

      if (action === 'user_confirm_close') {
        if (interaction.user.id !== ticket.userId) {
          await interaction.reply(ephemeral('Apenas quem abriu o ticket pode confirmar este fechamento.'));
          return true;
        }
        await service.close(interaction, ticket, 'Fechamento confirmado pelo usuário.', interaction.user.id);
        return true;
      }

      if (action === 'user_keep_open') {
        if (interaction.user.id !== ticket.userId) {
          await interaction.reply(ephemeral('Apenas quem abriu o ticket pode responder esta solicitação.'));
          return true;
        }
        const updated = db.updateTicket(ticket.id, { status: 'WAITING_STAFF' });
        db.addEvent(ticket.id, EVENT_TYPES.STATUS_CHANGED, interaction.user.id, null, 'Usuário manteve o ticket aberto');
        await service.updateMainMessage(interaction.client, updated);
        await interaction.deferUpdate();
        await interaction.message.edit(createTicketKeptOpenPayload(updated, interaction.user.id, db.getConfig(interaction.guildId)));
        return true;
      }
    }

    if (interaction.isStringSelectMenu()) {
      const selected = interaction.values[0];

      if (action === 'manage_select') {
        if (selected === 'release') {
          await service.release(interaction, ticket);
          return true;
        }
        if (selected === 'transfer') {
          await interaction.update(createUserSelectPayload(ticket, 'transfer_select', 'Selecione o novo atendente.', db.getConfig(interaction.guildId)));
          return true;
        }
        if (selected === 'add_user') {
          await interaction.update(createUserSelectPayload(ticket, 'add_user_select', 'Selecione o usuário que será adicionado.', db.getConfig(interaction.guildId)));
          return true;
        }
        if (selected === 'remove_user') {
          await interaction.update(createUserSelectPayload(ticket, 'remove_user_select', 'Selecione o usuário que será removido.', db.getConfig(interaction.guildId)));
          return true;
        }
        if (selected === 'rename') {
          await interaction.showModal(createRenameModal(ticket));
          return true;
        }
        if (selected === 'status') {
          await interaction.update(createStatusMenu(ticket, db.getConfig(interaction.guildId)));
          return true;
        }
        if (selected === 'request_user') {
          await service.requestUser(interaction, ticket);
          return true;
        }
        if (selected === 'request_close') {
          await service.requestClose(interaction, ticket);
          return true;
        }
      }

      if (action === 'status_select') {
        await service.setStatus(interaction, ticket, selected);
        return true;
      }

      if (action === 'rate') {
        await interaction.showModal(createReviewModal(ticket, Number(selected)));
        return true;
      }
    }

    if (interaction.isUserSelectMenu()) {
      const targetId = interaction.values[0];
      if (action === 'transfer_select') {
        await service.transfer(interaction, ticket, targetId);
        return true;
      }
      if (action === 'add_user_select') {
        await service.addUser(interaction, ticket, targetId);
        return true;
      }
      if (action === 'remove_user_select') {
        await service.removeUser(interaction, ticket, targetId);
        return true;
      }
    }

    if (interaction.isModalSubmit()) {
      if (action === 'close_modal') {
        const reason = interaction.fields.getTextInputValue('close_reason').trim();
        await service.close(interaction, ticket, reason);
        return true;
      }

      if (action === 'rename_modal') {
        const name = interaction.fields.getTextInputValue('new_name').trim();
        await service.rename(interaction, ticket, name);
        return true;
      }

      if (action === 'review_modal') {
        const rating = Number(extra);
        const comment = interaction.fields.getTextInputValue('review_comment')?.trim() || null;
        await service.rate(interaction, ticket, rating, comment);
        return true;
      }
    }

    return true;
  }

  async function handleConfigInteraction(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply(ephemeral('Você precisa da permissão Gerenciar Servidor para configurar tickets.'));
      return;
    }

    const config = db.getConfig(interaction.guildId);
    const customId = interaction.customId;

    if (interaction.isStringSelectMenu() && customId === 'ticket:config:home') {
      const selected = interaction.values[0];
      if (selected === 'targets') {
        await interaction.update(createConfigTargetsPayload(config));
        return;
      }
      if (selected === 'appearance') {
        await interaction.update(createConfigAppearancePayload(config));
        return;
      }
      if (selected === 'panel') {
        await interaction.update(createConfigPanelPayload(config));
        return;
      }
      if (selected === 'ticket') {
        await interaction.update(createConfigTicketPayload(config));
        return;
      }
      if (selected === 'automation') {
        await interaction.update(createConfigAutomationPayload(config));
        return;
      }
      if (selected === 'overview') {
        await interaction.update(createConfigHomePayload(config));
        return;
      }
    }

    if (interaction.isButton()) {
      if (customId === 'ticket:config:back') {
        await interaction.update(createConfigHomePayload(config));
        return;
      }
      if (customId === 'ticket:config:appearance_modal') {
        await interaction.showModal(createAppearanceConfigModal(config));
        return;
      }
      if (customId === 'ticket:config:reset_image') {
        const updated = db.upsertConfig(interaction.guildId, { panelImageUrl: null });
        await interaction.update(createConfigAppearancePayload(updated, '✅ Imagem padrão restaurada.'));
        return;
      }
      if (customId === 'ticket:config:panel_text_modal') {
        await interaction.showModal(createPanelTextConfigModal(config));
        return;
      }
      if (customId === 'ticket:config:panel_controls_modal') {
        await interaction.showModal(createPanelControlsConfigModal(config));
        return;
      }
      if (customId === 'ticket:config:ticket_modal') {
        await interaction.showModal(createTicketConfigModal(config));
        return;
      }
      if (customId === 'ticket:config:automation_modal') {
        await interaction.showModal(createAutomationConfigModal(config));
        return;
      }
    }

    if (interaction.isChannelSelectMenu?.()) {
      const selectedId = interaction.values[0];
      const changes = {
        'ticket:config:category': { categoryId: selectedId },
        'ticket:config:logs': { logChannelId: selectedId },
        'ticket:config:transcripts': { transcriptChannelId: selectedId },
      }[customId];
      if (changes) {
        const updated = db.upsertConfig(interaction.guildId, changes);
        await interaction.update(createConfigTargetsPayload(updated, '✅ Configuração atualizada.'));
        return;
      }
    }

    if (interaction.isRoleSelectMenu?.() && customId === 'ticket:config:staff_role') {
      const updated = db.upsertConfig(interaction.guildId, { staffRoleId: interaction.values[0] });
      await interaction.update(createConfigTargetsPayload(updated, '✅ Cargo da equipe atualizado.'));
      return;
    }

    if (interaction.isModalSubmit()) {
      if (customId === 'ticket:config:appearance_submit') {
        await saveAppearanceConfig(interaction);
        return;
      }
      if (customId === 'ticket:config:panel_text_submit') {
        await savePanelTextConfig(interaction);
        return;
      }
      if (customId === 'ticket:config:panel_controls_submit') {
        await savePanelControlsConfig(interaction);
        return;
      }
      if (customId === 'ticket:config:ticket_submit') {
        await saveTicketConfig(interaction);
        return;
      }
      if (customId === 'ticket:config:automation_submit') {
        await saveAutomationConfig(interaction);
      }
    }
  }

  async function saveAppearanceConfig(interaction) {
    const changes = {};
    const brandColor = modalValue(interaction, 'brand_color');
    const accentColor = modalValue(interaction, 'accent_color');
    const imageUrl = modalValue(interaction, 'image_url');

    if (brandColor) {
      const parsed = parseHexColor(brandColor);
      if (parsed === null) {
        await interaction.reply(ephemeral('Cor principal inválida. Use hexadecimal, por exemplo `#EF476F`.'));
        return;
      }
      changes.brandColor = parsed;
    }

    if (accentColor) {
      const parsed = parseHexColor(accentColor);
      if (parsed === null) {
        await interaction.reply(ephemeral('Cor secundária inválida. Use hexadecimal, por exemplo `#5865F2`.'));
        return;
      }
      changes.accentColor = parsed;
    }

    if (imageUrl) {
      if (!/^https?:\/\/\S+$/i.test(imageUrl)) {
        await interaction.reply(ephemeral('URL da imagem inválida. Use uma URL começando com `https://` ou `http://`.'));
        return;
      }
      changes.panelImageUrl = imageUrl;
    }

    if (!Object.keys(changes).length) {
      await interaction.reply(ephemeral('Nenhuma alteração enviada.'));
      return;
    }

    const updated = db.upsertConfig(interaction.guildId, changes);
    await interaction.reply(asEphemeral(createConfigAppearancePayload(updated, '✅ Aparência atualizada.')));
  }

  async function savePanelTextConfig(interaction) {
    const changes = pickModalValues(interaction, {
      panel_title: 'panelTitle',
      panel_description: 'panelDescription',
      panel_guidelines: 'panelGuidelines',
    });
    await saveModalConfig(interaction, changes, createConfigPanelPayload, '✅ Textos do painel atualizados.');
  }

  async function savePanelControlsConfig(interaction) {
    const changes = pickModalValues(interaction, {
      panel_select_label: 'panelSelectLabel',
      panel_select_description: 'panelSelectDescription',
    });
    await saveModalConfig(interaction, changes, createConfigPanelPayload, '✅ Seletor do painel atualizado.');
  }

  async function saveTicketConfig(interaction) {
    const changes = pickModalValues(interaction, {
      ticket_welcome_title: 'ticketWelcomeTitle',
      ticket_welcome_description: 'ticketWelcomeDescription',
      ticket_channel_prefix: 'ticketChannelPrefix',
    });
    await saveModalConfig(interaction, changes, createConfigTicketPayload, '✅ Mensagem do ticket atualizada.');
  }

  async function saveAutomationConfig(interaction) {
    const changes = {};
    const warning = optionalInteger(modalValue(interaction, 'warning_hours'), 1, 168);
    const closing = optionalInteger(modalValue(interaction, 'closing_hours'), 2, 336);
    const autoClose = modalValue(interaction, 'auto_close');

    if (warning.error || closing.error) {
      await interaction.reply(ephemeral('Revise os prazos. Use números dentro dos limites indicados no formulário.'));
      return;
    }
    if (warning.value !== null) changes.inactivityWarningHours = warning.value;
    if (closing.value !== null) changes.inactivityCloseHours = closing.value;
    if (autoClose) changes.autoCloseInactive = ['sim', 's', 'true', '1', 'on'].includes(autoClose.toLowerCase()) ? 1 : 0;

    const nextWarning = changes.inactivityWarningHours ?? db.getConfig(interaction.guildId).inactivityWarningHours;
    const nextClosing = changes.inactivityCloseHours ?? db.getConfig(interaction.guildId).inactivityCloseHours;
    if (nextClosing <= nextWarning) {
      await interaction.reply(ephemeral('O aviso de fechamento precisa ser maior que o primeiro aviso.'));
      return;
    }

    await saveModalConfig(interaction, changes, createConfigAutomationPayload, '✅ Automação atualizada.');
  }

  async function saveModalConfig(interaction, changes, payloadBuilder, notice) {
    if (!Object.keys(changes).length) {
      await interaction.reply(ephemeral('Nenhuma alteração enviada.'));
      return;
    }
    const updated = db.upsertConfig(interaction.guildId, changes);
    await interaction.reply(asEphemeral(payloadBuilder(updated, notice)));
  }

  return {
    handleCommand,
    handlePrefixCommand,
    handleInteraction,
  };

  async function handlePrefixCommand(message) {
    if (!message.guild || message.author.bot) return false;
    const [command, ...args] = message.content?.trim().split(/\s+/) || [];
    if (command?.toLowerCase() !== '!ticket') return false;

    await deleteCommandMessage(message);

    const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await temporaryMessage(message.channel, 'Você precisa da permissão Gerenciar Servidor para enviar o painel de tickets.');
      return true;
    }

    const targetChannel = await resolveTextChannel(message, args[0]);
    if (!targetChannel) {
      await temporaryMessage(message.channel, 'Não encontrei esse canal. Use `!ticket` ou `!ticket #canal`.');
      return true;
    }

    try {
      await targetChannel.send(createPanelPayload(db.getConfig(message.guild.id)));
    } catch (error) {
      console.error('Erro ao enviar painel com !ticket:', error);
      await temporaryMessage(
        message.channel,
        'Não consegui enviar o painel. Verifique se tenho permissão para Ver Canal, Enviar Mensagens, Anexar Arquivos e Usar Emojis Externos no canal escolhido.',
      );
      return true;
    }

    if (targetChannel.id !== message.channel.id) {
      await temporaryMessage(message.channel, `Painel de tickets enviado em ${targetChannel}.`);
    }
    return true;
  }
}

async function replyMissing(interaction, ticketId) {
  const payload = ephemeral(`Não encontrei o ticket #${padTicketId(ticketId)} no banco de dados.`);
  if (interaction.isStringSelectMenu?.() || interaction.isUserSelectMenu?.()) {
    await interaction.reply(payload);
    return;
  }
  await interaction.reply(payload);
}

async function deleteCommandMessage(message) {
  const me = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
  const permissions = me ? message.channel.permissionsFor(me) : null;
  if (!permissions?.has(PermissionFlagsBits.ManageMessages)) return;
  await message.delete().catch(() => null);
}

async function resolveTextChannel(message, raw) {
  if (!raw) return message.channel;
  const id = raw.match(/^<#(\d+)>$/)?.[1] || raw.match(/^\d+$/)?.[0];
  if (!id) return null;
  const channel = await message.guild.channels.fetch(id).catch(() => null);
  if (!channel?.send) return null;
  return channel;
}

async function temporaryMessage(channel, content) {
  const sent = await channel.send(content).catch(() => null);
  if (sent?.deletable) {
    setTimeout(() => sent.delete().catch(() => null), 8_000);
  }
}

async function resetPanelMenuMessage(interaction, config) {
  if (!interaction.message?.editable) return;
  const payload = createPanelPayload(config);
  await interaction.message.edit({ components: payload.components });
}

function parseHexColor(value) {
  const match = /^#?([0-9a-f]{6})$/i.exec(value);
  if (!match) return null;
  return Number.parseInt(match[1], 16);
}

function pickStringOptions(interaction, options) {
  const changes = {};
  for (const [optionName, configName] of Object.entries(options)) {
    const value = interaction.options.getString(optionName);
    if (value !== null && value.trim()) changes[configName] = value.trim();
  }
  return changes;
}

function ephemeral(content) {
  return { content, flags: MessageFlags.Ephemeral };
}

function asEphemeral(payload) {
  return {
    ...payload,
    flags: payload.flags | MessageFlags.Ephemeral,
  };
}

function modalValue(interaction, customId) {
  return interaction.fields.getTextInputValue(customId)?.trim() || '';
}

function pickModalValues(interaction, fields) {
  const changes = {};
  for (const [customId, configName] of Object.entries(fields)) {
    const value = modalValue(interaction, customId);
    if (value) changes[configName] = value;
  }
  return changes;
}

function optionalInteger(value, min, max) {
  if (!value) return { value: null, error: false };
  if (!/^\d+$/.test(value)) return { value: null, error: true };
  const parsed = Number(value);
  return {
    value: parsed,
    error: parsed < min || parsed > max,
  };
}

module.exports = {
  createTicketHandlers,
};
