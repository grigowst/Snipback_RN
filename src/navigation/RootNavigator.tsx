import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ComingSoonScreen from '../screens/ComingSoonScreen';
import { colors } from '../theme';

export type RootStackParamList = {
  Login: undefined;
  Dashboard: undefined;
  Settings: undefined;
  ComingSoon: { title: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Signed-out users only have the Login stack; signed-in users only have the
 * app stack, so Back can never return to Login after sign-in (or the
 * reverse after sign-out).
 */
export default function RootNavigator() {
  const { status } = useAuth();

  if (status === 'restoring') {
    return <SplashScreen />;
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.white,
        headerTitleStyle: { color: colors.white },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      {status === 'signedIn' ? (
        <>
          <Stack.Screen name="Dashboard" component={DashboardScreen} />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ headerShown: true, title: 'SETTINGS' }}
          />
          <Stack.Screen
            name="ComingSoon"
            component={ComingSoonScreen}
            options={({ route }) => ({ headerShown: true, title: route.params.title })}
          />
        </>
      ) : (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ animationTypeForReplace: 'pop' }}
        />
      )}
    </Stack.Navigator>
  );
}
