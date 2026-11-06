import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputInstance,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { colors, fonts } from '../theme';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Widths at or above this get the tablet layout (form centred on screen). */
const WIDE_LAYOUT_MIN_WIDTH = 600;

// Placeholder for features that aren't built yet.
function showComingSoon(feature: string) {
  Alert.alert(feature, "This isn't connected yet.");
}

type Field = 'email' | 'password' | null;

/** LoginViewController in iOS (Auth.storyboard). */
export default function LoginScreen() {
  const { signIn } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_LAYOUT_MIN_WIDTH;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<Field>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);

  const handleSignIn = async () => {
    if (isSigningIn) {
      return;
    }
    const trimmedEmail = email.trim();
    if (trimmedEmail === '') {
      Alert.alert('Sign In', 'Please enter an email.');
      return;
    }
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      Alert.alert('Sign In', 'Please enter a valid email.');
      return;
    }
    if (password.trim() === '') {
      Alert.alert('Sign In', 'Please enter a password.');
      return;
    }

    setIsSigningIn(true);
    try {
      await signIn(trimmedEmail, password);
      // On success the navigator swaps this screen for the Dashboard.
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to sign in. Please try again.';
      Alert.alert('Error', message);
      setIsSigningIn(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Image
          source={require('../../assets/images/logo.png')}
          style={[styles.logo, isWide && styles.logoWide]}
          resizeMode="contain"
          accessibilityLabel="Snipback AI"
        />

        <View style={styles.form}>
          <TextInput
            style={[styles.input, focusedField === 'email' && styles.inputFocused]}
            placeholder="Email Address"
            placeholderTextColor={colors.lightGray}
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocusedField('email')}
            onBlur={() => setFocusedField(null)}
            editable={!isSigningIn}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            clearButtonMode="while-editing"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />

          <View style={styles.passwordRow}>
            <TextInput
              ref={passwordRef}
              style={[
                styles.input,
                styles.passwordInput,
                focusedField === 'password' && styles.inputFocused,
              ]}
              placeholder="Password"
              placeholderTextColor={colors.lightGray}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
              editable={!isSigningIn}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleSignIn}
            />
            <Pressable
              style={styles.eyeButton}
              onPress={() => setShowPassword(value => !value)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Image
                source={
                  showPassword
                    ? require('../../assets/images/eye-off.png')
                    : require('../../assets/images/eye.png')
                }
              />
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.signInButton,
              (pressed || isSigningIn) && styles.pressed,
            ]}
            onPress={handleSignIn}
            disabled={isSigningIn}
            accessibilityRole="button"
            accessibilityState={{ busy: isSigningIn, disabled: isSigningIn }}
          >
            {isSigningIn ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.signInText}>SIGN IN</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.forgotButton}
            onPress={() => showComingSoon('Forgot Password')}
            accessibilityRole="button"
          >
            <Text style={styles.forgotText}>Forgot Password</Text>
          </Pressable>

          <View style={styles.socialRow}>
            <Pressable
              style={({ pressed }) => [
                styles.socialButton,
                styles.appleButton,
                pressed && styles.pressed,
              ]}
              onPress={() => showComingSoon('Sign in with Apple')}
              accessibilityRole="button"
            >
              <View style={styles.socialIconBox}>
                <Image
                  source={require('../../assets/images/apple.png')}
                  style={styles.appleIcon}
                />
              </View>
              <Text style={styles.socialText}>Sign in with Apple</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.socialButton,
                styles.googleButton,
                pressed && styles.pressed,
              ]}
              onPress={() => showComingSoon('Sign in with Google')}
              accessibilityRole="button"
            >
              <View style={styles.socialIconBox}>
                <Image
                  source={require('../../assets/images/google.png')}
                  style={styles.googleIcon}
                />
              </View>
              <Text style={styles.socialText}>Sign in with Google</Text>
            </Pressable>
          </View>

          <Pressable
            style={styles.signUpButton}
            onPress={() => showComingSoon('Sign Up')}
            accessibilityRole="button"
          >
            <Text style={styles.signUpText}>
              <Text style={styles.red}>SIGN UP</Text> FOR SNIPBACK{' '}
              <Text style={styles.red}>AI</Text>
            </Text>
          </Pressable>

          <Pressable
            style={styles.resendButton}
            onPress={() => showComingSoon('Resend Credentials')}
            accessibilityRole="button"
          >
            <Text style={styles.resendText}>
              <Text style={styles.red}>Resend</Text> Credentials
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  contentWide: {
    justifyContent: 'center',
  },
  logo: {
    width: 300,
    height: 160,
    marginTop: 40,
  },
  logoWide: {
    marginTop: 0,
  },
  form: {
    width: '100%',
    maxWidth: 350,
    marginTop: 8,
  },
  input: {
    height: 60,
    backgroundColor: colors.field,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    paddingLeft: 27,
    paddingRight: 12,
    color: colors.lightGray,
    fontSize: 14,
  },
  inputFocused: {
    borderColor: colors.themeRed,
  },
  passwordRow: {
    marginTop: 16,
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 52,
  },
  eyeButton: {
    position: 'absolute',
    right: 13,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInButton: {
    marginTop: 16,
    height: 60,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.background,
    backgroundColor: colors.themeRed,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.midGray,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  signInText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  pressed: {
    opacity: 0.7,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    height: 32,
    marginTop: 8,
    justifyContent: 'center',
  },
  forgotText: {
    color: colors.lightGray,
    fontFamily: fonts.bazouk,
    fontSize: 13,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 10,
    marginTop: 36,
  },
  socialButton: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 5,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: colors.background,
  },
  appleButton: {
    borderColor: colors.white,
  },
  googleButton: {
    borderColor: colors.themeRed,
  },
  socialIconBox: {
    width: 34.5,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleIcon: {
    width: 25.5,
    height: 30,
  },
  googleIcon: {
    width: 30,
    height: 30,
  },
  socialText: {
    flex: 1,
    color: colors.white,
    fontFamily: fonts.bazouk,
    fontSize: 13,
    textAlign: 'center',
  },
  signUpButton: {
    marginTop: 40,
    alignSelf: 'center',
  },
  signUpText: {
    color: colors.white,
    fontSize: 12,
    textAlign: 'center',
  },
  resendButton: {
    marginTop: 23,
    alignSelf: 'center',
  },
  resendText: {
    color: colors.midGray,
    fontSize: 15,
    textAlign: 'center',
  },
  red: {
    color: colors.themeRed,
  },
});
