const path = require('node:path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  EmbedBuilder,
  MediaGalleryBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
  UserSelectMenuBuilder,
} = require('discord.js');

const {
  DEFAULT_TICKET_STYLE,
  PERIODS,
  RANKING_TYPES,
  SUPPORT_IMAGE_PATH,
  TICKET_STATUS,
} = require('./constants');
const {
  formatDuration,
  formatTimestamp,
  padTicketId,
  stars,
  truncate,
} = require('./format');

function styleFromConfig(config = {}) {
  return {
    ...DEFAULT_TICKET_STYLE,
    ...Object.fromEntries(Object.entries(config).filter(([, value]) => value !== null && value !== undefined)),
  };
}

function v2Payload(components, extra = {}) {
  const flags = extra.ephemeral
    ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    : MessageFlags.IsComponentsV2;
  const { ephemeral, ...rest } = extra;
  return {
    flags,
    components,
    ...rest,
  };
}

function createPanelPayload(config) {
  const style = styleFromConfig(config);
  const imagePath = path.resolve(process.cwd(), SUPPORT_IMAGE_PATH);
  const defaultImageName = path.basename(SUPPORT_IMAGE_PATH);
  const imageUrl = style.panelImageUrl || `attachment://${defaultImageName}`;
  const embed = new EmbedBuilder()
    .setColor(style.brandColor)
    .setDescription([
      style.panelTitle,
      style.panelDescription,
      '',
      style.panelGuidelines,
    ].join('\n'))
    .setThumbnail(imageUrl);

  const payload = {
    embeds: [embed],
    components: [createOpenTicketSelectRow(style)],
    files: [{ attachment: imagePath, name: defaultImageName }],
  };
  if (style.panelImageUrl) delete payload.files;
  return payload;
}

function createOpenTicketSelectRow(style) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket:open_menu')
      .setPlaceholder('Selecione uma categoria...')
      .addOptions({
        label: style.panelSelectLabel,
        value: 'support',
        description: style.panelSelectDescription,
        emoji: { name: '☎️' },
      }),
  );
}

function createTicketMainPayload(ticket, config) {
  const status = TICKET_STATUS[ticket.status] || TICKET_STATUS.OPEN;
  const closed = ticket.status === 'CLOSED';
  const firstResponse = ticket.firstResponseSeconds === null || ticket.firstResponseSeconds === undefined
    ? 'Aguardando primeira resposta'
    : formatDuration(ticket.firstResponseSeconds);
  const responsible = ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Ainda não atribuído';

  const container = new ContainerBuilder()
    .setAccentColor(status.color)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            '## 🛡️ Atendimento iniciado',
            '',
            'Este é um canal **privado** entre você e nossa equipe.',
            'Explique sua situação com o máximo de detalhes possível e aguarde até que um membro da equipe assuma o atendimento.',
            '',
            `> ${ticketStatusLine(ticket.status)}`,
          ].join('\n')),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setDescription(`Cabeça Minecraft de ${ticket.mcNick}`)
            .setURL(`https://mc-heads.net/head/${encodeURIComponent(ticket.mcNick)}`),
        ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '### 📋 Informações do ticket',
        '',
        '**Assunto:**',
        `\`\`\`${truncate(ticket.subject, 700)}\`\`\``,
        '',
        '**👤 Solicitante**',
        `<@${ticket.userId}>`,
        '**🎧 Responsável**',
        responsible,
        '**⏱️ Tempo de resposta**',
        firstResponse,
        '',
        '### 💡 Enquanto aguarda:',
        '- Evite enviar mensagens repetidas ou marcar membros da equipe. Assim que disponível, um responsável assumirá seu ticket e dará continuidade ao atendimento.',
        '- Caso sua dúvida já tenha sido resolvida, você poderá encerrar o ticket a qualquer momento.',
        '',
        `Ticket #${padTicketId(ticket.id)} • Criado em ${formatTimestamp(ticket.createdAt, 'f')}`,
      ].join('\n')),
    );

  if (!closed) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket:${ticket.id}:claim`)
          .setLabel(ticket.claimedBy ? 'Assumido' : 'Assumir')
          .setEmoji({ name: ticket.claimedBy ? '✅' : '👋' })
          .setStyle(ButtonStyle.Primary)
          .setDisabled(closed || Boolean(ticket.claimedBy)),
        new ButtonBuilder()
          .setCustomId(`ticket:${ticket.id}:close`)
          .setLabel('Encerrar')
          .setEmoji({ name: '🔒' })
          .setStyle(ButtonStyle.Danger)
          .setDisabled(closed),
        new ButtonBuilder()
          .setCustomId(`ticket:${ticket.id}:manage`)
          .setLabel('Gerenciar')
          .setEmoji({ name: '⚙️' })
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(closed),
      ),
    );
  }

  return v2Payload([container]);
}

function createClaimNoticePayload(ticket, staffId, config) {
  const style = styleFromConfig(config);
  const container = new ContainerBuilder()
    .setAccentColor(style.accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '## 🎧 Atendimento assumido',
        '',
        `<@${ticket.userId}>, seu atendimento foi assumido por <@${staffId}>.`,
        'Continue enviando as informações por aqui para agilizar a análise.',
      ].join('\n')),
    );
  return v2Payload([container]);
}

function createClosedPayload(ticket, config) {
  const style = styleFromConfig(config);
  const alreadyRated = Boolean(ticket.rating);
  const container = new ContainerBuilder()
    .setAccentColor(style.brandColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '## ⭐ Avalie o atendimento',
        `<@${ticket.userId}>, seu ticket foi encerrado.`,
        'Selecione uma nota abaixo para avaliar a experiência com nossa equipe.',
        '',
        alreadyRated
          ? `Avaliação recebida: ${stars(ticket.rating)}`
          : 'Se não houver avaliação em 5 minutos, este canal será apagado automaticamente.',
      ].join('\n')),
    );
  if (!alreadyRated) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ticket:${ticket.id}:rate`)
          .setPlaceholder('Avaliar atendimento')
          .addOptions([1, 2, 3, 4, 5].map((rating) => ({
            label: `${rating} estrela${rating > 1 ? 's' : ''}`,
            value: String(rating),
            emoji: { name: '⭐' },
          }))),
      ),
    );
  }

  return v2Payload([container]);
}

function createCloseRequestPayload(ticket, staffId, config) {
  const style = styleFromConfig(config);
  const container = new ContainerBuilder()
    .setAccentColor(style.accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## ✅ Solicitação de fechamento #${padTicketId(ticket.id)}`,
        `<@${staffId}> marcou este atendimento como possivelmente resolvido.`,
        '',
        `<@${ticket.userId}>, confirme o fechamento se não precisar de mais ajuda ou mantenha o ticket aberto para continuar o atendimento.`,
      ].join('\n')),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket:${ticket.id}:user_confirm_close`)
          .setLabel('Confirmar fechamento')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`ticket:${ticket.id}:user_keep_open`)
          .setLabel('Manter aberto')
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  return v2Payload([container]);
}

function createTicketKeptOpenPayload(ticket, userId, config) {
  const style = styleFromConfig(config);
  const container = new ContainerBuilder()
    .setAccentColor(style.accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## 🟢 Ticket mantido aberto #${padTicketId(ticket.id)}`,
        `<@${userId}> informou que ainda precisa de atendimento.`,
        '',
        'O ticket continuará aberto para que a equipe possa dar continuidade ao suporte.',
      ].join('\n')),
    );
  return v2Payload([container]);
}

function createManagePayload(ticket, config) {
  const style = styleFromConfig(config);
  const container = new ContainerBuilder()
    .setAccentColor(style.accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `## Gerenciar Ticket #${padTicketId(ticket.id)}`,
      'Escolha uma ação administrativa para este atendimento.',
    ].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ticket:${ticket.id}:manage_select`)
          .setPlaceholder('Selecione uma ação...')
          .addOptions(
            { label: 'Liberar atendimento', value: 'release', emoji: { name: '🔓' } },
            { label: 'Transferir atendimento', value: 'transfer', emoji: { name: '🔁' } },
            { label: 'Adicionar usuário', value: 'add_user', emoji: { name: '➕' } },
            { label: 'Remover usuário', value: 'remove_user', emoji: { name: '➖' } },
            { label: 'Renomear ticket', value: 'rename', emoji: { name: '✏️' } },
            { label: 'Alterar status', value: 'status', emoji: { name: '📌' } },
            { label: 'Solicitar resposta do usuário', value: 'request_user', emoji: { name: '⏳' } },
            { label: 'Solicitar fechamento', value: 'request_close', emoji: { name: '✅' } },
          ),
      ),
    );

  return v2Payload([container], { ephemeral: true });
}

function createStatusMenu(ticket, config) {
  const style = styleFromConfig(config);
  const container = new ContainerBuilder()
    .setAccentColor(style.accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `## Status #${padTicketId(ticket.id)}`,
      'Selecione o novo status operacional do atendimento.',
    ].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ticket:${ticket.id}:status_select`)
          .setPlaceholder('Status')
          .addOptions(['OPEN', 'CLAIMED', 'WAITING_USER', 'WAITING_STAFF'].map((value) => ({
            label: TICKET_STATUS[value].label,
            value,
            description: TICKET_STATUS[value].friendly,
            emoji: { name: TICKET_STATUS[value].friendly.split(' ')[0] },
            default: ticket.status === value,
          }))),
      ),
    );

  return v2Payload([container]);
}

function createUserSelectPayload(ticket, action, placeholder, config) {
  const style = styleFromConfig(config);
  const container = new ContainerBuilder()
    .setAccentColor(style.accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `## Ticket #${padTicketId(ticket.id)}`,
      placeholder,
    ].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`ticket:${ticket.id}:${action}`)
          .setPlaceholder(placeholder)
          .setMinValues(1)
          .setMaxValues(1),
      ),
    );

  return v2Payload([container], { ephemeral: true });
}

function createOpenTicketModal(context = {}) {
  const customId = ['ticket', 'open_modal', context.channelId, context.messageId]
    .filter(Boolean)
    .join(':');

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Abrir atendimento')
    .addComponents(
      textInputRow('mc_nick', 'Seu nick no Minecraft', TextInputStyle.Short, 3, 32, true, 'Soulwen'),
      textInputRow('subject', 'Assunto', TextInputStyle.Short, 4, 100, true, 'Problema com compra, dúvida, denúncia...'),
      textInputRow('reason', 'Motivo do contato', TextInputStyle.Paragraph, 10, 600, true),
    );
}

function createCloseModal(ticket) {
  return new ModalBuilder()
    .setCustomId(`ticket:${ticket.id}:close_modal`)
    .setTitle(`Fechar ticket #${padTicketId(ticket.id)}`)
    .addComponents(
      textInputRow('close_reason', 'Motivo do fechamento', TextInputStyle.Paragraph, 5, 800, true),
    );
}

function createRenameModal(ticket) {
  return new ModalBuilder()
    .setCustomId(`ticket:${ticket.id}:rename_modal`)
    .setTitle(`Renomear ticket #${padTicketId(ticket.id)}`)
    .addComponents(
      textInputRow('new_name', 'Novo nome do canal', TextInputStyle.Short, 3, 80, true),
    );
}

function createReviewModal(ticket, rating) {
  return new ModalBuilder()
    .setCustomId(`ticket:${ticket.id}:review_modal:${rating}`)
    .setTitle(`Avaliação #${padTicketId(ticket.id)}`)
    .addComponents(
      textInputRow('review_comment', `Comentário opcional (${stars(rating)})`, TextInputStyle.Paragraph, 0, 800, false),
    );
}

function createTicketSummaryPayload(ticket, title = `Ticket #${padTicketId(ticket.id)}`, config) {
  return createTicketLookupPayload(ticket, config, { title });
}

function createTicketLookupPayload(ticket, config, profile = {}) {
  const footerIconPath = path.resolve(process.cwd(), SUPPORT_IMAGE_PATH);
  const footerIconName = path.basename(SUPPORT_IMAGE_PATH);
  const status = ticketLookupStatus(ticket);
  const ticketNumber = padTicketId(ticket.id);
  const openUrl = profile.openUrl !== undefined
    ? profile.openUrl
    : (ticket.channelId
      ? `https://discord.com/channels/${ticket.guildId}/${ticket.channelId}${ticket.mainMessageId ? `/${ticket.mainMessageId}` : ''}`
      : null);
  const transcriptAvailable = profile.transcriptAvailable ?? Boolean(ticket.transcriptPath);

  const embed = new EmbedBuilder()
    .setColor(status.color)
    .setDescription([
      `<:ticket:1544059115897360456> **TICKET #${ticketNumber}**`,
      '',
      '> <:user:1544057765989716058> **Usuário:**',
      `> ${profile.displayName ? `@${profile.displayName}` : `<@${ticket.userId}>`}`,
      '> **Atendente:**',
      `> ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : '`Não assumido`'}`,
      '',
      '<:chart:1544059409922261002> **STATUS:**',
      `> \`${status.label}\``,
      '',
      '<:clock:1544059493506228376> **INFORMAÇÕES:**',
      `> **Aberto em:** ${formatTicketDate(ticket.createdAt)}`,
      `> **Fechado em:** ${formatTicketDate(ticket.closedAt)}`,
      `> **Duração:** \`${ticketDuration(ticket)}\``,
      '',
      '<:reply:1544059546400464917> **ATENDIMENTO:**',
      `> **Primeira resposta:** \`${formatDuration(ticket.firstResponseSeconds)}\``,
      `> **Avaliação:** \`${ticket.rating ? `${Number(ticket.rating).toFixed(1)}/5` : 'Sem avaliação'}\``,
      '',
      '<:ticket_closed:1544058416857620593> **TRANSCRIPT**',
      `> \`${transcriptAvailable ? 'Disponível' : 'Indisponível'}\``,
    ].join('\n'))
    .setFooter({
      text: `League • Ticket #${ticketNumber}`,
      iconURL: `attachment://${footerIconName}`,
    });

  if (profile.avatarUrl) embed.setThumbnail(profile.avatarUrl);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:${ticket.id}:show_transcript`)
      .setLabel('Transcript')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!transcriptAvailable),
    new ButtonBuilder()
      .setCustomId(`ticket:${ticket.id}:show_user`)
      .setLabel('Ver usuário')
      .setStyle(ButtonStyle.Secondary),
  );

  if (openUrl) {
    buttons.addComponents(
      new ButtonBuilder()
        .setLabel('Abrir ticket')
        .setStyle(ButtonStyle.Link)
        .setURL(openUrl),
    );
  } else {
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket:${ticket.id}:open_unavailable`)
        .setLabel('Abrir ticket')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );
  }

  return {
    embeds: [embed],
    components: [buttons],
    files: [{ attachment: footerIconPath, name: footerIconName }],
    flags: MessageFlags.Ephemeral,
  };
}

function createStatsPayload(title, lines, config) {
  const style = styleFromConfig(config);
  const container = new ContainerBuilder()
    .setAccentColor(style.accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `## ${title}`,
      ...lines,
    ].join('\n')));
  return v2Payload([container], { ephemeral: true });
}

function createGeneralStatsPayload(stats) {
  const footerIconPath = path.resolve(process.cwd(), SUPPORT_IMAGE_PATH);
  const footerIconName = path.basename(SUPPORT_IMAGE_PATH);
  const teamHighlight = stats.topStaffId
    ? [
      `> <@${stats.topStaffId}>`,
      `> \`${stats.topStaffCount} atendimento${stats.topStaffCount === 1 ? '' : 's'} realizado${stats.topStaffCount === 1 ? '' : 's'}\``,
    ]
    : ['> `Sem dados`'];

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setThumbnail(`attachment://${footerIconName}`)
    .setDescription([
      '<:analytics:1544059314879070268> **ESTATÍSTICAS DE TICKETS**',
      '',
      '> **Período**',
      `> ${stats.periodLabel}`,
      '',
      '<:ticket:1544059115897360456> **VISÃO GERAL:**',
      `> **Tickets criados:** \`${stats.createdTickets}\``,
      `> **Tickets encerrados:** \`${stats.closedTickets}\``,
      `> **Atualmente abertos:** \`${stats.openTickets}\``,
      `> **Aguardando atendimento:** \`${stats.waitingTickets}\``,
      `> **Tickets assumidos:** \`${stats.claimedTickets}\``,
      '',
      '<:chart:1544059409922261002> **MÉDIAS:**',
      `> **Média diária:** \`${stats.dailyAverage} tickets\``,
      `> **Primeira resposta média:** \`${stats.averageFirstResponse}\``,
      `> **Tempo médio de atendimento:** \`${stats.averageHandlingTime}\``,
      '',
      '<:star_full:1544058937513353226> **SATISFAÇÃO:**',
      `> **Avaliação média:** \`${stats.averageRating}\``,
      '',
      '<:user:1544057765989716058> **DESTAQUE DA EQUIPE:**',
      ...teamHighlight,
    ].join('\n'))
    .setFooter({
      text: 'League • Estatísticas gerais',
      iconURL: `attachment://${footerIconName}`,
    });

  return {
    embeds: [embed],
    files: [{ attachment: footerIconPath, name: footerIconName }],
    flags: MessageFlags.Ephemeral,
  };
}

function createUserHistoryPayload(history) {
  const footerIconPath = path.resolve(process.cwd(), SUPPORT_IMAGE_PATH);
  const footerIconName = path.basename(SUPPORT_IMAGE_PATH);
  const lastTicketLines = history.lastTicket
    ? [
      `> **Ticket:** \`#${padTicketId(history.lastTicket.id)}\``,
      `> **Assunto:** \`${truncate(history.lastTicket.subject || history.lastTicket.reason, 80)}\``,
      `> **Aberto em:** ${formatTicketDate(history.lastTicket.createdAt)}`,
    ]
    : ['> `Nenhum atendimento registrado.`'];

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setDescription([
      `<:user_history:1544058057066160148> **HISTÓRICO DE @${history.displayName.toUpperCase()}**`,
      '> <:user:1544057765989716058> **Resumo dos atendimentos deste usuário**',
      '',
      '<:ticket:1544059115897360456> **TICKETS:**',
      `> **Total de tickets:** \`${history.totalTickets}\``,
      `> **Atualmente abertos:** \`${history.openTickets}\``,
      `> **Tickets encerrados:** \`${history.closedTickets}\``,
      '',
      '<:clock:1544059493506228376> **ÚLTIMO ATENDIMENTO:**',
      ...lastTicketLines,
      '',
      '<:star_full:1544058937513353226> **AVALIAÇÕES:**',
      `> **Média das avaliações realizadas:** \`${history.averageRating}\``,
      '',
      '<:reply:1544059546400464917> **CONSULTAR ATENDIMENTO**',
      `> Utilize ${history.searchCommandMention} para visualizar os detalhes de um atendimento específico.`,
    ].join('\n'))
    .setFooter({
      text: 'League • Histórico do usuário',
      iconURL: `attachment://${footerIconName}`,
    });

  if (history.avatarUrl) embed.setThumbnail(history.avatarUrl);

  return {
    embeds: [embed],
    files: [{ attachment: footerIconPath, name: footerIconName }],
    flags: MessageFlags.Ephemeral,
  };
}

function createStaffStatsPayload(stats) {
  const footerIconPath = path.resolve(process.cwd(), SUPPORT_IMAGE_PATH);
  const footerIconName = path.basename(SUPPORT_IMAGE_PATH);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setDescription([
      '<:analytics:1544059314879070268> **ESTATÍSTICAS DE ATENDIMENTO**',
      '',
      `> <:user:1544057765989716058> **Atendente:** \`${stats.displayName}\``,
      `> <:clock:1544059493506228376> **Período**: \`${stats.periodLabel}\``,
      '',
      '<:ticket:1544059115897360456> **ATENDIMENTOS:**',
      `> **Tickets atendidos:** \`${stats.ticketsHandled}\``,
      `> **Tickets neste mês:** \`${stats.ticketsThisMonth}\``,
      `> **Atualmente assumidos:** \`${stats.currentlyClaimed}\``,
      `> **Tickets transferidos:** \`${stats.transferred}\``,
      '',
      '<:star_full:1544058937513353226> **AVALIAÇÕES:**',
      `> **Avaliação média:** \`${stats.averageRating}\``,
      '',
      '<:clock:1544059493506228376> **DESEMPENHO:**',
      `> **Primeira resposta média:** \`${stats.averageFirstResponse}\``,
      `> **Tempo médio de atendimento:** \`${stats.averageHandlingTime}\``,
    ].join('\n'))
    .setThumbnail(stats.avatarUrl)
    .setFooter({
      text: 'League • Estatísticas de atendimento',
      iconURL: `attachment://${footerIconName}`,
    });

  return {
    embeds: [embed],
    files: [{ attachment: footerIconPath, name: footerIconName }],
    flags: MessageFlags.Ephemeral,
  };
}

function createConfigHomePayload(config) {
  const style = styleFromConfig(config);
  const container = new ContainerBuilder()
    .setAccentColor(style.brandColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '## ⚙️ Configuração do TicketSystem',
      'Escolha uma área para ajustar. Tudo fica salvo para este servidor.',
      '',
      `🗂️ **Categoria:** ${config.categoryId ? `<#${config.categoryId}>` : 'Não configurada'}`,
      `🎧 **Equipe:** ${config.staffRoleId ? `<@&${config.staffRoleId}>` : 'Não configurada'}`,
      `📌 **Logs:** ${config.logChannelId ? `<#${config.logChannelId}>` : 'Não configurado'}`,
      `📄 **Transcripts:** ${config.transcriptChannelId ? `<#${config.transcriptChannelId}>` : 'Não configurado'}`,
    ].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(configHomeSelect());

  return v2Payload([container]);
}

function createConfigTargetsPayload(config, notice = null) {
  const style = styleFromConfig(config);
  const lines = [
    '## 🧭 Canais e equipe',
    'Defina a estrutura usada pelo sistema de tickets.',
  ];
  if (notice) lines.push('', notice);

  const container = new ContainerBuilder()
    .setAccentColor(style.accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('ticket:config:category')
          .setPlaceholder(config.categoryId ? `Categoria atual: ${config.categoryId}` : 'Selecionar categoria dos tickets')
          .addChannelTypes(ChannelType.GuildCategory)
          .setMinValues(1)
          .setMaxValues(1),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('ticket:config:staff_role')
          .setPlaceholder(config.staffRoleId ? `Equipe atual: ${config.staffRoleId}` : 'Selecionar cargo da equipe')
          .setMinValues(1)
          .setMaxValues(1),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('ticket:config:logs')
          .setPlaceholder(config.logChannelId ? `Logs atual: ${config.logChannelId}` : 'Selecionar canal de logs')
          .addChannelTypes(ChannelType.GuildText)
          .setMinValues(1)
          .setMaxValues(1),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('ticket:config:transcripts')
          .setPlaceholder(config.transcriptChannelId ? `Transcripts atual: ${config.transcriptChannelId}` : 'Selecionar canal de transcripts')
          .addChannelTypes(ChannelType.GuildText)
          .setMinValues(1)
          .setMaxValues(1),
      ),
    )
    .addActionRowComponents(configBackButton());

  return v2Payload([container]);
}

function createConfigAppearancePayload(config, notice = null) {
  const style = styleFromConfig(config);
  const lines = [
    '## 🎨 Aparência',
    'Ajuste cores e imagem sem poluir os painéis.',
    '',
    `🌸 **Cor principal:** ${formatHexColor(style.brandColor)}`,
    `🔷 **Cor secundária:** ${formatHexColor(style.accentColor)}`,
    `🖼️ **Imagem:** ${style.panelImageUrl || 'Mascote padrão'}`,
  ];
  if (notice) lines.push('', notice);

  const container = new ContainerBuilder()
    .setAccentColor(style.brandColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket:config:appearance_modal')
          .setLabel('Editar aparência')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('ticket:config:reset_image')
          .setLabel('Usar mascote padrão')
          .setStyle(ButtonStyle.Secondary),
      ),
    )
    .addActionRowComponents(configBackButton());

  return v2Payload([container]);
}

function createConfigPanelPayload(config, notice = null) {
  const style = styleFromConfig(config);
  const lines = [
    '## 🧩 Painel de abertura',
    'Personalize o texto e o seletor do painel público.',
    '',
    `✨ **Título:** ${style.panelTitle}`,
    `☎️ **Seletor:** ${style.panelSelectLabel}`,
  ];
  if (notice) lines.push('', notice);

  const container = new ContainerBuilder()
    .setAccentColor(style.brandColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket:config:panel_text_modal')
          .setLabel('Editar textos')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('ticket:config:panel_controls_modal')
          .setLabel('Editar seletor')
          .setStyle(ButtonStyle.Secondary),
      ),
    )
    .addActionRowComponents(configBackButton());

  return v2Payload([container]);
}

function createConfigTicketPayload(config, notice = null) {
  const style = styleFromConfig(config);
  const lines = [
    '## 🎟️ Ticket',
    'Personalize a mensagem inicial e o nome dos canais criados.',
    '',
    '**Configuração atual**',
    `**Título:** ${style.ticketWelcomeTitle}`,
    '**Descrição:**',
    `> ${truncate(style.ticketWelcomeDescription, 500)}`,
    `**Prefixo dos canais:** \`${style.ticketChannelPrefix}\``,
  ];
  if (notice) lines.push('', notice);

  const container = new ContainerBuilder()
    .setAccentColor(style.accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket:config:ticket_modal')
          .setLabel('Editar ticket')
          .setStyle(ButtonStyle.Primary),
      ),
    )
    .addActionRowComponents(configBackButton());

  return v2Payload([container]);
}

function createConfigAutomationPayload(config, notice = null) {
  const style = styleFromConfig(config);
  const lines = [
    '## ⏱️ Inatividade',
    'Defina os avisos automáticos para tickets aguardando o jogador.',
    '',
    `**Aviso de inatividade:** ${config.inactivityWarningHours} hora(s)`,
    `**Aviso de fechamento:** ${config.inactivityCloseHours} hora(s)`,
    `**Auto-fechar:** ${config.autoCloseInactive ? 'Ativado' : 'Desativado'}`,
  ];
  if (notice) lines.push('', notice);

  const container = new ContainerBuilder()
    .setAccentColor(style.accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket:config:automation_modal')
          .setLabel('Editar automação')
          .setStyle(ButtonStyle.Primary),
      ),
    )
    .addActionRowComponents(configBackButton());

  return v2Payload([container]);
}

function createAppearanceConfigModal(config) {
  const style = styleFromConfig(config);
  return new ModalBuilder()
    .setCustomId('ticket:config:appearance_submit')
    .setTitle('Aparência dos embeds')
    .addComponents(
      textInputRow('brand_color', 'Cor principal (#hex)', TextInputStyle.Short, 0, 7, false, formatHexColor(style.brandColor)),
      textInputRow('accent_color', 'Cor secundária (#hex)', TextInputStyle.Short, 0, 7, false, formatHexColor(style.accentColor)),
      textInputRow('image_url', 'URL da imagem do painel', TextInputStyle.Short, 0, 500, false, style.panelImageUrl || 'https://...'),
    );
}

function createPanelTextConfigModal(config) {
  const style = styleFromConfig(config);
  return new ModalBuilder()
    .setCustomId('ticket:config:panel_text_submit')
    .setTitle('Textos do painel')
    .addComponents(
      textInputRow('panel_title', 'Título do painel', TextInputStyle.Short, 0, 100, false, style.panelTitle),
      textInputRow('panel_description', 'Descrição do painel', TextInputStyle.Paragraph, 0, 1_500, false, truncate(style.panelDescription, 100)),
      textInputRow('panel_guidelines', 'Diretrizes do painel', TextInputStyle.Paragraph, 0, 1_500, false, truncate(style.panelGuidelines, 100)),
    );
}

function createPanelControlsConfigModal(config) {
  const style = styleFromConfig(config);
  return new ModalBuilder()
    .setCustomId('ticket:config:panel_controls_submit')
    .setTitle('Seletor do painel')
    .addComponents(
      textInputRow('panel_select_label', 'Nome no seletor', TextInputStyle.Short, 0, 100, false, style.panelSelectLabel),
      textInputRow('panel_select_description', 'Descrição no seletor', TextInputStyle.Short, 0, 100, false, style.panelSelectDescription),
    );
}

function createTicketConfigModal(config) {
  const style = styleFromConfig(config);
  return new ModalBuilder()
    .setCustomId('ticket:config:ticket_submit')
    .setTitle('Mensagem do ticket')
    .addComponents(
      textInputRow('ticket_welcome_title', 'Título inicial', TextInputStyle.Short, 0, 100, false, style.ticketWelcomeTitle),
      textInputRow('ticket_welcome_description', 'Descrição inicial', TextInputStyle.Paragraph, 0, 1_000, false, truncate(style.ticketWelcomeDescription, 100)),
      textInputRow('ticket_channel_prefix', 'Prefixo dos canais', TextInputStyle.Short, 0, 12, false, style.ticketChannelPrefix),
    );
}

function createAutomationConfigModal(config) {
  return new ModalBuilder()
    .setCustomId('ticket:config:automation_submit')
    .setTitle('Inatividade')
    .addComponents(
      textInputRow('warning_hours', 'Aviso em horas', TextInputStyle.Short, 0, 3, false, String(config.inactivityWarningHours)),
      textInputRow('closing_hours', 'Fechamento em horas', TextInputStyle.Short, 0, 3, false, String(config.inactivityCloseHours)),
      textInputRow('auto_close', 'Auto-fechar? sim/não', TextInputStyle.Short, 0, 5, false, config.autoCloseInactive ? 'sim' : 'não'),
    );
}

function createTranscriptPayload(ticket, transcriptPath, config) {
  const style = styleFromConfig(config);
  const embed = new EmbedBuilder()
    .setColor(style.brandColor)
    .setTitle('🧾 Transcript de ticket')
    .setDescription([
      `**Canal:** ${ticket.channelId ? `<#${ticket.channelId}>` : 'Canal removido'}`,
      `**Usuário:** <@${ticket.userId}>`,
      `**Fechado por:** ${ticket.closedBy ? `<@${ticket.closedBy}>` : 'Sistema'}`,
    ].join('\n'))
    .setFooter({ text: 'League' })
    .setTimestamp(new Date(ticket.closedAt || Date.now()));

  return {
    embeds: [embed],
    files: [{ attachment: transcriptPath, name: path.basename(transcriptPath) }],
  };
}

function configHomeSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket:config:home')
      .setPlaceholder('Escolha uma área para configurar...')
      .addOptions(
        { label: 'Canais e equipe', value: 'targets', description: 'Categoria, cargo, logs e transcripts.', emoji: { name: '🧭' } },
        { label: 'Aparência', value: 'appearance', description: 'Cores e imagem dos embeds.', emoji: { name: '🎨' } },
        { label: 'Painel', value: 'panel', description: 'Texto e seletor do painel público.', emoji: { name: '🧩' } },
        { label: 'Ticket', value: 'ticket', description: 'Mensagem inicial e prefixo do canal.', emoji: { name: '🎟️' } },
        { label: 'Inatividade', value: 'automation', description: 'Avisos e fechamento automático.', emoji: { name: '⏱️' } },
        { label: 'Resumo atual', value: 'overview', description: 'Ver tudo que está configurado.', emoji: { name: '📋' } },
      ),
  );
}

function configBackButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:config:back')
      .setLabel('Voltar')
      .setStyle(ButtonStyle.Secondary),
  );
}

function formatHexColor(color) {
  return `#${Number(color).toString(16).padStart(6, '0').toUpperCase()}`;
}

function textInputRow(customId, label, style, minLength, maxLength, required, placeholder) {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(maxLength);

  if (minLength > 0) input.setMinLength(minLength);
  if (placeholder) input.setPlaceholder(placeholder);
  return new ActionRowBuilder().addComponents(input);
}

function addPeriodChoices(option) {
  return option
    .setName('periodo')
    .setDescription('Período das estatísticas.')
    .setRequired(false)
    .addChoices(...Object.entries(PERIODS).map(([value, name]) => ({ name, value })));
}

function addRankingChoices(option) {
  return option
    .setName('tipo')
    .setDescription('Tipo de ranking.')
    .setRequired(false)
    .addChoices(...Object.entries(RANKING_TYPES).map(([value, name]) => ({ name, value })));
}

function requireTicketAdmin(command) {
  return command.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
}

function ticketStatusLabel(status) {
  const labels = {
    OPEN: 'Aguardando atendimento',
    CLAIMED: 'Em atendimento',
    WAITING_USER: 'Aguardando resposta do jogador',
    WAITING_STAFF: 'Aguardando equipe',
    CLOSED: 'Encerrado',
  };
  return labels[status] || labels.OPEN;
}

function ticketStatusLine(status) {
  const icons = {
    OPEN: '🟢',
    CLAIMED: '🟢',
    WAITING_USER: '🟡',
    WAITING_STAFF: '🟠',
    CLOSED: '🔴',
  };
  return `${icons[status] || icons.OPEN} **Status atual:** ${ticketStatusLabel(status)}`;
}

function ticketLookupStatus(ticket) {
  if (ticket.status === 'CLOSED' && /cancelad[oa]/i.test(ticket.closeReason || '')) {
    return { label: 'Cancelado', color: 0xed4245 };
  }

  if (ticket.status === 'CLOSED' || ticket.status === 'ARCHIVED') {
    return { label: 'Encerrado', color: 0x57f287 };
  }

  if (ticket.status === 'OPEN' || ticket.status === 'WAITING_STAFF') {
    return { label: 'Aguardando atendimento', color: 0xf0b232 };
  }

  return { label: 'Em atendimento', color: 0x5865f2 };
}

function formatTicketDate(value) {
  if (!value) return '`Não registrado`';
  return `${formatTimestamp(value, 'f')} (${formatTimestamp(value, 'R')})`;
}

function ticketDuration(ticket) {
  if (!ticket.closedAt) return 'Em andamento';
  return formatDuration(Math.floor((ticket.closedAt - ticket.createdAt) / 1000));
}

module.exports = {
  addPeriodChoices,
  addRankingChoices,
  createClaimNoticePayload,
  createAppearanceConfigModal,
  createAutomationConfigModal,
  createConfigAppearancePayload,
  createConfigAutomationPayload,
  createConfigHomePayload,
  createConfigPanelPayload,
  createConfigTargetsPayload,
  createConfigTicketPayload,
  createCloseModal,
  createCloseRequestPayload,
  createClosedPayload,
  createGeneralStatsPayload,
  createManagePayload,
  createOpenTicketModal,
  createPanelPayload,
  createPanelControlsConfigModal,
  createPanelTextConfigModal,
  createRenameModal,
  createReviewModal,
  createStatsPayload,
  createStaffStatsPayload,
  createStatusMenu,
  createTicketMainPayload,
  createTicketLookupPayload,
  createTicketSummaryPayload,
  createTicketConfigModal,
  createTicketKeptOpenPayload,
  createTranscriptPayload,
  createUserHistoryPayload,
  createUserSelectPayload,
  requireTicketAdmin,
  ChannelType,
};
