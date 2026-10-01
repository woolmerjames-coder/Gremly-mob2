/**
 * The plan card in today's thread (Daily brief in Chat): a summary line, a
 * load bar, and a timeline of the rest of the day with meetings greyed, the
 * planned items and the free gaps. A proposal can lose items (×), gain them
 * (Add something), be locked in or put aside (Not now). A locked plan points
 * to Today. Earlier versions fold to one line.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowRight, Check, Clock, Lock, Plus, Repeat, X } from 'lucide-react-native';
import type { BriefPlanMeta } from '../../lib/brief/types';
import type { DayMeeting } from '../../lib/brief/dayCard';
import { clock, ampm } from '../../lib/brief/dayCard';
import { duration, planHeading, planSummary } from '../../lib/plan/planFlow';
import { PLAN_DAY_END } from '../../lib/plan/slotFitter';
import { BRIEF } from './briefStyles';

export type PlanCardProps = {
  meta: BriefPlanMeta;
  meetings: DayMeeting[];
  /** False while something is being saved */
  interactive?: boolean;
  onRemove?: (id: string) => void;
  onAdd?: () => void;
  onLock?: () => void;
  onDismiss?: () => void;
  onShowAgain?: () => void;
  onSeeToday?: () => void;
};

type Row =
  | { type: 'meet'; start: number; end: number; title: string }
  | { type: 'item'; start: number; end: number; id: string; title: string; reason?: string | null }
  | { type: 'gap'; start: number; end: number; last?: boolean };

/** The timeline: meetings and items in time order, with gaps of an hour or more. */
export function planRows(meta: BriefPlanMeta, meetings: DayMeeting[]): Row[] {
  const from = meta.from ?? 0;
  const rows: Row[] = [
    ...meetings
      .filter((m) => m.end > from && m.start < PLAN_DAY_END)
      .map((m) => ({ type: 'meet' as const, start: m.start, end: m.end, title: m.title })),
    ...meta.items.map((x) => ({
      type: 'item' as const,
      start: x.start,
      end: x.end,
      id: x.id,
      title: x.title,
      reason: x.reason,
    })),
  ].sort((a, b) => a.start - b.start || (a.type === 'meet' ? -1 : 1));
  const out: Row[] = [];
  let cursor = from;
  for (const r of rows) {
    if (r.start - cursor >= 60) out.push({ type: 'gap', start: cursor, end: r.start });
    out.push(r);
    cursor = Math.max(cursor, r.end);
  }
  if (PLAN_DAY_END - cursor >= 60)
    out.push({ type: 'gap', start: cursor, end: PLAN_DAY_END, last: true });
  return out;
}

export function PlanCard({
  meta,
  meetings,
  interactive = true,
  onRemove,
  onAdd,
  onLock,
  onDismiss,
  onShowAgain,
  onSeeToday,
}: PlanCardProps) {
  if (meta.status === 'replaced') {
    return (
      <View style={styles.collapsed} testID="plan-replaced">
        <Repeat size={14} color={BRIEF.faint} strokeWidth={2} />
        <Text style={styles.collapsedText}>Earlier plan, replaced by the one below</Text>
      </View>
    );
  }
  if (meta.status === 'dismissed') {
    return (
      <View style={styles.collapsed} testID="plan-dismissed">
        <Clock size={14} color={BRIEF.faint} strokeWidth={2} />
        <Text style={[styles.collapsedText, styles.flex]}>Plan not locked in</Text>
        <TouchableOpacity onPress={onShowAgain} disabled={!interactive} testID="plan-show-again">
          <Text style={styles.link}>Show it again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const locked = meta.status === 'locked';
  const from = meta.from ?? 0;
  const span = Math.max(1, PLAN_DAY_END - from);
  const meetMin = meetings.reduce(
    (a, m) => a + Math.max(0, Math.min(m.end, PLAN_DAY_END) - Math.max(m.start, from)),
    0,
  );
  const planMin = meta.items.reduce((a, x) => a + (x.end - x.start), 0);
  const busy = meetings.map((m) => ({ start: m.start, end: m.end }));

  return (
    <View style={styles.card} testID={locked ? 'plan-locked' : 'plan-proposal'}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text style={styles.title}>{planHeading(from)}</Text>
          <Text style={styles.sub}>{planSummary(meta, busy)}</Text>
        </View>
        {locked ? (
          <View style={[styles.tag, styles.tagDone]}>
            <Check size={13} color={BRIEF.white} strokeWidth={2.5} />
            <Text style={[styles.tagText, styles.tagTextDone]}>Locked in</Text>
          </View>
        ) : (
          <View style={[styles.tag, styles.tagProp]}>
            <Text style={[styles.tagText, styles.tagTextProp]}>Proposal</Text>
          </View>
        )}
      </View>

      <View style={styles.loadbar} accessibilityElementsHidden importantForAccessibility="no">
        <View style={[styles.loadMeet, { width: `${Math.min(100, (meetMin / span) * 100)}%` }]} />
        <View style={[styles.loadPlan, { width: `${Math.min(100, (planMin / span) * 100)}%` }]} />
      </View>
      <View style={styles.legend}>
        <Legend color={BRIEF.meeting} label="Meetings" />
        <Legend color={BRIEF.peri} label="Planned" />
        <Legend
          color={BRIEF.linen2}
          label={`Free, ${clock(from)}${ampm(from).toLowerCase()} to 10pm`}
        />
      </View>

      <View style={styles.timeline}>
        {planRows(meta, meetings).map((r) =>
          r.type === 'gap' ? (
            <View key={`gap-${r.start}`} style={styles.tlRow}>
              <Text style={styles.time} />
              <View style={styles.dotCol}>
                <View style={[styles.dot, styles.dotGap]} />
              </View>
              <Text style={styles.gapText}>
                {r.last ? 'Free until 10pm' : `${duration(r.end - r.start)} free`}
              </Text>
            </View>
          ) : (
            <View
              key={`${r.type}-${r.type === 'item' ? r.id : r.start}-${r.start}`}
              style={styles.tlRow}
              testID={r.type === 'item' ? `plan-item-${r.id}` : undefined}
            >
              <Text style={[styles.time, r.type === 'meet' && styles.faint]}>
                {clock(r.start)}
                <Text style={styles.ampm}> {ampm(r.start)}</Text>
              </Text>
              <View style={styles.dotCol}>
                <View style={[styles.dot, r.type === 'meet' ? styles.dotMeet : styles.dotItem]} />
              </View>
              <View style={styles.flex}>
                <Text
                  style={[styles.itemTitle, r.type === 'meet' && styles.faint]}
                  numberOfLines={2}
                >
                  {r.title}
                </Text>
                <Text style={styles.itemMeta} numberOfLines={2}>
                  {r.type === 'meet'
                    ? `Meeting, ${duration(r.end - r.start)}`
                    : `${duration(r.end - r.start)}${r.reason ? `, ${r.reason}` : ''}`}
                </Text>
              </View>
              {r.type === 'item' && !locked ? (
                <Pressable
                  onPress={() => onRemove?.(r.id)}
                  disabled={!interactive}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${r.title}`}
                  testID={`plan-remove-${r.id}`}
                  style={styles.remove}
                >
                  <X size={16} color={BRIEF.muted} strokeWidth={2} />
                </Pressable>
              ) : null}
            </View>
          ),
        )}
      </View>

      {locked ? (
        <TouchableOpacity style={styles.seeToday} onPress={onSeeToday} testID="plan-see-today">
          <Text style={styles.link}>See it on Today</Text>
          <ArrowRight size={15} color={BRIEF.moss} strokeWidth={2} />
        </TouchableOpacity>
      ) : (
        <>
          <TouchableOpacity
            style={styles.addRow}
            onPress={onAdd}
            disabled={!interactive}
            testID="plan-add"
          >
            <Plus size={16} color={BRIEF.moss} strokeWidth={2} />
            <Text style={styles.addText}>Add something</Text>
          </TouchableOpacity>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, !meta.items.length && styles.btnOff]}
              onPress={onLock}
              disabled={!interactive || !meta.items.length}
              testID="plan-lock"
            >
              <Lock size={15} color={BRIEF.white} strokeWidth={2} />
              <Text style={[styles.btnText, styles.btnTextPrimary]}>Lock it in</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary]}
              onPress={onDismiss}
              disabled={!interactive}
              testID="plan-dismiss"
            >
              <Text style={styles.btnText}>Not now</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.foot}>Or just tell me what to change.</Text>
        </>
      )}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: {
    backgroundColor: BRIEF.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BRIEF.line,
    padding: 16,
    gap: 12,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontFamily: 'Inter-SemiBold', fontSize: 16, color: BRIEF.mossInk },
  sub: { fontFamily: 'Inter-Regular', fontSize: 13, color: BRIEF.muted, marginTop: 2 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  tagProp: { backgroundColor: BRIEF.pearWash },
  tagDone: { backgroundColor: BRIEF.moss },
  tagText: { fontFamily: 'Inter-SemiBold', fontSize: 11 },
  tagTextProp: { color: BRIEF.pearInk },
  tagTextDone: { color: BRIEF.white },
  loadbar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: BRIEF.linen2,
  },
  loadMeet: { backgroundColor: BRIEF.meeting },
  loadPlan: { backgroundColor: BRIEF.peri },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontFamily: 'Inter-Regular', fontSize: 11, color: BRIEF.muted },
  timeline: { gap: 2 },
  tlRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  time: {
    width: 58,
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: BRIEF.mossInk,
    fontVariant: ['tabular-nums'],
  },
  ampm: { fontFamily: 'Inter-Regular', fontSize: 10, color: BRIEF.faint },
  dotCol: { width: 12, alignItems: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5 },
  dotMeet: { backgroundColor: BRIEF.meeting },
  dotItem: { backgroundColor: BRIEF.peri },
  dotGap: { backgroundColor: BRIEF.linen2, borderWidth: 1, borderColor: BRIEF.chipBorder },
  gapText: { fontFamily: 'Inter-Regular', fontSize: 12, color: BRIEF.faint, fontStyle: 'italic' },
  itemTitle: { fontFamily: 'Inter-Medium', fontSize: 14, color: BRIEF.mossInk },
  itemMeta: { fontFamily: 'Inter-Regular', fontSize: 12, color: BRIEF.muted, marginTop: 1 },
  faint: { color: BRIEF.faint },
  remove: { padding: 4 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: BRIEF.chipBorder,
  },
  addText: { fontFamily: 'Inter-Medium', fontSize: 14, color: BRIEF.moss },
  actions: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 11,
  },
  btnPrimary: { backgroundColor: BRIEF.moss },
  btnSecondary: { borderWidth: 1, borderColor: BRIEF.chipBorder },
  btnOff: { opacity: 0.5 },
  btnText: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: BRIEF.moss },
  btnTextPrimary: { color: BRIEF.white },
  foot: { fontFamily: 'Inter-Regular', fontSize: 12, color: BRIEF.faint, textAlign: 'center' },
  seeToday: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  link: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: BRIEF.moss },
  collapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: BRIEF.linen2,
  },
  collapsedText: { fontFamily: 'Inter-Regular', fontSize: 13, color: BRIEF.muted },
});
