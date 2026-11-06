import React from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

/** Shown while the saved session is restored (SplashViewController in iOS). */
export default function SplashScreen() {
  return (
    <View style={styles.screen}>
      <Image
        source={require('../../assets/images/logo.png')}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel="Snipback AI"
      />
      <ActivityIndicator color={colors.themeRed} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 300,
    height: 160,
  },
  spinner: {
    marginTop: 24,
  },
});
