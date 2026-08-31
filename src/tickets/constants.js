const SUPPORT_IMAGE_PATH = 'assets/ticket-emblem.png';

const DEFAULT_TICKET_STYLE = {
  brandColor: 0xef476f,
  accentColor: 0x5865f2,
  panelTitle: '## <:obsidian:1543799388592414801> CENTRAL DE ATENDIMENTO — LEAGUE',
  panelDescription: '> Olá! Você está na **Central de Atendimento do LeagueMC.**\n> Nossa equipe está à disposição para esclarecer dúvidas e auxiliar com problemas relacionados à nossa rede.',
  panelGuidelines: '**:alarm_clock: Horários de atendimento:**\n- **Segunda a sexta:** 09:00 às 22:00;\n- **Sábados e domingos:** 11:00 às 20:00 Horário de Brasília (BRT).\n\n**:ticket: Inicie seu atendimento**:\nSelecione no menu abaixo a **categoria que melhor corresponde à sua solicitação**;\nUm canal privado será criado para que você possa conversar diretamente com nossa equipe.\n\n> **Evite abrir múltiplos tickets para o mesmo assunto.** Aguarde o retorno de um membro da equipe após iniciar o atendimento.\n\n-# **:small_red_triangle_down: Selecione uma categoria abaixo para continuar.**',
  panelButtonLabel: 'Suporte',
  panelSelectLabel: 'Suporte',
  panelSelectDescription: 'Abrir um atendimento privado com a equipe.',
  panelImageUrl: null,
  ticketWelcomeTitle: 'Você está seguro!',
  ticketWelcomeDescription: 'A partir de agora, você está em contato direto com nossa equipe através de um canal privado.',
  ticketChannelPrefix: '❓・',
};

const TICKET_STATUS = {
  OPEN: {
    label: 'Aberto',
    friendly: '🟢 Em atendimento',
    color: 0x35d07f,
  },
  CLAIMED: {
    label: 'Assumido',
    friendly: '🟢 Em atendimento',
    color: 0x35d07f,
  },
  WAITING_USER: {
    label: 'Aguardando usuário',
    friendly: '🟡 Aguardando usuário',
    color: 0xffd166,
  },
  WAITING_STAFF: {
    label: 'Aguardando equipe',
    friendly: '🟠 Aguardando equipe',
    color: 0xff9f1c,
  },
  CLOSED: {
    label: 'Encerrado',
    friendly: '🔴 Encerrado',
    color: 0xef476f,
  },
  ARCHIVED: {
    label: 'Arquivado',
    friendly: '⚫ Arquivado',
    color: 0x6c757d,
  },
};

const PRIORITIES = {
  LOW: {
    label: 'Baixa',
    friendly: '🟢 Baixa',
    color: 0x35d07f,
  },
  NORMAL: {
    label: 'Normal',
    friendly: '🔵 Normal',
    color: 0x3a86ff,
  },
  HIGH: {
    label: 'Alta',
    friendly: '🟠 Alta',
    color: 0xff9f1c,
  },
  URGENT: {
    label: 'Urgente',
    friendly: '🔴 Urgente',
    color: 0xef476f,
  },
};

const PERIODS = {
  today: 'Hoje',
  seven_days: 'Últimos 7 dias',
  thirty_days: 'Últimos 30 dias',
  month: 'Este mês',
  all: 'Todo período',
};

const RANKING_TYPES = {
  tickets: 'Quantidade de atendimentos',
  rating: 'Melhor avaliação média',
  first_response: 'Melhor primeira resposta média',
};

const EVENT_TYPES = {
  CREATED: 'Ticket criado',
  CLAIMED: 'Ticket assumido',
  RELEASED: 'Ticket liberado',
  TRANSFERRED: 'Ticket transferido',
  USER_ADDED: 'Usuário adicionado',
  USER_REMOVED: 'Usuário removido',
  RENAMED: 'Ticket renomeado',
  PRIORITY_CHANGED: 'Prioridade alterada',
  STATUS_CHANGED: 'Status alterado',
  FIRST_RESPONSE: 'Primeira resposta registrada',
  USER_REQUESTED: 'Resposta do usuário solicitada',
  CLOSE_REQUESTED: 'Fechamento solicitado',
  CLOSED: 'Ticket encerrado',
  REOPENED: 'Ticket reaberto',
  ARCHIVED: 'Ticket arquivado',
  TRANSCRIPT_CREATED: 'Transcript criado',
  REVIEWED: 'Avaliação recebida',
  INACTIVITY_WARNING: 'Aviso de inatividade',
};

module.exports = {
  DEFAULT_TICKET_STYLE,
  EVENT_TYPES,
  PERIODS,
  PRIORITIES,
  RANKING_TYPES,
  SUPPORT_IMAGE_PATH,
  TICKET_STATUS,
};
