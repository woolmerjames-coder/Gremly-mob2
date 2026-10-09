/**
 * Today Screen: picks which Today view to show.
 *
 * NowScreenV1 when EXPO_PUBLIC_NOW_V1 is on, the lanes view when
 * EXPO_PUBLIC_TODAY_V4_LANES is on, and otherwise TodayV3View, the default.
 * The old TodayScreenV2, shown only with EXPO_PUBLIC_TODAY_V3 set off, is
 * gone, along with the cards only it used.
 */
import TodayV3View from './TodayV3View';
import TodayV4LanesView from './TodayV4LanesView';
import NowScreenV1 from '../../app/screens/NowScreenV1';
import { env } from '../../lib/env';

export default function TodayScreen() {
  if (__DEV__) {
    console.log('[TodayVariant]', {
      v3: env.feature.today.v3,
      v4: env.feature.today.v4Lanes,
      nowV1: env.feature.today.nowV1,
    });
  }
  if (env.feature.today.nowV1) {
    return <NowScreenV1 />;
  }
  if (env.feature.today.v4Lanes) {
    return <TodayV4LanesView />;
  }
  return <TodayV3View />;
}
