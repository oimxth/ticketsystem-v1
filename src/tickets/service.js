const {
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  TextDisplayBuilder,
} = require('discord.js');
const fs = require('node:fs');

const { EVENT_TYPES, TICKET_STATUS } = require('./constants');
const {
  createClaimNoticePayload,
  createCloseRequestPayload,
  createClosedPayload,
  createGeneralStatsPayload,
  createPanelPayload,
  createStaffStatsPayload,
  createStatsPayload,
  createTicketMainPayload,
  createTicketLookupPayload,
  createTranscriptPayload,
  createUserHistoryPayload,
} = require('./components');
const { generateTranscript } = require('./transcripts');
const {
  formatDuration,
  formatTimestamp,
  padTicketId,
  periodToRange,
  safeJsonParse,
  sanitizeChannelName,
  truncate,
} = require('./format');

const CLOSED_TICKET_DELETE_DELAY_MS = 5 * 60_000;

class TicketService {
  constructor(db) {
    this.db = db;
  }

  isStaff(member, config = this.db.getConfig(member.guild.id)) {
    if (!member) return false;
    if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
    return Boolean(config.staffRoleId && member.roles.cache.has(config.staffRoleId));
  }

  async createTicketFromModal(interaction) {
    const config = this.db.getConfig(interaction.guildId);
    const existing = this.db.getTicketsByUser(interaction.guildId, interaction.user.id)
      .find((ticket) => ['OPEN', 'CLAIMED', 'WAITING_USER', 'WAITING_STAFF'].includes(ticket.status));

    if (existing && existing.status !== 'CLOSED') {
      const existingChannel = existing.channelId
        ? await interaction.guild.channels.fetch(existing.channelId).catch(() => null)
        : null;

      if (existingChannel) {
        await interaction.reply({
          content: `Você já possui um atendimento aberto: <#${existing.channelId}>.`,
          flags: MessageFlags.Ephemeral,
        });
        await this.resetPanelMenu(interaction, config);
        return;
      }

      this.db.updateTicket(existing.id, {
        status: 'CLOSED',
        closedBy: interaction.client.user.id,
        closedAt: Date.now(),
        closeReason: 'Canal do ticket removido manualmente.',
        channelId: null,
        mainMessageId: null,
      });
      this.db.addEvent(existing.id, EVENT_TYPES.CLOSED, interaction.client.user.id, null, 'Canal removido manualmente.');
    }

    const now = Date.now();
    let ticket = this.db.createTicket({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      mcNick: interaction.fields.getTextInputValue('mc_nick').trim(),
      subject: interaction.fields.getTextInputValue('subject').trim(),
      reason: interaction.fields.getTextInputValue('reason').trim(),
      description: interaction.fields.getTextInputValue('reason').trim(),
      additional: null,
      createdAt: now,
    });

    const overwrites = [
      {
        id: interaction.guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: interaction.client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ];

    if (config.staffRoleId) {
      overwrites.push({
        id: config.staffRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      });
    }

    const channel = await interaction.guild.channels.create({
      name: `${config.ticketChannelPrefix}${sanitizeChannelName(interaction.user.username)}`.slice(0, 90),
      type: ChannelType.GuildText,
      parent: config.categoryId || null,
      topic: `Ticket #${padTicketId(ticket.id)} | Usuário ${interaction.user.id} | ${ticket.mcNick}`,
      permissionOverwrites: overwrites,
    });

    ticket = this.db.updateTicket(ticket.id, { channelId: channel.id });
    this.db.addEvent(ticket.id, EVENT_TYPES.CREATED, interaction.user.id, null, ticket.subject, now);

    const message = await channel.send(createTicketMainPayload(ticket, config));
    ticket = this.db.updateTicket(ticket.id, { mainMessageId: message.id });

    await this.log(interaction.guild, `🎟️ Ticket #${padTicketId(ticket.id)} criado por <@${ticket.userId}> em ${channel}.`);
    await interaction.reply({
      content: `Atendimento criado com sucesso: ${channel}.`,
      flags: MessageFlags.Ephemeral,
    });
    await this.resetPanelMenu(interaction, config);
  }

  async claim(interaction, ticket) {
    const config = this.db.getConfig(interaction.guildId);
    if (!this.isStaff(interaction.member, config)) {
      await interaction.reply(ephemeral('Apenas atendentes podem assumir tickets.'));
      return;
    }

    if (ticket.claimedBy && ticket.claimedBy !== interaction.user.id) {
      await interaction.reply(ephemeral(`Este atendimento já foi assumido por <@${ticket.claimedBy}>.`));
      return;
    }

    if (ticket.claimedBy === interaction.user.id) {
      await interaction.reply(ephemeral('Você já está responsável por este atendimento.'));
      return;
    }

    const now = Date.now();
    ticket = this.db.updateTicket(ticket.id, {
      claimedBy: interaction.user.id,
      claimedAt: now,
      status: 'CLAIMED',
      lastStaffMessageAt: now,
    });
    this.db.addEvent(ticket.id, EVENT_TYPES.CLAIMED, interaction.user.id, null, null, now);

    await this.updateMainMessage(interaction.client, ticket);
    await interaction.channel.send(createClaimNoticePayload(ticket, interaction.user.id, config));
    await this.log(interaction.guild, `🎟️ Ticket #${padTicketId(ticket.id)} assumido por <@${interaction.user.id}>.`);
    await interaction.reply(ephemeral('Atendimento assumido com sucesso.'));
  }

  async release(interaction, ticket) {
    if (!await this.requireStaff(interaction)) return;
    const config = this.db.getConfig(interaction.guildId);
    await deferComponentUpdate(interaction);
    const previous = ticket.claimedBy;
    ticket = this.db.updateTicket(ticket.id, {
      claimedBy: null,
      status: 'OPEN',
    });
    this.db.addEvent(ticket.id, EVENT_TYPES.RELEASED, interaction.user.id, previous, null);
    await this.updateMainMessage(interaction.client, ticket);
    await this.log(interaction.guild, `🔓 Ticket #${padTicketId(ticket.id)} liberado por <@${interaction.user.id}>.`);
    await editComponentNotice(interaction, 'Atendimento liberado.', config);
  }

  async transfer(interaction, ticket, targetId) {
    if (!await this.requireStaff(interaction)) return;
    const config = this.db.getConfig(interaction.guildId);
    await deferComponentUpdate(interaction);
    const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!this.isStaff(targetMember, config)) {
      await editComponentNotice(interaction, 'O destino da transferência precisa ser um membro da equipe de atendimento.', config);
      return;
    }
    const previous = ticket.claimedBy;
    ticket = this.db.updateTicket(ticket.id, {
      claimedBy: targetId,
      claimedAt: ticket.claimedAt || Date.now(),
      status: 'CLAIMED',
    });
    this.db.addEvent(ticket.id, EVENT_TYPES.TRANSFERRED, interaction.user.id, targetId, previous ? `Anterior: ${previous}` : null);
    await this.updateMainMessage(interaction.client, ticket);
    await this.log(interaction.guild, `🔁 Ticket #${padTicketId(ticket.id)} transferido para <@${targetId}> por <@${interaction.user.id}>.`);
    await editComponentNotice(interaction, `Atendimento transferido para <@${targetId}>.`, config);
  }

  async addUser(interaction, ticket, targetId) {
    if (!await this.requireStaff(interaction)) return;
    const config = this.db.getConfig(interaction.guildId);
    await deferComponentUpdate(interaction);
    await interaction.channel.permissionOverwrites.edit(targetId, {
      ViewChannel: true,
      SendMessages: true,
      AttachFiles: true,
      ReadMessageHistory: true,
    });
    const participants = new Set(safeJsonParse(ticket.participantsJson, []));
    participants.add(targetId);
    this.db.updateTicket(ticket.id, { participantsJson: JSON.stringify([...participants]) });
    this.db.addEvent(ticket.id, EVENT_TYPES.USER_ADDED, interaction.user.id, targetId);
    await this.log(interaction.guild, `➕ <@${targetId}> adicionado ao ticket #${padTicketId(ticket.id)} por <@${interaction.user.id}>.`);
    await editComponentNotice(interaction, `<@${targetId}> foi adicionado ao atendimento.`, config);
  }

  async removeUser(interaction, ticket, targetId) {
    if (!await this.requireStaff(interaction)) return;
    const config = this.db.getConfig(interaction.guildId);
    await deferComponentUpdate(interaction);
    if (targetId === ticket.userId) {
      await editComponentNotice(interaction, 'O usuário principal do ticket não pode ser removido por esta ação.', config);
      return;
    }
    await interaction.channel.permissionOverwrites.delete(targetId).catch(() => null);
    const participants = safeJsonParse(ticket.participantsJson, []).filter((id) => id !== targetId);
    this.db.updateTicket(ticket.id, { participantsJson: JSON.stringify(participants) });
    this.db.addEvent(ticket.id, EVENT_TYPES.USER_REMOVED, interaction.user.id, targetId);
    await this.log(interaction.guild, `➖ <@${targetId}> removido do ticket #${padTicketId(ticket.id)} por <@${interaction.user.id}>.`);
    await editComponentNotice(interaction, `<@${targetId}> foi removido do atendimento.`, config);
  }

  async rename(interaction, ticket, name) {
    if (!await this.requireStaff(interaction)) return;
    const config = this.db.getConfig(interaction.guildId);
    const channelName = `${config.ticketChannelPrefix}${sanitizeChannelName(name)}`.slice(0, 90);
    await interaction.channel.setName(channelName, `Ticket renomeado por ${interaction.user.tag}`);
    this.db.addEvent(ticket.id, EVENT_TYPES.RENAMED, interaction.user.id, null, channelName);
    await this.log(interaction.guild, `✏️ Ticket #${padTicketId(ticket.id)} renomeado para ${channelName} por <@${interaction.user.id}>.`);
    await interaction.reply(ephemeral(`Canal renomeado para ${channelName}.`));
  }

  async setStatus(interaction, ticket, status) {
    if (!await this.requireStaff(interaction)) return;
    const config = this.db.getConfig(interaction.guildId);
    await deferComponentUpdate(interaction);
    if (!TICKET_STATUS[status] || ['CLOSED', 'ARCHIVED'].includes(status)) {
      await editComponentNotice(interaction, 'Status inválido para esta ação.', config);
      return;
    }
    ticket = this.db.updateTicket(ticket.id, { status });
    this.db.addEvent(ticket.id, EVENT_TYPES.STATUS_CHANGED, interaction.user.id, null, TICKET_STATUS[status].friendly);
    await this.updateMainMessage(interaction.client, ticket);
    await this.log(interaction.guild, `📌 Status do ticket #${padTicketId(ticket.id)} alterado para ${TICKET_STATUS[status].friendly}.`);
    await editComponentNotice(interaction, `Status alterado para ${TICKET_STATUS[status].friendly}.`, config);
  }

  async requestUser(interaction, ticket) {
    if (!await this.requireStaff(interaction)) return;
    const config = this.db.getConfig(interaction.guildId);
    await deferComponentUpdate(interaction);
    ticket = this.db.updateTicket(ticket.id, {
      status: 'WAITING_USER',
      inactivityWarnedAt: null,
      inactiveCloseWarnedAt: null,
    });
    this.db.addEvent(ticket.id, EVENT_TYPES.USER_REQUESTED, interaction.user.id);
    await this.updateMainMessage(interaction.client, ticket);
    await interaction.channel.send(`⏳ <@${ticket.userId}>, o atendimento está aguardando sua resposta.`);
    const dmSent = await this.sendUserDm(interaction.client, ticket.userId, [
      `⏳ Seu atendimento no servidor **${interaction.guild.name}** está aguardando sua resposta.`,
      ticket.channelId ? `Acesse o ticket por aqui: <#${ticket.channelId}>` : null,
    ].filter(Boolean).join('\n'));
    await this.log(interaction.guild, `⏳ Resposta solicitada ao usuário no ticket #${padTicketId(ticket.id)}.`);
    await editComponentNotice(
      interaction,
      dmSent
        ? 'Solicitação enviada ao usuário no canal e na DM.'
        : 'Solicitação enviada no canal, mas não consegui enviar DM para o usuário.',
      config,
    );
  }

  async requestClose(interaction, ticket) {
    if (!await this.requireStaff(interaction)) return;
    const config = this.db.getConfig(interaction.guildId);
    await deferComponentUpdate(interaction);
    this.db.addEvent(ticket.id, EVENT_TYPES.CLOSE_REQUESTED, interaction.user.id);
    await interaction.channel.send(createCloseRequestPayload(ticket, interaction.user.id, config));
    const dmSent = await this.sendUserDm(interaction.client, ticket.userId, [
      `✅ A equipe marcou seu atendimento no servidor **${interaction.guild.name}** como possivelmente resolvido.`,
      ticket.channelId ? `Confirme no canal do ticket: <#${ticket.channelId}>` : null,
    ].filter(Boolean).join('\n'));
    await editComponentNotice(
      interaction,
      dmSent
        ? 'Solicitação de fechamento enviada no canal e na DM.'
        : 'Solicitação de fechamento enviada no canal, mas não consegui enviar DM para o usuário.',
      config,
    );
  }

  async close(interaction, ticket, reason, actorId = interaction.user.id) {
    if (ticket.status === 'CLOSED') {
      await interaction.reply(ephemeral('Este ticket já está fechado.'));
      return;
    }

    const now = Date.now();
    const channel = interaction.channel || await interaction.client.channels.fetch(ticket.channelId).catch(() => null);
    let transcriptPath = ticket.transcriptPath;
    if (channel?.messages) {
      transcriptPath = await generateTranscript(channel, ticket, this.db.getEvents(ticket.id));
    }

    ticket = this.db.updateTicket(ticket.id, {
      status: 'CLOSED',
      closedBy: actorId,
      closedAt: now,
      closeReason: reason,
      transcriptPath,
    });
    this.db.addEvent(ticket.id, EVENT_TYPES.CLOSED, actorId, null, reason, now);
    if (transcriptPath) {
      this.db.addEvent(ticket.id, EVENT_TYPES.TRANSCRIPT_CREATED, interaction.client.user.id, null, 'Transcript gerado', now);
      await this.sendTranscriptToChannel(interaction.guild, ticket, transcriptPath);
    }

    await this.updateMainMessage(interaction.client, ticket);
    if (channel?.send) {
      await channel.send(createClosedPayload(ticket, this.db.getConfig(interaction.guildId || ticket.guildId))).catch(() => null);
    }
    await this.log(
      interaction.guild,
      `🔴 Ticket #${padTicketId(ticket.id)} encerrado por <@${actorId}>. Transcript: ${transcriptPath ? 'gerado e enviado ao canal configurado' : 'não gerado'}.`,
    );
    this.scheduleClosedTicketDeletion(interaction.client, ticket);

    const payload = ephemeral('Ticket encerrado. O transcript foi gerado e a avaliação ficará disponível por 5 minutos.');
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }
  }

  async rate(interaction, ticket, rating, comment = null) {
    if (interaction.user.id !== ticket.userId) {
      await interaction.reply(ephemeral('Apenas o usuário que abriu o ticket pode avaliar este atendimento.'));
      return;
    }
    ticket = this.db.updateTicket(ticket.id, {
      rating,
      ratingComment: comment,
      ratingAt: Date.now(),
    });
    this.db.addEvent(ticket.id, EVENT_TYPES.REVIEWED, interaction.user.id, ticket.claimedBy, `${rating} estrela(s)${comment ? ` — ${comment}` : ''}`);
    await this.log(interaction.guild, `⭐ Ticket #${padTicketId(ticket.id)} avaliado com ${rating}/5 por <@${interaction.user.id}>.`);
    await interaction.reply(ephemeral('Obrigado pela avaliação. Ela ficou salva no histórico e o canal será apagado em instantes.'));
    this.scheduleChannelDeletion(interaction.client, ticket, 5_000, 'Ticket avaliado pelo usuário');
  }

  async onMessage(message) {
    if (!message.guild || message.author.bot) return;
    const ticket = this.db.getTicketByChannel(message.channelId);
    if (!ticket || ['CLOSED', 'ARCHIVED'].includes(ticket.status)) return;

    const config = this.db.getConfig(message.guild.id);
    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    const staff = this.isStaff(member, config);
    const now = message.createdTimestamp || Date.now();
    const changes = { messageCount: ticket.messageCount + 1 };

    if (staff) {
      changes.lastStaffMessageAt = now;
      if (!ticket.firstResponseAt) {
        const firstResponseSeconds = Math.floor((now - ticket.createdAt) / 1000);
        changes.firstResponseAt = now;
        changes.firstResponseSeconds = firstResponseSeconds;
        this.db.addEvent(ticket.id, EVENT_TYPES.FIRST_RESPONSE, message.author.id, null, formatDuration(firstResponseSeconds), now);
      }
      if (ticket.status === 'WAITING_STAFF') changes.status = 'WAITING_USER';
    } else if (message.author.id === ticket.userId) {
      changes.lastUserMessageAt = now;
      changes.inactivityWarnedAt = null;
      changes.inactiveCloseWarnedAt = null;
      if (ticket.status === 'WAITING_USER') changes.status = 'WAITING_STAFF';
    }

    const updated = this.db.updateTicket(ticket.id, changes);
    if (changes.status || changes.firstResponseAt) {
      await this.updateMainMessage(message.client, updated).catch(() => null);
    }
  }

  async checkAutomation(client) {
    const now = Date.now();
    for (const ticket of this.db.getClosedTicketsPendingDeletion(now - CLOSED_TICKET_DELETE_DELAY_MS)) {
      await this.deleteTicketChannel(client, ticket, 'Ticket fechado sem avaliação em 5 minutos');
    }

    for (const ticket of this.db.getOpenTickets()) {
      const guild = await client.guilds.fetch(ticket.guildId).catch(() => null);
      if (!guild) continue;
      const config = this.db.getConfig(ticket.guildId);
      const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
      if (!channel) {
        this.db.updateTicket(ticket.id, {
          status: 'CLOSED',
          closedBy: client.user.id,
          closedAt: now,
          closeReason: 'Canal do ticket removido manualmente.',
          channelId: null,
          mainMessageId: null,
        });
        this.db.addEvent(ticket.id, EVENT_TYPES.CLOSED, client.user.id, null, 'Canal removido manualmente.', now);
        await this.log(guild, `⚠️ Ticket #${padTicketId(ticket.id)} foi fechado no banco porque o canal não existe mais.`);
        continue;
      }

      if (ticket.status === 'WAITING_USER') {
        const lastUser = ticket.lastUserMessageAt || ticket.createdAt;
        const inactiveMs = now - lastUser;
        const warningMs = config.inactivityWarningHours * 3_600_000;
        const closeMs = config.inactivityCloseHours * 3_600_000;

        if (!ticket.inactivityWarnedAt && inactiveMs >= warningMs) {
          const updated = this.db.updateTicket(ticket.id, { inactivityWarnedAt: now });
          this.db.addEvent(ticket.id, EVENT_TYPES.INACTIVITY_WARNING, client.user.id, ticket.userId, 'Primeiro aviso', now);
          await channel.send(`⏳ <@${ticket.userId}>, o atendimento está aguardando sua resposta há ${config.inactivityWarningHours} horas.`);
          await this.updateMainMessage(client, updated).catch(() => null);
        } else if (!ticket.inactiveCloseWarnedAt && inactiveMs >= closeMs) {
          this.db.updateTicket(ticket.id, { inactiveCloseWarnedAt: now });
          this.db.addEvent(ticket.id, EVENT_TYPES.INACTIVITY_WARNING, client.user.id, ticket.userId, 'Aviso de encerramento', now);
          await channel.send(`⚠️ <@${ticket.userId}>, este ticket poderá ser encerrado automaticamente por inatividade.`);
        } else if (config.autoCloseInactive && ticket.inactiveCloseWarnedAt && now - ticket.inactiveCloseWarnedAt >= 3_600_000) {
          const fakeInteraction = {
            channel,
            client,
            guild,
            user: client.user,
            replied: false,
            deferred: false,
            reply: (payload) => channel.send({ content: payload.content }),
            followUp: (payload) => channel.send({ content: payload.content }),
          };
          await this.close(fakeInteraction, ticket, 'Encerrado automaticamente por inatividade.', client.user.id);
        }
      }
    }
  }

  statsPayload(guildId, period) {
    const range = periodToRange(period);
    const tickets = this.db.queryTickets(guildId, range.start, range.end);
    const all = this.db.getAllTickets(guildId);
    const closed = tickets.filter((ticket) => ['CLOSED', 'ARCHIVED'].includes(ticket.status));
    const openAll = all.filter((ticket) => ['OPEN', 'CLAIMED', 'WAITING_USER', 'WAITING_STAFF'].includes(ticket.status));
    const firstResponses = tickets.filter((ticket) => ticket.firstResponseSeconds !== null && ticket.firstResponseSeconds !== undefined);
    const rated = tickets.filter((ticket) => ticket.rating);
    const staffStats = new Map();
    for (const ticket of closed.filter((item) => item.claimedBy)) {
      const current = staffStats.get(ticket.claimedBy) || { count: 0, firstHandledAt: Number.POSITIVE_INFINITY };
      staffStats.set(ticket.claimedBy, {
        count: current.count + 1,
        firstHandledAt: Math.min(current.firstHandledAt, ticket.closedAt || ticket.createdAt || Date.now()),
      });
    }
    const [topStaffId, topStaff] = [...staffStats.entries()]
      .sort(([, a], [, b]) => b.count - a.count || a.firstHandledAt - b.firstHandledAt)[0] || [];

    const days = Math.max(1, Math.ceil((range.end - (range.start || Math.min(...tickets.map((ticket) => ticket.createdAt), range.end))) / 86_400_000));
    return createGeneralStatsPayload({
      periodLabel: statsPeriodLabel(period, range),
      createdTickets: tickets.length,
      closedTickets: closed.length,
      openTickets: openAll.length,
      waitingTickets: openAll.filter((ticket) => ticket.status === 'OPEN' || ticket.status === 'WAITING_STAFF').length,
      claimedTickets: openAll.filter((ticket) => ticket.status === 'CLAIMED').length,
      dailyAverage: (tickets.length / days).toFixed(1),
      averageFirstResponse: formatDuration(avg(firstResponses.map((ticket) => ticket.firstResponseSeconds))),
      averageHandlingTime: formatDuration(avg(closed.map((ticket) => Math.floor(((ticket.closedAt || Date.now()) - ticket.createdAt) / 1000)))),
      averageRating: rated.length ? `${(rated.reduce((sum, ticket) => sum + ticket.rating, 0) / rated.length).toFixed(1)}/5` : 'Sem avaliações',
      topStaffId,
      topStaffCount: topStaff?.count || 0,
    });
  }

  staffStatsPayload(guildId, userId, period, staffProfile = {}) {
    const config = this.db.getConfig(guildId);
    const range = periodToRange(period);
    const tickets = this.db.queryTickets(guildId, range.start, range.end)
      .filter((ticket) => ticket.claimedBy === userId);
    const all = this.db.getAllTickets(guildId).filter((ticket) => ticket.claimedBy === userId);
    const rated = tickets.filter((ticket) => ticket.rating);
    const firstResponses = tickets.filter((ticket) => ticket.firstResponseSeconds !== null && ticket.firstResponseSeconds !== undefined);
    const closed = tickets.filter((ticket) => ticket.closedAt);
    const transferred = this.db.getAllTickets(guildId)
      .flatMap((ticket) => this.db.getEvents(ticket.id))
      .filter((event) => event.type === EVENT_TYPES.TRANSFERRED && event.actorId === userId).length;

    return createStaffStatsPayload({
      displayName: staffProfile.displayName || `Usuário ${userId}`,
      avatarUrl: staffProfile.avatarUrl,
      periodLabel: range.label,
      ticketsHandled: tickets.length,
      ticketsThisMonth: this.db.queryTickets(guildId, periodToRange('month').start, Date.now()).filter((ticket) => ticket.claimedBy === userId).length,
      currentlyClaimed: all.filter((ticket) => ['CLAIMED', 'WAITING_USER', 'WAITING_STAFF'].includes(ticket.status)).length,
      transferred,
      averageRating: rated.length ? `${(rated.reduce((sum, ticket) => sum + ticket.rating, 0) / rated.length).toFixed(1)}/5` : 'Sem avaliações',
      averageFirstResponse: formatDuration(avg(firstResponses.map((ticket) => ticket.firstResponseSeconds))),
      averageHandlingTime: formatDuration(avg(closed.map((ticket) => Math.floor((ticket.closedAt - ticket.createdAt) / 1000)))),
    });
  }

  rankingPayload(guildId, type = 'tickets', period = 'month') {
    const config = this.db.getConfig(guildId);
    const range = periodToRange(period);
    const tickets = this.db.queryTickets(guildId, range.start, range.end)
      .filter((ticket) => ticket.claimedBy);
    const grouped = groupBy(tickets, (ticket) => ticket.claimedBy);
    const rows = [...grouped.entries()].map(([staffId, items]) => {
      const rated = items.filter((ticket) => ticket.rating);
      const first = items.filter((ticket) => ticket.firstResponseSeconds !== null && ticket.firstResponseSeconds !== undefined);
      const values = {
        tickets: items.length,
        rating: rated.length ? rated.reduce((sum, ticket) => sum + ticket.rating, 0) / rated.length : 0,
        first_response: first.length ? avg(first.map((ticket) => ticket.firstResponseSeconds)) : Number.POSITIVE_INFINITY,
      };
      return { staffId, value: values[type] ?? values.tickets, count: items.length };
    });

    rows.sort((a, b) => type === 'first_response' ? a.value - b.value : b.value - a.value);
    const medals = ['🥇', '🥈', '🥉'];
    const lines = rows.slice(0, 10).map((row, index) => {
      const prefix = medals[index] || `${index + 1}.`;
      let metric = `${row.count} tickets`;
      if (type === 'rating') metric = `${row.value.toFixed(1)}/5`;
      if (type === 'first_response') metric = formatDuration(row.value);
      return `${prefix} <@${row.staffId}> — ${metric}`;
    });

    return createStatsPayload(`Ranking de atendimentos — ${range.label}`, [
      `**Critério:** ${typeLabel(type)}`,
      ...(lines.length ? lines : ['Sem dados para este período.']),
    ], config);
  }

  userHistoryPayload(guildId, userId, profile = {}) {
    const tickets = this.db.getTicketsByUser(guildId, userId);
    const open = tickets.filter((ticket) => ['OPEN', 'CLAIMED', 'WAITING_USER', 'WAITING_STAFF'].includes(ticket.status));
    const closed = tickets.filter((ticket) => ['CLOSED', 'ARCHIVED'].includes(ticket.status));
    const rated = tickets.filter((ticket) => ticket.rating);
    const last = tickets[0];
    return createUserHistoryPayload({
      displayName: profile.displayName || `Usuário ${userId}`,
      avatarUrl: profile.avatarUrl,
      searchCommandMention: profile.searchCommandMention || '`/ticket buscar id:<id>`',
      totalTickets: tickets.length,
      openTickets: open.length,
      closedTickets: closed.length,
      lastTicket: last,
      averageRating: rated.length
        ? `${(rated.reduce((sum, ticket) => sum + ticket.rating, 0) / rated.length).toFixed(1)}/5`
        : 'Nenhuma avaliação realizada',
    });
  }

  ticketSummaryPayload(ticket, profile = {}) {
    const config = this.db.getConfig(ticket.guildId);
    return createTicketLookupPayload(ticket, config, {
      ...profile,
      transcriptAvailable: Boolean(ticket.transcriptPath && fs.existsSync(ticket.transcriptPath)),
    });
  }

  configPayload(guildId) {
    const config = this.db.getConfig(guildId);
    return createStatsPayload('Configuração de tickets', [
      `**Categoria:** ${config.categoryId ? `<#${config.categoryId}>` : 'Não configurada'}`,
      `**Cargo da equipe:** ${config.staffRoleId ? `<@&${config.staffRoleId}>` : 'Não configurado'}`,
      `**Canal de logs:** ${config.logChannelId ? `<#${config.logChannelId}>` : 'Não configurado'}`,
      `**Canal de transcripts:** ${config.transcriptChannelId ? `<#${config.transcriptChannelId}>` : 'Não configurado'}`,
      `**Inatividade:** aviso em ${config.inactivityWarningHours}h, fechamento em ${config.inactivityCloseHours}h, auto-fechar ${config.autoCloseInactive ? 'ativado' : 'desativado'}`,
      `**Cor principal:** ${formatColor(config.brandColor)}`,
      `**Cor secundária:** ${formatColor(config.accentColor)}`,
      `**Título do painel:** ${config.panelTitle}`,
      `**Imagem do painel:** ${config.panelImageUrl || 'Mascote padrão'}`,
      `**Título do ticket:** ${config.ticketWelcomeTitle}`,
      `**Prefixo dos canais:** ${config.ticketChannelPrefix}`,
    ], config);
  }

  async updateMainMessage(client, ticket) {
    const config = this.db.getConfig(ticket.guildId);
    if (!ticket.channelId || !ticket.mainMessageId) return;
    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel?.messages) return;
    const message = await channel.messages.fetch(ticket.mainMessageId).catch(() => null);
    if (!message) return;
    await message.edit(createTicketMainPayload(ticket, config));
  }

  async requireStaff(interaction) {
    const config = this.db.getConfig(interaction.guildId);
    if (this.isStaff(interaction.member, config)) return true;
    const payload = ephemeral('Apenas a equipe de atendimento pode executar esta ação.');
    if (interaction.isStringSelectMenu?.() || interaction.isUserSelectMenu?.()) {
      await interaction.reply(payload);
      return false;
    }
    await interaction.reply(payload);
    return false;
  }

  async log(guild, message) {
    const config = this.db.getConfig(guild.id);
    if (!config.logChannelId) return;
    const channel = await guild.channels.fetch(config.logChannelId).catch(() => null);
    if (!channel?.send) return;
    const container = new ContainerBuilder()
      .setAccentColor(config.accentColor)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(message));
    await channel.send({
      flags: 32_768,
      components: [container],
      allowedMentions: { parse: [] },
    }).catch(() => null);
  }

  async sendTranscriptToChannel(guild, ticket, transcriptPath) {
    const config = this.db.getConfig(guild.id);
    if (!config.transcriptChannelId || !transcriptPath) return;

    const channel = await guild.channels.fetch(config.transcriptChannelId).catch(() => null);
    if (!channel?.send) return;

    await channel.send(createTranscriptPayload(ticket, transcriptPath, config)).catch(() => null);
  }

  async showTranscript(interaction, ticket) {
    if (!ticket.transcriptPath || !fs.existsSync(ticket.transcriptPath)) {
      await interaction.reply(ephemeral('Transcript não disponível para este ticket.'));
      return;
    }

    await interaction.reply({
      content: `Transcript do ticket #${padTicketId(ticket.id)}:`,
      files: [{ attachment: ticket.transcriptPath, name: `ticket-${padTicketId(ticket.id)}.html` }],
      flags: MessageFlags.Ephemeral,
    });
  }

  async resetPanelMenu(interaction, config) {
    const [, action, panelChannelId, panelMessageId] = interaction.customId.split(':');
    if (action !== 'open_modal' || !panelChannelId || !panelMessageId) return;

    const channel = await interaction.client.channels.fetch(panelChannelId).catch(() => null);
    if (!channel?.messages) return;

    const message = await channel.messages.fetch(panelMessageId).catch(() => null);
    if (!message) return;

    const payload = createPanelPayload(config);
    await message.edit({ components: payload.components }).catch(() => null);
  }

  async sendUserDm(client, userId, content) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return false;
    return user.send({ content }).then(() => true).catch(() => false);
  }

  scheduleClosedTicketDeletion(client, ticket) {
    if (!ticket.channelId) return;
    this.scheduleChannelDeletion(
      client,
      ticket,
      CLOSED_TICKET_DELETE_DELAY_MS,
      'Ticket fechado sem avaliação em 5 minutos',
      { onlyWithoutRating: true },
    );
  }

  scheduleChannelDeletion(client, ticket, delayMs, reason, options = {}) {
    if (!ticket.channelId) return;
    setTimeout(() => {
      const current = this.db.getTicket(ticket.id);
      if (!current?.channelId) return;
      if (options.onlyWithoutRating && current.rating) return;
      this.deleteTicketChannel(client, current, reason).catch((error) => {
        console.error(`Erro ao apagar canal do ticket #${padTicketId(ticket.id)}:`, error);
      });
    }, delayMs);
  }

  async deleteTicketChannel(client, ticket, reason) {
    if (!ticket.channelId) return;
    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (channel?.deletable) {
      await channel.delete(reason).catch(() => null);
    }
    this.db.updateTicket(ticket.id, {
      channelId: null,
      mainMessageId: null,
    });
  }
}

function avg(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (!usable.length) return null;
  return Math.round(usable.reduce((sum, value) => sum + value, 0) / usable.length);
}

function groupBy(items, getter) {
  const map = new Map();
  for (const item of items) {
    const key = getter(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function typeLabel(type) {
  const labels = {
    tickets: 'Quantidade de atendimentos',
    rating: 'Melhor avaliação média',
    first_response: 'Melhor primeira resposta média',
  };
  return labels[type] || labels.tickets;
}

function statsPeriodLabel(period, range) {
  if (period === 'month') {
    const label = new Intl.DateTimeFormat('pt-BR', {
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date());
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  if (period === 'all' || !period) return 'Todo o período';
  return range.label;
}

function formatColor(color) {
  return `#${Number(color).toString(16).padStart(6, '0').toUpperCase()}`;
}

function componentNotice(content, config = {}) {
  const color = Number(config.accentColor || config.brandColor || 0x5865f2);
  const container = new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
  };
}

async function deferComponentUpdate(interaction) {
  if (interaction.deferred || interaction.replied) return;
  await interaction.deferUpdate();
}

async function editComponentNotice(interaction, content, config = {}) {
  const payload = componentNotice(content, config);
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return;
  }
  await interaction.update(payload);
}

function ephemeral(content) {
  return { content, flags: MessageFlags.Ephemeral };
}

module.exports = {
  TicketService,
};
