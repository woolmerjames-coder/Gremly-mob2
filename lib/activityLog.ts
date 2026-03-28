import { getDateService } from './date/DateService';

export type ActivityEvent = {
  id: string;
  timestamp: number;
  source: 'catchall';
  destination: 'habit' | 'todo' | 'note:journal' | 'note:list' | 'note:catchall' | 'space';
  itemId: string;
  itemTitle?: string;
};

const _events: ActivityEvent[] = [];

export const ActivityLog = {
  add(event: ActivityEvent) {
    _events.unshift(event);
  },
  recordCatchAllMove(details: {
    itemId: string;
    destination: ActivityEvent['destination'];
    itemTitle?: string;
  }) {
    const timestamp = getDateService().now().getTime();
    _events.unshift({
      id: `${details.itemId}:${timestamp}`,
      timestamp,
      source: 'catchall',
      destination: details.destination,
      itemId: details.itemId,
      itemTitle: details.itemTitle,
    });
  },
  list(): ActivityEvent[] {
    return _events;
  },
  clear() {
    _events.length = 0;
  },
};
