import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Organization } from '../../api/types';
import { colors } from '../../theme';
import { ADD_ORG_ID, type OrgTreeNode } from '../orgLogic';

// The organisation picker (the dashboard's organisation accordion in iOS).

type Row = { node: OrgTreeNode; key: string };

/** Visible rows: each node, then its children when expanded. */
function flatten(nodes: OrgTreeNode[], expanded: Set<string>, parentKey = ''): Row[] {
  const rows: Row[] = [];
  nodes.forEach((node, index) => {
    const key = `${parentKey}/${node.org.orgId}-${index}`;
    rows.push({ node, key });
    if (node.children.length > 0 && expanded.has(key)) {
      rows.push(...flatten(node.children, expanded, key));
    }
  });
  return rows;
}

/** Every node whose name contains the search text, as a flat list. */
function search(nodes: OrgTreeNode[], text: string, parentKey = ''): Row[] {
  const needle = text.trim().toLowerCase();
  const rows: Row[] = [];
  nodes.forEach((node, index) => {
    const key = `${parentKey}/${node.org.orgId}-${index}`;
    if (node.org.orgId !== ADD_ORG_ID && node.label.toLowerCase().includes(needle)) {
      rows.push({ node: { ...node, depth: 0 }, key });
    }
    rows.push(...search(node.children, text, key));
  });
  return rows;
}

type Props = {
  visible: boolean;
  tree: OrgTreeNode[];
  selectedOrgId: number | undefined;
  onSelect: (org: Organization) => void;
  onClose: () => void;
};

export default function OrgPickerModal({ visible, tree, selectedOrgId, onSelect, onClose }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const rows = useMemo(
    () => (query.trim() ? search(tree, query) : flatten(tree, expanded)),
    [tree, expanded, query],
  );

  const toggle = (key: string) => {
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const choose = (org: Organization) => {
    if (org.orgId === ADD_ORG_ID) {
      Alert.alert(
        '',
        'Want to setup an Organization Account with Teams/Groups? Please email info@snipback.com to set this up.',
      );
      return;
    }
    setQuery('');
    onSelect(org);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <View style={styles.header}>
            <Text style={styles.title}>Organizations</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.search}
            placeholder="Search organizations"
            placeholderTextColor={colors.midGray}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          <FlatList
            data={rows}
            keyExtractor={row => row.key}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const { node } = item;
              const isAdd = node.org.orgId === ADD_ORG_ID;
              const isSelected = !isAdd && node.org.orgId === selectedOrgId;
              const hasChildren = node.children.length > 0 && !query.trim();
              const isOpen = expanded.has(item.key);
              return (
                <View style={[styles.row, { paddingLeft: 16 + node.depth * 20 }]}>
                  <Pressable
                    style={styles.rowMain}
                    onPress={() => choose(node.org)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={[
                        styles.rowText,
                        isAdd && styles.addText,
                        isSelected && styles.selectedText,
                      ]}
                      numberOfLines={2}
                    >
                      {node.label}
                    </Text>
                  </Pressable>
                  {hasChildren && (
                    <Pressable
                      onPress={() => toggle(item.key)}
                      hitSlop={10}
                      style={styles.chevron}
                      accessibilityRole="button"
                      accessibilityLabel={isOpen ? 'Hide sub-organizations' : 'Show sub-organizations'}
                    >
                      <Text style={styles.chevronText}>{isOpen ? '−' : '+'}</Text>
                    </Pressable>
                  )}
                </View>
              );
            }}
            ItemSeparatorComponent={Separator}
            ListEmptyComponent={<Text style={styles.empty}>No organizations found.</Text>}
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
    maxHeight: '85%',
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
  search: {
    marginHorizontal: 16,
    marginBottom: 8,
    height: 40,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.field,
    color: colors.white,
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingRight: 8,
  },
  rowMain: {
    flex: 1,
    paddingVertical: 12,
  },
  rowText: {
    color: colors.white,
    fontSize: 16,
  },
  addText: {
    color: colors.lightGray,
  },
  selectedText: {
    color: colors.themeRed,
    fontWeight: 'bold',
  },
  chevron: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronText: {
    color: colors.lightGray,
    fontSize: 22,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 16,
  },
  empty: {
    color: colors.midGray,
    textAlign: 'center',
    padding: 24,
  },
});
