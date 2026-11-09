import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { colors } from '../../theme';
import { roleName } from '../roster';

// Small building blocks shared by the add-member and member-editor sheets.

/** A centred sheet over the screen, with a title and a close button. `wide` for the team editor. */
export function Sheet({
  visible,
  title,
  onClose,
  children,
  wide = false,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.sheet, wide && styles.sheetWide]}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Field({ label, ...input }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={colors.midGray}
        autoCorrect={false}
        accessibilityLabel={label}
        {...input}
        style={[styles.input, input.editable === false && styles.inputReadOnly]}
      />
    </View>
  );
}

/** A read-only value with a label. */
export function Value({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <Text style={styles.value} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export function RoleChips({
  roles,
  selected,
  onSelect,
}: {
  roles: number[];
  selected: number;
  onSelect: (role: number) => void;
}) {
  return (
    <View style={styles.field}>
      <Label>Role</Label>
      <View style={styles.chips}>
        {roles.map(role => {
          const isSelected = role === selected;
          return (
            <Pressable
              key={role}
              onPress={() => onSelect(role)}
              style={[styles.chip, isSelected && styles.chipSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`Role ${roleName(role)}`}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{roleName(role)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** A row of choices, one selected (the team editor's game defaults and sport). */
export function OptionChips({
  label,
  options,
  selected,
  onSelect,
  disabled = false,
}: {
  label: string;
  options: { value: number; label: string }[];
  selected: number;
  onSelect: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <View style={styles.chips}>
        {options.map(option => {
          const isSelected = option.value === selected;
          return (
            <Pressable
              key={option.value}
              onPress={() => onSelect(option.value)}
              disabled={disabled}
              style={[styles.chip, isSelected && styles.chipSelected, disabled && styles.inactive]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled }}
              accessibilityLabel={`${label}: ${option.label}`}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Button({
  label,
  onPress,
  busy = false,
  disabled = false,
  kind = 'primary',
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  kind?: 'primary' | 'danger' | 'plain';
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      style={[styles.button, styles[kind], inactive && styles.inactive]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
    >
      {busy ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Text style={[styles.buttonText, kind === 'plain' && styles.plainText]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function ErrorText({ children }: { children: string | null }) {
  return children ? <Text style={styles.error}>{children}</Text> : null;
}

export function Note({ children, tone = 'plain' }: { children: string; tone?: 'plain' | 'good' | 'warn' }) {
  return <Text style={[styles.note, tone === 'good' && styles.good, tone === 'warn' && styles.warn]}>{children}</Text>;
}

export const formStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  half: {
    flex: 1,
  },
  actions: {
    marginTop: 18,
    gap: 10,
  },
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
  },
  sheetWide: {
    maxWidth: 1000,
    maxHeight: '94%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 6,
  },
  title: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  close: {
    color: colors.themeRed,
    fontSize: 16,
  },
  body: {
    paddingHorizontal: 18,
    paddingBottom: 20,
  },
  field: {
    marginTop: 12,
  },
  label: {
    color: colors.midGray,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    height: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.field,
    color: colors.white,
    fontSize: 16,
  },
  inputReadOnly: {
    color: colors.lightGray,
  },
  value: {
    color: colors.lightGray,
    fontSize: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: colors.white,
    borderColor: colors.white,
  },
  chipText: {
    color: colors.lightGray,
    fontSize: 14,
  },
  chipTextSelected: {
    color: colors.background,
    fontWeight: 'bold',
  },
  button: {
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.themeRed,
  },
  danger: {
    backgroundColor: '#7A1F14',
  },
  plain: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  inactive: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.white,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  plainText: {
    color: colors.lightGray,
  },
  error: {
    marginTop: 12,
    color: colors.themeRed,
    fontSize: 14,
  },
  note: {
    marginTop: 8,
    color: colors.lightGray,
    fontSize: 14,
  },
  good: {
    color: '#5BC27A',
  },
  warn: {
    color: '#E9A23B',
  },
});
