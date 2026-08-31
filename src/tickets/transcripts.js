const fs = require('node:fs/promises');
const path = require('node:path');
const { TICKET_STATUS } = require('./constants');
const { formatDateTime, formatDuration, padTicketId, stars } = require('./format');

async function generateTranscript(channel, ticket, events) {
  const messages = await fetchAllMessages(channel);
  const html = renderTranscript(ticket, events, messages);
  const directory = path.resolve(process.cwd(), 'output', 'transcripts');
  await fs.mkdir(directory, { recursive: true });

  const filePath = path.join(directory, `ticket-${padTicketId(ticket.id)}.html`);
  await fs.writeFile(filePath, html, 'utf8');
  return filePath;
}

async function fetchAllMessages(channel) {
  const messages = [];
  let before;

  for (;;) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || !batch.size) break;
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }

  return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function renderTranscript(ticket, events, messages) {
  const status = TICKET_STATUS[ticket.status] || TICKET_STATUS.OPEN;
  const durationSeconds = ticket.closedAt
    ? Math.floor((ticket.closedAt - ticket.createdAt) / 1000)
    : Math.floor((Date.now() - ticket.createdAt) / 1000);

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ticket #${padTicketId(ticket.id)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f1115;
      --panel: #171a21;
      --panel-2: #1f2430;
      --line: #303646;
      --text: #f5f7fb;
      --muted: #aeb6c7;
      --brand: #ef476f;
      --accent: #5865f2;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 15px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .wrap { width: min(1080px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 48px; }
    .summary, .message, .timeline {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .summary { padding: 24px; border-left: 5px solid var(--brand); }
    h1, h2 { margin: 0 0 12px; line-height: 1.15; }
    h1 { font-size: 30px; }
    h2 { font-size: 20px; margin-top: 28px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 18px; }
    .metric { background: var(--panel-2); border: 1px solid var(--line); border-radius: 6px; padding: 12px; }
    .metric span { display: block; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .timeline { padding: 16px 20px; }
    .event { display: grid; grid-template-columns: 150px 1fr; gap: 16px; border-bottom: 1px solid var(--line); padding: 10px 0; }
    .event:last-child { border-bottom: 0; }
    .message { display: grid; grid-template-columns: 48px 1fr; gap: 14px; padding: 16px; margin: 10px 0; }
    .avatar { width: 44px; height: 44px; border-radius: 50%; }
    .author { font-weight: 700; }
    .time { color: var(--muted); font-size: 12px; margin-left: 8px; }
    .content { white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 6px; }
    .attachments, .embeds { margin-top: 10px; display: grid; gap: 8px; }
    .attachment, .embed {
      display: block;
      color: var(--text);
      text-decoration: none;
      background: var(--panel-2);
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
    }
    .embed { border-left: 4px solid var(--accent); }
    .muted { color: var(--muted); }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="summary">
      <h1>Ticket #${padTicketId(ticket.id)}</h1>
      <p class="muted">${escapeHtml(ticket.subject)}</p>
      <div class="grid">
        ${metric('Usuário', `<@${ticket.userId}>`)}
        ${metric('Atendente', ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Não assumido')}
        ${metric('Status', status.friendly)}
        ${metric('Aberto em', formatDateTime(ticket.createdAt))}
        ${metric('Fechado em', formatDateTime(ticket.closedAt))}
        ${metric('Duração', formatDuration(durationSeconds))}
        ${metric('Primeira resposta', formatDuration(ticket.firstResponseSeconds))}
        ${metric('Avaliação', stars(ticket.rating))}
        ${metric('Motivo', ticket.closeReason || 'Não registrado')}
      </div>
    </section>

    <h2>Timeline</h2>
    <section class="timeline">
      ${events.map(renderEvent).join('\n') || '<p class="muted">Nenhum evento registrado.</p>'}
    </section>

    <h2>Mensagens</h2>
    ${messages.map(renderMessage).join('\n') || '<p class="muted">Nenhuma mensagem registrada no canal.</p>'}
  </main>
</body>
</html>`;
}

function metric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span>${escapeHtml(value)}</div>`;
}

function renderEvent(event) {
  const actor = event.actorId ? `<@${event.actorId}>` : 'Sistema';
  const target = event.targetId ? ` → <@${event.targetId}>` : '';
  const detail = event.detail ? ` — ${event.detail}` : '';
  return `<div class="event"><time>${escapeHtml(formatDateTime(event.createdAt))}</time><div>${escapeHtml(event.type)} por ${escapeHtml(actor)}${escapeHtml(target)}${escapeHtml(detail)}</div></div>`;
}

function renderMessage(message) {
  const avatar = message.author.displayAvatarURL({ extension: 'png', size: 64 });
  const attachments = [...message.attachments.values()];
  const embeds = message.embeds || [];
  return `<article class="message">
    <img class="avatar" src="${escapeAttribute(avatar)}" alt="">
    <div>
      <div><span class="author">${escapeHtml(message.author.tag || message.author.username)}</span><span class="time">${escapeHtml(formatDateTime(message.createdTimestamp))}${message.editedTimestamp ? ' • editada' : ''}</span></div>
      <div class="content">${escapeHtml(message.content || '')}</div>
      ${attachments.length ? `<div class="attachments">${attachments.map(renderAttachment).join('\n')}</div>` : ''}
      ${embeds.length ? `<div class="embeds">${embeds.map(renderEmbed).join('\n')}</div>` : ''}
    </div>
  </article>`;
}

function renderAttachment(attachment) {
  const label = attachment.name || attachment.url;
  const image = attachment.contentType && attachment.contentType.startsWith('image/')
    ? `<br><img src="${escapeAttribute(attachment.url)}" alt="${escapeAttribute(label)}" style="max-width:420px;width:100%;border-radius:6px;margin-top:8px;">`
    : '';
  return `<a class="attachment" href="${escapeAttribute(attachment.url)}">${escapeHtml(label)}${image}</a>`;
}

function renderEmbed(embed) {
  const title = embed.title || 'Embed';
  const description = embed.description || '';
  return `<div class="embed"><strong>${escapeHtml(title)}</strong>${description ? `<div>${escapeHtml(description)}</div>` : ''}</div>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

module.exports = {
  generateTranscript,
};
