import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { VolleyRotation } from '../../api/gameEdit';
import { colors } from '../../theme';
import { Label } from '../../teams/components/FormParts';
import { ROTATION_MAX, ROTATION_SETS, rotationOf, setRotation } from '../gameForm';

// A volleyball game's starting rotations (VolleyBallRotationCell in iOS):
// for each of the five sets, the rotation each side starts in, "--" or 1 to 6.
// iOS picks each from a drop-down; here each has − and + steps, which fit a
// phone's width.

type Props = {
  rotation: VolleyRotation[];
  onChange: (rotation: VolleyRotation[]) => void;
};

export default function RotationEditor({ rotation, onChange }: Props) {
  return (
    <View style={styles.box}>
      <Label>Starting rotations</Label>
      <View style={styles.row}>
        <Text style={styles.set} />
        <Text style={styles.head}>HOME</Text>
        <Text style={styles.head}>AWAY</Text>
      </View>
      {ROTATION_SETS.map(period => (
        <View key={period} style={styles.row}>
          <Text style={styles.set}>{`Set#${period}`}</Text>
          {(['home', 'away'] as const).map(side => {
            const value = rotationOf(rotation, period, side);
            const name = `Set ${period} ${side} rotation`;
            return (
              <View key={side} style={styles.stepper} accessibilityLabel={`${name}: ${value === 0 ? 'none' : value}`}>
                <Step
                  text="−"
                  a11y={`${name} down`}
                  disabled={value === 0}
                  onPress={() => onChange(setRotation(rotation, period, side, value - 1))}
                />
                <Text style={styles.value}>{value === 0 ? '--' : String(value)}</Text>
                <Step
                  text="+"
                  a11y={`${name} up`}
                  disabled={value === ROTATION_MAX}
                  onPress={() => onChange(setRotation(rotation, period, side, value + 1))}
                />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Step({ text, a11y, disabled, onPress }: { text: string; a11y: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={[styles.step, disabled && styles.stepOff]}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
    >
      <Text style={styles.stepText}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  set: {
    width: 56,
    color: colors.lightGray,
    fontSize: 14,
  },
  head: {
    flex: 1,
    textAlign: 'center',
    color: colors.midGray,
    fontSize: 12,
    letterSpacing: 1,
  },
  stepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  step: {
    width: 32,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepOff: {
    opacity: 0.35,
  },
  stepText: {
    color: colors.white,
    fontSize: 16,
  },
  value: {
    width: 26,
    textAlign: 'center',
    color: colors.white,
    fontSize: 15,
    fontWeight: 'bold',
  },
});
