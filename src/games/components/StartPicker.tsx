import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';
import {
  daysInMonth,
  epochFromWall,
  formatDate,
  formatTime,
  monthTitle,
  wallTime,
  weekday,
  type WallTime,
} from '../zonedTime';

// The game's start on the venue's clock: a month calendar, then the time with
// hour and minute steps and AM / PM (the date-and-time wheel in iOS). Plain
// JavaScript, so no native date-picker module is needed.

type Props = {
  /** Seconds since 1970. */
  start: number;
  /** The venue's IANA zone, or undefined for the device's. */
  zone: string | undefined;
  onChange: (start: number) => void;
};

const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
/** A seventh of the row, rounded down: exactly 100/7 % can add up to more than the row and wrap on a phone. */
const COLUMN = '14.28%';

export default function StartPicker({ start, zone, onChange }: Props) {
  const w = wallTime(start, zone);
  const set = (next: WallTime) => onChange(epochFromWall(next, zone));

  const shiftMonth = (by: number) => {
    const index = w.year * 12 + (w.month - 1) + by;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    set({ ...w, year, month, day: Math.min(w.day, daysInMonth(year, month)) });
  };
  const shiftMinutes = (by: number) => onChange(start + by * 60);

  const first = weekday({ year: w.year, month: w.month, day: 1 });
  const cells: (number | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: daysInMonth(w.year, w.month) }, (_, i) => i + 1),
  ];

  return (
    <View>
      <Text style={styles.summary}>{`${formatDate(w)} · ${formatTime(w)}`}</Text>
      <View style={styles.monthRow}>
        <Step label="‹" a11y="Previous month" onPress={() => shiftMonth(-1)} />
        <Text style={styles.month}>{monthTitle(w.year, w.month)}</Text>
        <Step label="›" a11y="Next month" onPress={() => shiftMonth(1)} />
      </View>
      <View style={styles.grid}>
        {DAY_HEADERS.map((d, i) => (
          <Text key={`h${i}`} style={styles.dayHeader}>
            {d}
          </Text>
        ))}
        {cells.map((day, i) =>
          day === null ? (
            <View key={`e${i}`} style={styles.day} />
          ) : (
            <Pressable
              key={`d${day}`}
              onPress={() => set({ ...w, day })}
              style={[styles.day, day === w.day && styles.daySelected]}
              accessibilityRole="button"
              accessibilityState={{ selected: day === w.day }}
              accessibilityLabel={`Day ${day}`}
            >
              <Text style={[styles.dayText, day === w.day && styles.dayTextSelected]}>{day}</Text>
            </Pressable>
          ),
        )}
      </View>
      <View style={styles.timeRow}>
        <Step label="−1h" a11y="Hour earlier" onPress={() => shiftMinutes(-60)} />
        <Step label="+1h" a11y="Hour later" onPress={() => shiftMinutes(60)} />
        <Text style={styles.time}>{formatTime(w)}</Text>
        <Step label="−5m" a11y="5 minutes earlier" onPress={() => shiftMinutes(-5)} />
        <Step label="+5m" a11y="5 minutes later" onPress={() => shiftMinutes(5)} />
        <Step
          label={w.hour < 12 ? 'PM' : 'AM'}
          a11y={w.hour < 12 ? 'Switch to PM' : 'Switch to AM'}
          onPress={() => set({ ...w, hour: (w.hour + 12) % 24 })}
        />
      </View>
    </View>
  );
}

function Step({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.step} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={4}>
      <Text style={styles.stepText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summary: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  month: {
    color: colors.white,
    fontSize: 15,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  dayHeader: {
    width: COLUMN,
    textAlign: 'center',
    color: colors.midGray,
    fontSize: 12,
    paddingVertical: 4,
  },
  day: {
    width: COLUMN,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  },
  daySelected: {
    backgroundColor: colors.themeRed,
  },
  dayText: {
    color: colors.lightGray,
    fontSize: 14,
  },
  dayTextSelected: {
    color: colors.white,
    fontWeight: 'bold',
  },
  timeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  time: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
    minWidth: 84,
    textAlign: 'center',
  },
  step: {
    height: 34,
    minWidth: 44,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    color: colors.lightGray,
    fontSize: 14,
  },
});
