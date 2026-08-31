const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { DEFAULT_TICKET_STYLE } = require('./constants');

const DEFAULT_CONFIG = {
  categoryId: null,
  staffRoleId: null,
  logChannelId: null,
  transcriptChannelId: null,
  ...DEFAULT_TICKET_STYLE,
  slaFirstResponseMinutes: 10,
  inactivityWarningHours: 12,
  inactivityCloseHours: 24,
  autoCloseInactive: 0,
};

class TicketDatabase {
  constructor(filePath = path.join(process.cwd(), 'data', 'tickets.db')) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS guild_configs (
        guild_id TEXT PRIMARY KEY,
        category_id TEXT,
        staff_role_id TEXT,
        log_channel_id TEXT,
        transcript_channel_id TEXT,
        brand_color INTEGER,
        accent_color INTEGER,
        panel_title TEXT,
        panel_description TEXT,
        panel_guidelines TEXT,
        panel_button_label TEXT,
        panel_select_label TEXT,
        panel_select_description TEXT,
        panel_image_url TEXT,
        ticket_welcome_title TEXT,
        ticket_welcome_description TEXT,
        ticket_channel_prefix TEXT,
        sla_first_response_minutes INTEGER NOT NULL DEFAULT 10,
        inactivity_warning_hours INTEGER NOT NULL DEFAULT 12,
        inactivity_close_hours INTEGER NOT NULL DEFAULT 24,
        auto_close_inactive INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        channel_id TEXT,
        main_message_id TEXT,
        user_id TEXT NOT NULL,
        claimed_by TEXT,
        closed_by TEXT,
        archived_by TEXT,
        mc_nick TEXT NOT NULL,
        subject TEXT NOT NULL,
        reason TEXT NOT NULL,
        description TEXT NOT NULL,
        additional TEXT,
        status TEXT NOT NULL DEFAULT 'OPEN',
        priority TEXT NOT NULL DEFAULT 'NORMAL',
        created_at INTEGER NOT NULL,
        claimed_at INTEGER,
        first_response_at INTEGER,
        first_response_seconds INTEGER,
        closed_at INTEGER,
        archived_at INTEGER,
        close_reason TEXT,
        message_count INTEGER NOT NULL DEFAULT 0,
        reopen_count INTEGER NOT NULL DEFAULT 0,
        sla_status TEXT NOT NULL DEFAULT 'PENDING',
        transcript_path TEXT,
        rating INTEGER,
        rating_comment TEXT,
        rating_at INTEGER,
        inactivity_warned_at INTEGER,
        inactive_close_warned_at INTEGER,
        last_user_message_at INTEGER,
        last_staff_message_at INTEGER,
        participants_json TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS ticket_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        actor_id TEXT,
        target_id TEXT,
        detail TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_tickets_guild_created ON tickets(guild_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets(channel_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(guild_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_events_ticket ON ticket_events(ticket_id, created_at);
    `);

    this.ensureColumn('guild_configs', 'transcript_channel_id', 'TEXT');
    this.ensureColumn('guild_configs', 'brand_color', 'INTEGER');
    this.ensureColumn('guild_configs', 'accent_color', 'INTEGER');
    this.ensureColumn('guild_configs', 'panel_title', 'TEXT');
    this.ensureColumn('guild_configs', 'panel_description', 'TEXT');
    this.ensureColumn('guild_configs', 'panel_guidelines', 'TEXT');
    this.ensureColumn('guild_configs', 'panel_button_label', 'TEXT');
    this.ensureColumn('guild_configs', 'panel_select_label', 'TEXT');
    this.ensureColumn('guild_configs', 'panel_select_description', 'TEXT');
    this.ensureColumn('guild_configs', 'panel_image_url', 'TEXT');
    this.ensureColumn('guild_configs', 'ticket_welcome_title', 'TEXT');
    this.ensureColumn('guild_configs', 'ticket_welcome_description', 'TEXT');
    this.ensureColumn('guild_configs', 'ticket_channel_prefix', 'TEXT');
    this.refreshOldPanelDefaults();
  }

  ensureColumn(table, column, definition) {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all();
    if (columns.some((item) => item.name === column)) return;
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  refreshOldPanelDefaults() {
    const oldTitles = [
      'Olá, jogador! 🧠',
      '<:obsidian:1543799388592414801> CENTRAL DE ATENDIMENTO — LEAGUE',
      '<:obsidian:1543799388592414801> **CENTRAL DE ATENDIMENTO — LEAGUE**',
      '** **<:obsidian:1543799388592414801> **CENTRAL DE ATENDIMENTO — LEAGUE**',
      '**<:obsidian:1543799388592414801> **CENTRAL DE ATENDIMENTO — LEAGUE**',
      '**<:obsidian:1543799388592414801> CENTRAL DE ATENDIMENTO — LEAGUE**',
    ];
    const oldDescriptions = [
      'Em caso de dúvidas ou problemas, nossa equipe está à disposição para ajudar.\n\nInicie um atendimento e entre em contato direto com nossa equipe por meio de um canal privado e seguro. Desta maneira, poderemos resolver seu problema da melhor e mais eficaz maneira.',
      '> Olá! Você está na **Central de Atendimento do LeagueMC.** Nossa equipe está à disposição para esclarecer dúvidas e auxiliar com problemas relacionados à nossa rede.\n\n### ⏰ Horários de atendimento\n\n**Segunda a sexta:** 09:00 às 22:00\n**Sábados e domingos:** 11:00 às 20:00\n-# Horário de Brasília (BRT)',
      '> Olá! Você está na **Central de Atendimento do LeagueMC. **Nossa equipe está à disposição para esclarecer dúvidas e auxiliar com problemas relacionados à nossa rede.\n\n### ⏰ Horários de atendimento\n\n**Segunda a sexta:** 09:00 às 22:00\n**Sábados e domingos:** 11:00 às 20:00\n-# Horário de Brasília (BRT)',
      '> Olá! Você está na **Central de Atendimento do LeagueMC. **Nossa equipe está à disposição para esclarecer dúvidas e auxiliar com problemas relacionados à nossa rede.\n\n⏰ **Horários de atendimento**\n\n**Segunda a sexta:** 09:00 às 22:00\n**Sábados e domingos:** 11:00 às 20:00\n-# Horário de Brasília (BRT)',
      '> Olá! Você está na **Central de Atendimento do LeagueMC.**\n>\n> Nossa equipe está à disposição para esclarecer dúvidas e auxiliar com problemas relacionados à nossa rede.',
      '> Olá! Você está na **Central de Atendimento do LeagueMC. **\n>\n> Nossa equipe está à disposição para esclarecer dúvidas e auxiliar com problemas relacionados à nossa rede.',
    ];
    const oldGuidelines = [
      '• Faremos o possível para responder suas mensagens o mais rápido possível. Em períodos de alta demanda, pedimos sua compreensão.\n• Se não recebermos retorno dentro do prazo configurado, o atendimento poderá ser encerrado por inatividade.\n• Mantenha o respeito durante o atendimento para que a equipe possa ajudar da melhor forma.',
      '### 🎫 Inicie seu atendimento\n\nSelecione no menu abaixo a **categoria que melhor corresponde à sua solicitação**. Um canal privado será criado para que você possa conversar diretamente com nossa equipe.\n\n> **Evite abrir múltiplos tickets para o mesmo assunto.**\n> Aguarde o retorno de um membro da equipe após iniciar o atendimento.\n>\n>\n\n### 🔻 Selecione uma categoria abaixo para continuar.',
      '### 🎫 Inicie seu atendimento\n\nSelecione no menu abaixo a **categoria que melhor corresponde à sua solicitação**. Um canal privado será criado para que você possa conversar diretamente com nossa equipe.\n\n> **Evite abrir múltiplos tickets para o mesmo assunto.**\n> Aguarde o retorno de um membro da equipe após iniciar o atendimento.\n>\n>\n\n### -#🔻 Selecione uma categoria abaixo para continuar.',
      '🎫 **Inicie seu atendimento**\n\nSelecione no menu abaixo a **categoria que melhor corresponde à sua solicitação**. Um canal privado será criado para que você possa conversar diretamente com nossa equipe.\n\n> **Evite abrir múltiplos tickets para o mesmo assunto.**\n> Aguarde o retorno de um membro da equipe após iniciar o atendimento.\n\n🔻 **Selecione uma categoria abaixo para continuar.**',
      '**:alarm_clock: Horários de atendimento:**\n\n- **Segunda a sexta:** 09:00 às 22:00\n- **Sábados e domingos:** 11:00 às 20:00 Horário de Brasília (BRT)\n\n**:ticket: Inicie seu atendimento**:\n\nSelecione no menu abaixo a **categoria que melhor corresponde à sua solicitação**.\n\nUm canal privado será criado para que você possa conversar diretamente com nossa equipe.\n\n> **Evite abrir múltiplos tickets para o mesmo assunto.** Aguarde o retorno de um membro da equipe após iniciar o atendimento.\n>\n>\n\n**:small_red_triangle_down: Selecione uma categoria abaixo para continuar.**',
      '**:alarm_clock: Horários de atendimento:**\n\n- **Segunda a sexta:** 09:00 às 22:00\n- **Sábados e domingos:** 11:00 às 20:00 Horário de Brasília (BRT)\n\n**:ticket: Inicie seu atendimento**:\n\nSelecione no menu abaixo a **categoria que melhor corresponde à sua solicitação**.\n\nUm canal privado será criado para que você possa conversar diretamente com nossa equipe.\n\n> **Evite abrir múltiplos tickets para o mesmo assunto.** Aguarde o retorno de um membro da equipe após iniciar o atendimento.\n\n**-# :small_red_triangle_down: Selecione uma categoria abaixo para continuar.**',
      '**:alarm_clock: Horários de atendimento:**\n\n- **Segunda a sexta:** 09:00 às 22:00;\n- **Sábados e domingos:** 11:00 às 20:00 Horário de Brasília (BRT).\n\n**:ticket: Inicie seu atendimento**:\nSelecione no menu abaixo a **categoria que melhor corresponde à sua solicitação**;\nUm canal privado será criado para que você possa conversar diretamente com nossa equipe.\n\n> **Evite abrir múltiplos tickets para o mesmo assunto.** Aguarde o retorno de um membro da equipe após iniciar o atendimento.\n\n**-# :small_red_triangle_down: Selecione uma categoria abaixo para continuar.**',
      '**:alarm_clock: Horários de atendimento:**\n\n- **Segunda a sexta:** 09:00 às 22:00;\n- **Sábados e domingos:** 11:00 às 20:00 Horário de Brasília (BRT).\n\n**:ticket: Inicie seu atendimento**:\nSelecione no menu abaixo a **categoria que melhor corresponde à sua solicitação**;\nUm canal privado será criado para que você possa conversar diretamente com nossa equipe.\n\n> **Evite abrir múltiplos tickets para o mesmo assunto.** Aguarde o retorno de um membro da equipe após iniciar o atendimento.\n\n-# **:small_red_triangle_down: Selecione uma categoria abaixo para continuar.**',
      '**:alarm_clock: Horários de atendimento:**\n\n- **Segunda a sexta:** 09:00 às 22:00;\n- **Sábados e domingos:** 11:00 às 20:00 Horário de Brasília (BRT).\n\n**:ticket: Inicie seu atendimento**:\nSelecione no menu abaixo a **categoria que melhor corresponde à sua solicitação**;\nUm canal privado será criado para que você possa conversar diretamente com nossa equipe.\n\n> **Evite abrir múltiplos tickets para o mesmo assunto.** Aguarde o retorno de um membro da equipe após iniciar o atendimento.\n\n-# **:small_red_triangle_down: Selecione uma categoria abaixo para continuar.**',
      '**:alarm_clock: Horários de atendimento:**\n- **Segunda a sexta:** 09:00 às 22:00;\n- **Sábados e domingos:** 11:00 às 20:00 Horário de Brasília (BRT).\n**:ticket: Inicie seu atendimento**:\nSelecione no menu abaixo a **categoria que melhor corresponde à sua solicitação**;\nUm canal privado será criado para que você possa conversar diretamente com nossa equipe.\n> **Evite abrir múltiplos tickets para o mesmo assunto.** Aguarde o retorno de um membro da equipe após iniciar o atendimento.\n-# **:small_red_triangle_down: Selecione uma categoria abaixo para continuar.**',
      '**:alarm_clock: Horários de atendimento:**\n\\- **Segunda a sexta:** 09:00 às 22:00;\n\\- **Sábados e domingos:** 11:00 às 20:00 Horário de Brasília (BRT).\n**:ticket: Inicie seu atendimento**:\nSelecione no menu abaixo a **categoria que melhor corresponde à sua solicitação**;\nUm canal privado será criado para que você possa conversar diretamente com nossa equipe.\n> **Evite abrir múltiplos tickets para o mesmo assunto.** Aguarde o retorno de um membro da equipe após iniciar o atendimento.\n-# **:small_red_triangle_down: Selecione uma categoria abaixo para continuar.**',
    ];

    for (const value of oldTitles) {
      this.db.prepare('UPDATE guild_configs SET panel_title = NULL WHERE panel_title = ?').run(value);
    }
    for (const value of oldDescriptions) {
      this.db.prepare('UPDATE guild_configs SET panel_description = NULL WHERE panel_description = ?').run(value);
    }
    for (const value of oldGuidelines) {
      this.db.prepare('UPDATE guild_configs SET panel_guidelines = NULL WHERE panel_guidelines = ?').run(value);
    }
  }

  getConfig(guildId) {
    const row = this.db.prepare('SELECT * FROM guild_configs WHERE guild_id = ?').get(guildId);
    if (!row) return { ...DEFAULT_CONFIG, guildId };
    return {
      guildId,
      categoryId: row.category_id,
      staffRoleId: row.staff_role_id,
      logChannelId: row.log_channel_id,
      transcriptChannelId: row.transcript_channel_id,
      brandColor: row.brand_color ?? DEFAULT_CONFIG.brandColor,
      accentColor: row.accent_color ?? DEFAULT_CONFIG.accentColor,
      panelTitle: row.panel_title ?? DEFAULT_CONFIG.panelTitle,
      panelDescription: row.panel_description ?? DEFAULT_CONFIG.panelDescription,
      panelGuidelines: row.panel_guidelines ?? DEFAULT_CONFIG.panelGuidelines,
      panelButtonLabel: row.panel_button_label ?? DEFAULT_CONFIG.panelButtonLabel,
      panelSelectLabel: row.panel_select_label ?? DEFAULT_CONFIG.panelSelectLabel,
      panelSelectDescription: row.panel_select_description ?? DEFAULT_CONFIG.panelSelectDescription,
      panelImageUrl: row.panel_image_url ?? DEFAULT_CONFIG.panelImageUrl,
      ticketWelcomeTitle: row.ticket_welcome_title ?? DEFAULT_CONFIG.ticketWelcomeTitle,
      ticketWelcomeDescription: row.ticket_welcome_description ?? DEFAULT_CONFIG.ticketWelcomeDescription,
      ticketChannelPrefix: row.ticket_channel_prefix ?? DEFAULT_CONFIG.ticketChannelPrefix,
      slaFirstResponseMinutes: row.sla_first_response_minutes,
      inactivityWarningHours: row.inactivity_warning_hours,
      inactivityCloseHours: row.inactivity_close_hours,
      autoCloseInactive: row.auto_close_inactive,
    };
  }

  upsertConfig(guildId, changes) {
    const current = this.getConfig(guildId);
    const next = { ...current, ...changes };
    this.db.prepare(`
      INSERT INTO guild_configs (
        guild_id, category_id, staff_role_id, log_channel_id, transcript_channel_id,
        brand_color, accent_color, panel_title, panel_description, panel_guidelines,
        panel_button_label, panel_select_label, panel_select_description, panel_image_url,
        ticket_welcome_title, ticket_welcome_description, ticket_channel_prefix,
        sla_first_response_minutes, inactivity_warning_hours,
        inactivity_close_hours, auto_close_inactive
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        category_id = excluded.category_id,
        staff_role_id = excluded.staff_role_id,
        log_channel_id = excluded.log_channel_id,
        transcript_channel_id = excluded.transcript_channel_id,
        brand_color = excluded.brand_color,
        accent_color = excluded.accent_color,
        panel_title = excluded.panel_title,
        panel_description = excluded.panel_description,
        panel_guidelines = excluded.panel_guidelines,
        panel_button_label = excluded.panel_button_label,
        panel_select_label = excluded.panel_select_label,
        panel_select_description = excluded.panel_select_description,
        panel_image_url = excluded.panel_image_url,
        ticket_welcome_title = excluded.ticket_welcome_title,
        ticket_welcome_description = excluded.ticket_welcome_description,
        ticket_channel_prefix = excluded.ticket_channel_prefix,
        sla_first_response_minutes = excluded.sla_first_response_minutes,
        inactivity_warning_hours = excluded.inactivity_warning_hours,
        inactivity_close_hours = excluded.inactivity_close_hours,
        auto_close_inactive = excluded.auto_close_inactive
    `).run(
      guildId,
      next.categoryId,
      next.staffRoleId,
      next.logChannelId,
      next.transcriptChannelId,
      next.brandColor,
      next.accentColor,
      next.panelTitle,
      next.panelDescription,
      next.panelGuidelines,
      next.panelButtonLabel,
      next.panelSelectLabel,
      next.panelSelectDescription,
      next.panelImageUrl,
      next.ticketWelcomeTitle,
      next.ticketWelcomeDescription,
      next.ticketChannelPrefix,
      next.slaFirstResponseMinutes,
      next.inactivityWarningHours,
      next.inactivityCloseHours,
      next.autoCloseInactive ? 1 : 0,
    );
    return this.getConfig(guildId);
  }

  createTicket(data) {
    const result = this.db.prepare(`
      INSERT INTO tickets (
        guild_id, user_id, mc_nick, subject, reason, description, additional,
        created_at, last_user_message_at, participants_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.guildId,
      data.userId,
      data.mcNick,
      data.subject,
      data.reason,
      data.description,
      data.additional,
      data.createdAt,
      data.createdAt,
      JSON.stringify([data.userId]),
    );
    return this.getTicket(result.lastInsertRowid);
  }

  updateTicket(id, changes) {
    const columns = {
      channelId: 'channel_id',
      mainMessageId: 'main_message_id',
      claimedBy: 'claimed_by',
      closedBy: 'closed_by',
      archivedBy: 'archived_by',
      status: 'status',
      priority: 'priority',
      claimedAt: 'claimed_at',
      firstResponseAt: 'first_response_at',
      firstResponseSeconds: 'first_response_seconds',
      closedAt: 'closed_at',
      archivedAt: 'archived_at',
      closeReason: 'close_reason',
      messageCount: 'message_count',
      reopenCount: 'reopen_count',
      slaStatus: 'sla_status',
      transcriptPath: 'transcript_path',
      rating: 'rating',
      ratingComment: 'rating_comment',
      ratingAt: 'rating_at',
      inactivityWarnedAt: 'inactivity_warned_at',
      inactiveCloseWarnedAt: 'inactive_close_warned_at',
      lastUserMessageAt: 'last_user_message_at',
      lastStaffMessageAt: 'last_staff_message_at',
      participantsJson: 'participants_json',
      subject: 'subject',
    };
    const entries = Object.entries(changes).filter(([key]) => columns[key]);
    if (!entries.length) return this.getTicket(id);

    const sets = entries.map(([key]) => `${columns[key]} = ?`).join(', ');
    const values = entries.map(([, value]) => value);
    values.push(id);
    this.db.prepare(`UPDATE tickets SET ${sets} WHERE id = ?`).run(...values);
    return this.getTicket(id);
  }

  getTicket(id) {
    const row = this.db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
    return row ? mapTicket(row) : null;
  }

  getTicketByChannel(channelId) {
    const row = this.db.prepare('SELECT * FROM tickets WHERE channel_id = ? ORDER BY id DESC LIMIT 1').get(channelId);
    return row ? mapTicket(row) : null;
  }

  findTicket(guildId, id) {
    const row = this.db.prepare('SELECT * FROM tickets WHERE guild_id = ? AND id = ?').get(guildId, id);
    return row ? mapTicket(row) : null;
  }

  addEvent(ticketId, type, actorId = null, targetId = null, detail = null, createdAt = Date.now()) {
    this.db.prepare(`
      INSERT INTO ticket_events (ticket_id, type, actor_id, target_id, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(ticketId, type, actorId, targetId, detail, createdAt);
  }

  getEvents(ticketId) {
    return this.db.prepare('SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY created_at ASC, id ASC')
      .all(ticketId)
      .map(mapEvent);
  }

  getOpenTickets() {
    return this.db.prepare(`
      SELECT * FROM tickets
      WHERE status IN ('OPEN', 'CLAIMED', 'WAITING_USER', 'WAITING_STAFF')
    `).all().map(mapTicket);
  }

  getClosedTicketsPendingDeletion(cutoff) {
    return this.db.prepare(`
      SELECT * FROM tickets
      WHERE status = 'CLOSED'
        AND channel_id IS NOT NULL
        AND rating IS NULL
        AND closed_at IS NOT NULL
        AND closed_at <= ?
    `).all(cutoff).map(mapTicket);
  }

  getTicketsByUser(guildId, userId) {
    return this.db.prepare('SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC')
      .all(guildId, userId)
      .map(mapTicket);
  }

  queryTickets(guildId, start, end) {
    return this.db.prepare('SELECT * FROM tickets WHERE guild_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC')
      .all(guildId, start, end)
      .map(mapTicket);
  }

  getAllTickets(guildId) {
    return this.db.prepare('SELECT * FROM tickets WHERE guild_id = ? ORDER BY created_at DESC')
      .all(guildId)
      .map(mapTicket);
  }
}

function mapTicket(row) {
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    mainMessageId: row.main_message_id,
    userId: row.user_id,
    claimedBy: row.claimed_by,
    closedBy: row.closed_by,
    archivedBy: row.archived_by,
    mcNick: row.mc_nick,
    subject: row.subject,
    reason: row.reason,
    description: row.description,
    additional: row.additional,
    status: row.status,
    priority: row.priority,
    createdAt: row.created_at,
    claimedAt: row.claimed_at,
    firstResponseAt: row.first_response_at,
    firstResponseSeconds: row.first_response_seconds,
    closedAt: row.closed_at,
    archivedAt: row.archived_at,
    closeReason: row.close_reason,
    messageCount: row.message_count,
    reopenCount: row.reopen_count,
    slaStatus: row.sla_status,
    transcriptPath: row.transcript_path,
    rating: row.rating,
    ratingComment: row.rating_comment,
    ratingAt: row.rating_at,
    inactivityWarnedAt: row.inactivity_warned_at,
    inactiveCloseWarnedAt: row.inactive_close_warned_at,
    lastUserMessageAt: row.last_user_message_at,
    lastStaffMessageAt: row.last_staff_message_at,
    participantsJson: row.participants_json,
  };
}

function mapEvent(row) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    type: row.type,
    actorId: row.actor_id,
    targetId: row.target_id,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

module.exports = {
  DEFAULT_CONFIG,
  TicketDatabase,
};
