/**
 * People (Worlds rebuild, stage 5): everyone in their life Gremly keeps,
 * those who matter most to them now first. Opened from the People row on the
 * Worlds home, beside Your story; each opens their page. No new tab.
 *
 * A list can be seen at a glance, so who someone is stays off it when it
 * came from something private; their page shows it.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight } from 'lucide-react-native';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { fetchPeople, personTitle, whoLine, type PersonListEntry } from '../../lib/people/people';
import { F, SHADOW, W } from '../../lib/worlds/look';
import { PageTop } from '../../components/worlds/PageTop';
import { TextLink } from '../../components/worlds/parts';
import { PersonAvatar } from '../../components/people/PersonAvatar';

export default function PeopleScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [people, setPeople] = useState<PersonListEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    let live = true;
    setFailed(false);
    fetchPeople().then(
      (p) => live && setPeople(p),
      (err) => {
        console.warn('[People] the list could not be read:', err);
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, []);
  // read again on the way back, so a merge or a name put right shows
  useFocusEffect(load);

  return (
    <SafeAreaView style={styles.screen} edges={['top']} testID="people">
      <PageTop crumb="Worlds" onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title} accessibilityRole="header">
          People
        </Text>
        <Text style={styles.sub}>The people in your life, as Gremly understands them.</Text>
        {failed ? (
          <TextLink label="The list did not load. Tap to try again." onPress={load} />
        ) : !people ? (
          <ActivityIndicator color={W.moss} style={{ marginTop: 32 }} />
        ) : !people.length ? (
          <Text style={styles.none} testID="people-none">
            No one yet. As you mention the people in your life, they show up here.
          </Text>
        ) : (
          <View style={styles.list}>
            {people.map((p, i) => {
              const who = whoLine(p, { hide: p.who_private });
              return (
                <Pressable
                  key={p.id}
                  onPress={() => nav.navigate('PersonDetail', { personId: p.id })}
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && styles.rowLine,
                    pressed && { backgroundColor: 'rgba(46,85,64,0.04)' },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={[personTitle(p), who].filter(Boolean).join(', ')}
                  testID={`people-row-${p.id}`}
                >
                  <PersonAvatar person={p} size={44} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {personTitle(p)}
                    </Text>
                    {who ? <Text style={styles.who}>{who}</Text> : null}
                    {p.words ? (
                      <Text style={styles.words} numberOfLines={2}>
                        {p.words}
                      </Text>
                    ) : null}
                  </View>
                  <ChevronRight size={18} color={W.faint} />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: W.linen },
  scroll: { paddingHorizontal: 20, paddingBottom: 60 },
  title: {
    marginTop: 8,
    fontFamily: F.ui,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.6,
    color: W.forest,
  },
  sub: {
    fontFamily: F.body,
    fontSize: 15,
    lineHeight: 21,
    color: W.muted,
    marginTop: 6,
    marginBottom: 18,
  },
  none: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: W.ink, marginTop: 12 },
  list: { backgroundColor: W.white, borderRadius: 20, paddingHorizontal: 14, ...SHADOW },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  rowLine: { borderTopWidth: 1, borderTopColor: W.line },
  name: { fontFamily: F.bodySemi, fontSize: 16, lineHeight: 21, color: W.forest },
  who: { fontFamily: F.body, fontSize: 13.5, color: W.off, marginTop: 1 },
  words: { fontFamily: F.body, fontSize: 13.5, lineHeight: 19, color: W.muted, marginTop: 3 },
});
