/**
 * The sheet every Worlds choice opens in, and the rows, fields and buttons
 * inside it. One sheet per screen: switching what it shows keeps the same
 * sheet open, so two never stack.
 */
import type { ReactNode } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import { F, W } from '../../lib/worlds/look';

export function Sheet({
  visible,
  onClose,
  label,
  children,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View
          style={[styles.sheet, { paddingBottom: 18 + insets.bottom }]}
          accessibilityViewIsModal
          accessibilityLabel={label}
          testID={testID}
        >
          <View style={styles.grab} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            bounces={false}
            contentContainerStyle={{ paddingBottom: 2 }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SheetTitle({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.title} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function SheetNote({ children }: { children: ReactNode }) {
  return <Text style={styles.note}>{children}</Text>;
}

export function MenuRow({
  icon: Icon,
  image,
  title,
  sub,
  warn,
  selected,
  onPress,
  testID,
}: {
  icon?: LucideIcon;
  image?: ImageSourcePropType;
  title: string;
  sub?: string | null;
  warn?: boolean;
  selected?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.mrow,
        (pressed || selected) && { backgroundColor: W.sageWash },
      ]}
      accessibilityRole="button"
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      accessibilityState={selected ? { selected: true } : undefined}
      testID={testID}
    >
      <View style={styles.mi}>
        {image ? (
          <Image source={image} style={{ width: 36, height: 36 }} resizeMode="contain" />
        ) : Icon ? (
          <Icon size={19} color={warn ? W.warn : W.moss} />
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.mt, warn && { color: W.warn }]}>{title}</Text>
        {sub ? <Text style={styles.ms}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.flabel}>{children}</Text>;
}

export function Field(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor="#9a9a9a"
      {...props}
      style={[styles.field, props.multiline && styles.fieldMulti, props.style]}
    />
  );
}

export function SheetButtons({ children }: { children: ReactNode }) {
  return <View style={styles.acts}>{children}</View>;
}

export function Btn({
  label,
  onPress,
  kind = 'pri',
  disabled,
  icon: Icon,
  testID,
}: {
  label: string;
  onPress: () => void;
  kind?: 'pri' | 'sec';
  disabled?: boolean;
  icon?: LucideIcon;
  testID?: string;
}) {
  const pri = kind === 'pri';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        pri ? styles.btnPri : styles.btnSec,
        disabled && { opacity: 0.45 },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
    >
      {Icon ? <Icon size={16} color={pri ? W.linen : W.moss} /> : null}
      <Text style={[styles.btnText, { color: pri ? W.linen : W.moss }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: W.scrim },
  sheet: {
    maxHeight: '88%',
    backgroundColor: W.linen,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingHorizontal: 16,
    shadowColor: '#1A3328',
    shadowOpacity: 0.16,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -10 },
    elevation: 12,
  },
  grab: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: W.line2,
    marginBottom: 10,
  },
  title: {
    fontFamily: F.ui,
    fontSize: 20,
    lineHeight: 24,
    color: W.forest,
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  note: {
    fontFamily: F.body,
    fontSize: 14,
    lineHeight: 20,
    color: W.muted,
    marginHorizontal: 4,
    marginBottom: 12,
  },
  mrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  mi: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: W.white,
    borderWidth: 1,
    borderColor: W.line,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mt: { fontFamily: F.bodySemi, fontSize: 15.5, color: W.ink },
  ms: { fontFamily: F.body, fontSize: 13, color: W.muted, marginTop: 1 },
  flabel: {
    fontFamily: F.ui,
    fontSize: 13,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: W.off,
    marginTop: 12,
    marginBottom: 6,
    marginHorizontal: 4,
  },
  field: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: W.field,
    backgroundColor: W.white,
    paddingHorizontal: 14,
    fontFamily: F.body,
    fontSize: 16,
    color: W.ink,
    marginHorizontal: 4,
  },
  fieldMulti: { minHeight: 96, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' },
  acts: { flexDirection: 'row', gap: 8, marginTop: 16, marginHorizontal: 4 },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
  },
  btnPri: { backgroundColor: W.moss },
  btnSec: { borderWidth: 1.5, borderColor: 'rgba(46,85,64,0.25)' },
  btnText: { fontFamily: F.bodySemi, fontSize: 14.5 },
});
