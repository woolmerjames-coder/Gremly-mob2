/**
 * GlobalEventTimePicker - Global wrapper for EventTimePicker
 *
 * Reads from Zustand eventTimePicker state and renders the EventTimePicker.
 * Rendered inside modals (MorningBriefSheet) to appear on top of other content.
 */

import React from 'react';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { EventTimePicker } from '../../app/components/morning-brief/components/EventTimePicker';

function getEventId(event: { provider: string; providerEventId: string }): string {
  return `${event.provider}-${event.providerEventId}`;
}

export function GlobalEventTimePicker() {
  const { isOpen, event } = useGremlyStore((s) => s.eventTimePicker);
  const closeEventTimePicker = useGremlyStore((s) => s.closeEventTimePicker);
  const eventTimeOverrides = useGremlyStore((s) => s.eventTimeOverrides);
  const setEventTimeOverride = useGremlyStore((s) => s.setEventTimeOverride);
  const clearEventTimeOverride = useGremlyStore((s) => s.clearEventTimeOverride);

  if (!event) return null;

  const eventId = getEventId(event);
  const currentOverride = eventTimeOverrides[eventId] ?? null;

  const handleSave = (id: string, startAt: string, endAt: string) => {
    setEventTimeOverride(id, startAt, endAt);
    closeEventTimePicker();
  };

  const handleReset = (id: string) => {
    clearEventTimeOverride(id);
    closeEventTimePicker();
  };

  return (
    <EventTimePicker
      visible={isOpen}
      eventId={eventId}
      eventTitle={event.title}
      originalStartAt={event.startAt}
      originalEndAt={event.endAt}
      currentOverride={currentOverride}
      onClose={closeEventTimePicker}
      onSave={handleSave}
      onReset={handleReset}
    />
  );
}
