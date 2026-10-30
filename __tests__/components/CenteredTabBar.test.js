import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import CenteredTabBar from '../../components/CenteredTabBar';

// Pasek zakładek (30.10.2026): „+” zawsze na środku - zakładki przed nim w lewej połowie, za nim w prawej;
// schowana zakładka (Cudzich u innych punktów) nie zajmuje miejsca.

const NAMES = ['home', 'writeoff', 'search', 'create', 'cudzych', 'profile', 'remanent'];
const setup = ({ hideCudzich = false, index = 0 } = {}) => {
  const routes = NAMES.map((name) => ({ key: `${name}-key`, name }));
  const descriptors = Object.fromEntries(routes.map((route) => [route.key, {
    options: {
      title: route.name,
      tabBarIcon: ({ focused }) => <Text>{`${route.name}${focused ? '*' : ''}`}</Text>,
      ...(route.name === 'cudzych' && hideCudzich ? { tabBarItemStyle: { display: 'none' } } : {}),
    },
  }]));
  const navigation = { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() };
  const screen = render(
    <CenteredTabBar state={{ index, routes }} descriptors={descriptors} navigation={navigation} activeTintColor="#00f" inactiveTintColor="#999" />
  );
  return { screen, navigation };
};
const halves = (screen) => screen.getByTestId('centered-tab-bar').props.children;
const namesIn = (half) => [].concat(half.props.children).map((child) => child.props.testID);

test('6 przycisków (bez Cudzicha): 3 z lewej, „+” w środku, 2 z prawej - „+” na środku ekranu', () => {
  const { screen } = setup({ hideCudzich: true });
  const [left, center, right] = halves(screen);
  expect(namesIn(left)).toEqual(['tab-home', 'tab-writeoff', 'tab-search']);
  expect(center.props.testID).toBe('tab-create');
  expect(namesIn(right)).toEqual(['tab-profile', 'tab-remanent']);
  expect(StyleSheet.flatten(left.props.style).flex).toBe(1);
  expect(StyleSheet.flatten(right.props.style).flex).toBe(1); // obie połowy równe - środek zawsze w środku
  expect(screen.queryByTestId('tab-cudzych')).toBeNull();
});

test('7 przycisków (Parzygnat): 3 + „+” + 3', () => {
  const { screen } = setup();
  const [left, , right] = halves(screen);
  expect(namesIn(left)).toHaveLength(3);
  expect(namesIn(right)).toEqual(['tab-cudzych', 'tab-profile', 'tab-remanent']);
});

test('stuknięcie: zdarzenie tabPress i przejście; aktywna zakładka - tylko zdarzenie (odświeżenie ekranu w układzie)', () => {
  const { screen, navigation } = setup({ index: 0 });
  fireEvent.press(screen.getByTestId('tab-search'));
  expect(navigation.emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'search-key', canPreventDefault: true });
  expect(navigation.navigate).toHaveBeenCalledWith('search', undefined);

  navigation.navigate.mockClear();
  fireEvent.press(screen.getByTestId('tab-home'));
  expect(navigation.navigate).not.toHaveBeenCalled();
  expect(screen.getByText('home*')).toBeTruthy();
});
