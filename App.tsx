/**
 * Snipback (React Native)
 *
 * @format
 */

import React from 'react';
import { StatusBar } from 'react-native';
import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { OrganizationsProvider } from './src/dashboard/OrganizationsContext';
import { TeamsProvider } from './src/dashboard/TeamsContext';
import RootNavigator from './src/navigation/RootNavigator';
import { colors } from './src/theme';

const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.themeRed,
    background: colors.background,
    card: colors.background,
  },
};

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <AuthProvider>
        <OrganizationsProvider>
          <TeamsProvider>
            <NavigationContainer theme={navigationTheme}>
              <RootNavigator />
            </NavigationContainer>
          </TeamsProvider>
        </OrganizationsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default App;
