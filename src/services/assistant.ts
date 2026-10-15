// Asistente del chat de la web (función de Vercel api/chat).

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** book: botón de reservar · message_sent: ya se dejó el mensaje · handoff: ofrecer dejar mensaje a la barbería */
export type AssistantAction = { type: 'book' } | { type: 'message_sent' } | { type: 'handoff' };

export interface AssistantReply {
  reply: string;
  actions: AssistantAction[];
}

export class AssistantError extends Error {
  /** true si el asistente no está encendido (sin llave) o no responde: el chat pasa a dejar mensaje */
  constructor(public unavailable: boolean, message: string) {
    super(message);
    this.name = 'AssistantError';
  }
}

export async function askAssistant(messages: ChatTurn[]): Promise<AssistantReply> {
  let res: Response;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
  } catch {
    throw new AssistantError(true, 'Sin conexión');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 429: demasiados mensajes seguidos (el asistente sigue disponible); lo demás: no disponible
    throw new AssistantError(res.status !== 429, data.error ?? 'El asistente no pudo responder.');
  }
  return { reply: String(data.reply ?? ''), actions: Array.isArray(data.actions) ? data.actions : [] };
}
