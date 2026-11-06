import React, { useState } from 'react';
import {
  Image,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../../theme';
import type { DashboardTile } from '../tiles';

// The dashboard's tile grid (DashboardViewController's collection view).

/** Height of the name under each tile. */
const LABEL_HEIGHT = 40;
/** Space between the tile edge and its icon (imageEdgeInsets). */
const ICON_INSET = 10;

const PHONE = { margin: 10, gap: 20 };
const TABLET = { margin: 100, gap: 50 };

export type TileLayout = {
  side: number;
  columns: number;
  columnGap: number;
  rowGap: number;
  margin: number;
};

/**
 * Phones: two columns, each tile half the width less the gap
 * (sizeForItemAt in iOS). The leftover space goes between the columns.
 */
export function phoneLayout(width: number): TileLayout {
  const inner = Math.max(width - PHONE.margin * 2, 0);
  const side = Math.max(Math.floor(inner / 2 - PHONE.gap), 40);
  return {
    side,
    columns: 2,
    columnGap: Math.max(inner - side * 2, PHONE.gap),
    rowGap: PHONE.gap,
    margin: PHONE.margin,
  };
}

/**
 * Tablets: every tile on one screen, no scrolling (iPadTileSize in iOS) —
 * the biggest square that fits, trying each column count.
 */
export function tabletLayout(width: number, height: number, count: number): TileLayout {
  // iOS uses a flat 100-pt margin; narrow windows (Split View, small
  // Android tablets) get a proportional one so tiles keep their room.
  const margin = width >= 700 ? TABLET.margin : Math.max(width * 0.08, PHONE.margin);
  const boxWidth = Math.max(width - margin * 2, 0);
  const boxHeight = Math.max(height, 0);
  const n = Math.max(count, 1);
  const gap = TABLET.gap;
  let side = 0;
  for (let columns = 1; columns <= n; columns++) {
    const rows = Math.ceil(n / columns);
    const byWidth = (boxWidth - (columns - 1) * gap) / columns;
    const byHeight = (boxHeight - (rows - 1) * gap) / rows - LABEL_HEIGHT;
    side = Math.max(side, Math.min(byWidth, byHeight));
  }
  side = Math.floor(Math.max(side, 40));
  // As many tiles per row as fit; the spare width goes between them.
  const columns = Math.max(1, Math.min(n, Math.floor((boxWidth + gap) / (side + gap))));
  const columnGap = columns > 1 ? (boxWidth - columns * side) / (columns - 1) : 0;
  return { side, columns, columnGap, rowGap: gap, margin };
}

type Props = {
  tiles: DashboardTile[];
  isTablet: boolean;
  onPress: (tile: DashboardTile) => void;
};

export default function TileGrid({ tiles, isTablet, onPress }: Props) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || size.width !== width || size.height !== height) {
      setSize({ width, height });
    }
  };

  const layout = size
    ? isTablet
      ? tabletLayout(size.width, size.height - TABLET.gap, tiles.length)
      : phoneLayout(size.width)
    : null;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {layout && (
        <ScrollView
          contentContainerStyle={[
            styles.grid,
            {
              paddingHorizontal: layout.margin,
              paddingTop: isTablet ? TABLET.gap / 2 : PHONE.gap / 2,
              paddingBottom: PHONE.gap,
              columnGap: layout.columnGap,
              rowGap: layout.rowGap,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {tiles.map(tile => (
            <Tile key={tile.type} tile={tile} side={layout.side} onPress={onPress} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Tile({
  tile,
  side,
  onPress,
}: {
  tile: DashboardTile;
  side: number;
  onPress: (tile: DashboardTile) => void;
}) {
  // Icons keep their natural size and only shrink to fit (as UIButton does).
  const natural = Image.resolveAssetSource(tile.icon);
  const room = side - ICON_INSET * 2;
  const w = natural?.width ?? 0;
  const h = natural?.height ?? 0;
  const scale = w > 0 && h > 0 ? Math.min(1, room / Math.max(w, h)) : 1;
  const iconStyle = w > 0 && h > 0 ? { width: w * scale, height: h * scale } : { width: room, height: room };

  return (
    <Pressable
      onPress={() => onPress(tile)}
      disabled={!tile.enabled}
      style={({ pressed }) => [
        { width: side },
        !tile.enabled && styles.disabled,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={tile.label}
      accessibilityState={{ disabled: !tile.enabled }}
    >
      <View style={[styles.tile, { width: side, height: side }]}>
        <Image source={tile.icon} style={iconStyle} resizeMode="contain" />
      </View>
      <View style={styles.labelBox}>
        <Text style={styles.label} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
          {tile.label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tile: {
    backgroundColor: colors.tileRed,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelBox: {
    height: LABEL_HEIGHT,
    justifyContent: 'center',
  },
  label: {
    color: colors.white,
    fontSize: 14,
    letterSpacing: 2,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
});
