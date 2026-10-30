import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

// Dolny pasek zakładek z „+” ZAWSZE na środku ekranu (30.10.2026). Zakładki przed „+” dzielą równo lewą połowę,
// zakładki za nim - prawą; dawniej przy 6 przyciskach (punkty bez Cudzicha) „+” lądował obok środka.
// Zakładka schowana (tabBarItemStyle.display = 'none') nie zajmuje miejsca. Zachowanie jak w standardowym pasku:
// zdarzenie „tabPress” (screenListeners w układzie zakładek) i przejście, jeśli nikt go nie zatrzymał.
//
// Props: jak tabBar z @react-navigation/bottom-tabs + centerRoute (nazwa trasy „+”), style (styl paska)

const CENTER_WIDTH = 72;

const CenteredTabBar = ({ state, descriptors, navigation, centerRoute = 'create', style, activeTintColor, inactiveTintColor }) => {
  // ekran może schować pasek (tabBarStyle: { display: 'none' }) - jak w standardowym pasku
  const focusedOptions = descriptors[state.routes[state.index]?.key]?.options || {};
  if (StyleSheet.flatten(focusedOptions.tabBarStyle)?.display === 'none') return null;

  const visible = state.routes
    .map((route, index) => ({ route, index, options: descriptors[route.key].options }))
    .filter(({ options }) => options.tabBarItemStyle?.display !== 'none');
  const centerIndex = visible.findIndex(({ route }) => route.name === centerRoute);
  const left = centerIndex >= 0 ? visible.slice(0, centerIndex) : visible;
  const center = centerIndex >= 0 ? visible[centerIndex] : null;
  const right = centerIndex >= 0 ? visible.slice(centerIndex + 1) : [];

  const renderTab = ({ route, index, options }, extraStyle) => {
    const focused = state.index === index;
    const color = focused ? activeTintColor : inactiveTintColor;
    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    };
    const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
    return (
      <Pressable
        key={route.key}
        testID={`tab-${route.name}`}
        accessibilityRole="button"
        accessibilityState={focused ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel || options.title || route.name}
        onPress={onPress}
        onLongPress={onLongPress}
        style={[styles.tab, extraStyle]}
      >
        {options.tabBarIcon ? options.tabBarIcon({ focused, color, size: 22 }) : null}
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, style]} testID="centered-tab-bar">
      <View style={styles.half}>{left.map((item) => renderTab(item))}</View>
      {center ? renderTab(center, styles.center) : null}
      <View style={styles.half}>{right.map((item) => renderTab(item))}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  half: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'stretch',
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    width: CENTER_WIDTH,
  },
});

export default CenteredTabBar;
