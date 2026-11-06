import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ComingSoon'>;

/** Stands in for a module that hasn't been rebuilt yet. */
export default function ComingSoonScreen({ route }: Props) {
  return (
    <View style={styles.screen}>
      <Image
        source={require('../../assets/images/logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.title}>{route.params.title}</Text>
      <Text style={styles.body}>This screen hasn't been built in the React Native app yet.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logo: {
    width: 180,
    height: 80,
    opacity: 0.5,
  },
  title: {
    marginTop: 24,
    color: colors.white,
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 2,
    textAlign: 'center',
  },
  body: {
    marginTop: 12,
    color: colors.midGray,
    fontSize: 15,
    textAlign: 'center',
  },
});
