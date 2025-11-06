export type EventBase = {
  from: 'log-list' | 'todo-list';
  to: 'todo' | 'log';
  originId: string;
  createdId?: string;
  ok?: boolean;
  error?: string;
};

function emit(eventName: string, payload: any) {
  // TODO: If you have ActivityLog/analytics, use it here. Otherwise, keep console.log for Phase B.
  // e.g., ActivityLog.emit(eventName, payload)
  // Fallback:
  // eslint-disable-next-line no-console
  console.log('[telemetry]', eventName, payload);
}

export function logConversionStart(p: EventBase) {
  emit('conversion:start', p);
}

export function logConversionSuccess(p: EventBase & { createdId: string }) {
  emit('conversion:success', { ...p, ok: true });
}

export function logConversionError(p: EventBase & { error: string }) {
  emit('conversion:error', { ...p, ok: false });
}
