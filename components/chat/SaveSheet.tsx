import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native';
import { Check, CheckSquare, Repeat, FileText, MessageSquare } from 'lucide-react-native';

interface SaveSheetProps {
  visible: boolean;
  onClose: () => void;
  extractions: any[];
  autoTitle: string | null;
  runningSummary: string | null;
  onDismiss: (extractionId: string) => void;
  onSave: (items: any[], includeSummary: boolean) => void;
  saving?: boolean;
}

const ICON_CONFIG: Record<string, { icon: typeof CheckSquare; bg: string; color: string }> = {
  todo: { icon: CheckSquare, bg: 'rgba(46,85,64,0.1)', color: '#2E5540' },
  habit: { icon: Repeat, bg: 'rgba(156,166,224,0.15)', color: '#9CA6E0' },
  note: { icon: FileText, bg: 'rgba(224,196,122,0.15)', color: '#C4A84A' },
};

function getTitle(count: number): string {
  if (count >= 3) return `Gremly found ${count} things worth keeping`;
  if (count === 2) return 'Gremly found a couple things worth keeping';
  if (count === 1) return 'Gremly found something worth keeping';
  return 'Save a summary of this conversation';
}

export function SaveSheet({
  visible,
  onClose,
  extractions,
  autoTitle,
  runningSummary,
  onDismiss,
  onSave,
  saving,
}: SaveSheetProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(extractions.map((e) => e.id)),
  );
  const [summarySelected, setSummarySelected] = useState(false);

  useEffect(() => {
    setSelectedIds(new Set(extractions.map((e) => e.id)));
  }, [extractions]);

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalSelected = selectedIds.size + (summarySelected ? 1 : 0);
  const nothingSelected = totalSelected === 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>{getTitle(extractions.length)}</Text>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {extractions.map((item) => {
              const config = ICON_CONFIG[item.type] || ICON_CONFIG.note;
              const Icon = config.icon;
              const selected = selectedIds.has(item.id);
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.7}
                  onPress={() => toggleItem(item.id)}
                  style={[styles.saveItem, { opacity: selected ? 1 : 0.4 }]}
                >
                  <View
                    style={[
                      styles.selectionCircle,
                      selected ? styles.selectionCircleFilled : styles.selectionCircleEmpty,
                    ]}
                  >
                    {selected && <Check size={14} color="#FFFFFF" />}
                  </View>
                  <View style={[styles.iconContainer, { backgroundColor: config.bg }]}>
                    <Icon size={16} color={config.color} />
                  </View>
                  <View style={styles.itemContent}>
                    <Text style={[styles.typeLabel, { color: config.color }]}>
                      {item.type.toUpperCase()}
                    </Text>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    {item.body ? (
                      <Text style={styles.itemMeta} numberOfLines={1}>
                        {item.body}
                      </Text>
                    ) : null}
                    {item.due_date ? (
                      <Text style={styles.itemMeta}>Due: {item.due_date}</Text>
                    ) : null}
                    {item.frequency ? <Text style={styles.itemMeta}>{item.frequency}</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or save the whole conversation</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Chat summary card */}
            <Pressable
              onPress={() => setSummarySelected((prev) => !prev)}
              style={[
                styles.saveItem,
                { opacity: summarySelected ? 0.75 : 0.4, borderStyle: 'dashed' },
              ]}
            >
              <View
                style={[
                  styles.selectionCircle,
                  summarySelected ? styles.selectionCircleFilled : styles.selectionCircleEmpty,
                ]}
              >
                {summarySelected && <Check size={14} color="#FFFFFF" />}
              </View>
              <View style={[styles.iconContainer, { backgroundColor: 'rgba(46,85,64,0.06)' }]}>
                <MessageSquare size={16} color="#2E5540" />
              </View>
              <View style={styles.itemContent}>
                <Text style={[styles.typeLabel, { color: 'rgba(34,34,34,0.55)' }]}>
                  CHAT SUMMARY
                </Text>
                <Text style={styles.itemTitle}>{autoTitle || 'Conversation summary'}</Text>
                {runningSummary ? (
                  <Text style={styles.itemMeta} numberOfLines={2}>
                    {runningSummary}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          </ScrollView>

          {/* Save button */}
          <TouchableOpacity
            style={[styles.saveButton, (nothingSelected || saving) && { opacity: 0.4 }]}
            onPress={() => {
              if (nothingSelected || saving) return;
              const selectedItems = extractions.filter((e) => selectedIds.has(e.id));
              onSave(selectedItems, summarySelected);
            }}
            activeOpacity={nothingSelected || saving ? 1 : 0.8}
          >
            <Text style={styles.saveButtonText}>
              {saving
                ? 'Generating summary...'
                : nothingSelected
                  ? 'Save to Gremly'
                  : totalSelected === 1
                    ? 'Save 1 item to Gremly'
                    : `Save ${totalSelected} to Gremly`}
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.22)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#F9F6F1',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingTop: 16,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
    maxHeight: '70%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 18,
    color: '#222222',
    marginBottom: 16,
  },
  scrollArea: {
    flexShrink: 1,
  },
  saveItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    marginBottom: 10,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContent: {
    flex: 1,
  },
  typeLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  itemTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    color: '#222222',
    lineHeight: 20,
  },
  itemMeta: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: 'rgba(34,34,34,0.55)',
    marginTop: 2,
  },
  selectionCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  selectionCircleFilled: {
    backgroundColor: '#2E5540',
  },
  selectionCircleEmpty: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 6,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.07)',
  },
  dividerText: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: 'rgba(34,34,34,0.55)',
  },
  saveButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#2E5540',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  saveButtonText: {
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 15,
    color: '#F9F6F1',
  },
});
