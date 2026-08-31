const { PERIODS } = require('./constants');

function padTicketId(id) {
  return String(id).padStart(4, '0');
}

function sanitizeChannelName(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 70) || 'usuario';
}

function formatTimestamp(ms, style = 'f') {
  if (!ms) return 'Não registrado';
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function formatDateTime(ms) {
  if (!ms) return 'Não registrado';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(ms));
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) {
    return 'Não registrado';
  }

  const total = Math.max(0, Math.floor(Number(seconds)));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const secs = total % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (secs || !parts.length) parts.push(`${secs}s`);
  return parts.join(' ');
}

function truncate(value, length = 900) {
  const text = String(value || '').trim();
  if (text.length <= length) return text || 'Não informado';
  return `${text.slice(0, length - 3)}...`;
}

function periodToRange(period) {
  const now = new Date();
  const end = now.getTime();
  const value = period || 'all';

  if (value === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start: start.getTime(), end, label: PERIODS.today };
  }

  if (value === 'seven_days') {
    return { start: end - (7 * 86_400_000), end, label: PERIODS.seven_days };
  }

  if (value === 'thirty_days') {
    return { start: end - (30 * 86_400_000), end, label: PERIODS.thirty_days };
  }

  if (value === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: start.getTime(), end, label: PERIODS.month };
  }

  return { start: 0, end, label: PERIODS.all };
}

function percent(value, total) {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function stars(rating) {
  const value = Number(rating);
  if (!value) return 'Sem avaliação';
  return '⭐'.repeat(Math.max(1, Math.min(5, value)));
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

module.exports = {
  formatDateTime,
  formatDuration,
  formatTimestamp,
  padTicketId,
  percent,
  periodToRange,
  safeJsonParse,
  sanitizeChannelName,
  stars,
  truncate,
};
