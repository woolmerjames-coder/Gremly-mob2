import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, SPACE } from '../_tokens';
import { X as CloseIcon } from 'lucide-react-native';
import { Users } from '../../../icons';
import { useRepo } from '../../../../providers/RepoProvider';

export type PeopleOverlayProps = {
  visible: boolean;
  onClose: () => void;
  spaceId: string;
};

export const PeopleOverlay: React.FC<PeopleOverlayProps> = ({ visible, onClose, spaceId }) => {
  const repo = useRepo();
  const [people, setPeople] = React.useState<Array<{ id: string; name: string }>>([]);
  const [supported, setSupported] = React.useState<boolean>(true);

  React.useEffect(() => {
    const run = async () => {
      try {
        const list = await repo.listPeople();
        const filtered = (list || []).filter((p: any) => !spaceId || p.space_id === spaceId);
        setPeople(
          filtered.map((p: any) => ({ id: p.id, name: p.display_name || p.name || 'Person' })),
        );
        setSupported(true);
      } catch {
        setSupported(false);
      }
    };
    if (visible) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, spaceId]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>People</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close people"
            >
              <CloseIcon color={COLORS.Linen} size={22} />
            </TouchableOpacity>
          </View>
          <View style={{ height: 12 }} />
          {!supported ? (
            <Text style={{ color: '#D9E6DA' }}>
              People linking isn’t enabled in this environment.
            </Text>
          ) : people.length === 0 ? (
            <Text style={{ color: '#D9E6DA' }}>No people linked to this Space yet.</Text>
          ) : (
            <View style={{ gap: 12 }}>
              {people.map((p) => (
                <View key={p.id} style={styles.personRow}>
                  <View style={styles.avatar}>
                    <Users color={COLORS.Moss} size={18} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.personName}>{p.name}</Text>
                    <Text style={styles.personContext}>Linked to this space</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 51, 40, 0.32)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.Deep,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: SPACE.lg,
    paddingBottom: SPACE.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.Linen,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  personName: {
    color: COLORS.Linen,
    fontWeight: '600',
  },
  personContext: {
    color: '#D9E6DA',
    fontSize: 12,
  },
});

export default PeopleOverlay;
