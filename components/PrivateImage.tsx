/**
 * A saved photo, shown through a private link (lib/photos/privateUrl).
 *
 * It takes the place of an Image wherever the picture is one of the person's
 * own photos. While the link is being made it holds the photo's place, so
 * nothing around it moves.
 */
import React from 'react';
import { Image, View, type ImageProps } from 'react-native';
import { usePrivateUrl } from '../lib/photos/privateUrl';

export type PrivateImageProps = Omit<ImageProps, 'source'> & {
  /** The address the photo was saved with, or a photo still on the phone */
  uri: string;
};

export function PrivateImage({ uri, style, testID, ...rest }: PrivateImageProps) {
  const link = usePrivateUrl(uri);
  if (!link) return <View style={style} testID={testID} />;
  return <Image {...rest} style={style} source={{ uri: link }} testID={testID} />;
}
