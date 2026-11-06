import React from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme';
import type { TeamChoice } from '../teamLogic';

// The phone dashboard's team picker (teamTableView in iOS).

type Props = {
  visible: boolean;
  teams: TeamChoice[];
  selectedTeamId: number;
  isLoading: boolean;
  onSelect: (team: TeamChoice) => void;
  onClose: () => void;
};

export default function TeamPickerModal({
  visible,
  teams,
  selectedTeamId,
  isLoading,
  onSelect,
  onClose,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <View style={styles.header}>
            <Text style={styles.title}>Teams</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          <FlatList
            data={teams}
            keyExtractor={team => String(team.id)}
            renderItem={({ item }) => {
              const isSelected = item.id === selectedTeamId;
              return (
                <Pressable
                  style={styles.row}
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={[styles.rowText, isSelected && styles.selectedText]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {item.isFavourite === 1 ? <Text style={styles.star}>★</Text> : null}
                </Pressable>
              );
            }}
            ItemSeparatorComponent={Separator}
            ListFooterComponent={
              isLoading ? <Text style={styles.footer}>Updating teams…</Text> : undefined
            }
          />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '75%',
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  title: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  close: {
    color: colors.themeRed,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  rowText: {
    flex: 1,
    color: colors.white,
    fontSize: 16,
  },
  selectedText: {
    color: colors.themeRed,
    fontWeight: 'bold',
  },
  star: {
    color: colors.themeRed,
    fontSize: 16,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 16,
  },
  footer: {
    color: colors.midGray,
    textAlign: 'center',
    padding: 16,
  },
});
