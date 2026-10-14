import React, { useContext } from 'react';
import { TouchableOpacity, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GlobalStateContext } from '../context/GlobalState';

import { useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
// compact: sam kafelek z ikoną (w nagłówku zakładki, obok tytułu)
const LogoutButton = ({ position = 'top-right', style = {}, compact = false }) => {
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const { user, logout } = useContext(GlobalStateContext);

  const handleLogout = async () => {
    await logout();
  };

  const getPositionStyle = () => {
    switch(position) {
      case 'top-right':
        return {
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 1000,
        };
      case 'top-left':
        return {
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 1000,
        };
      case 'bottom-right':
        return {
          position: 'absolute',
          bottom: 10,
          right: 10,
          zIndex: 1000,
        };
      case 'inline':
        return {};
      default:
        return {
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 1000,
        };
    }
  };

  // Wygląd jak w panelu admina: kafelek z ikoną, delikatne czerwone tło i ramka
  const defaultButtonStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  };

  const buttonStyle = {
    ...getPositionStyle(),
    ...defaultButtonStyle,
    ...(compact ? { width: 40, height: 40, paddingHorizontal: 0, paddingVertical: 0, justifyContent: 'center' } : {}),
    ...style,
  };

  return (
    <TouchableOpacity
      onPress={handleLogout}
      style={buttonStyle}
      accessibilityLabel="Wyloguj"
    >
      <Ionicons name="log-out-outline" size={compact ? 20 : 18} color="#EF4444" />
      {!compact && <Text style={{
        fontSize: 13,
        color: '#EF4444',
        fontWeight: "700",
        textAlign: 'center'
      }}>
        Wyloguj
      </Text>}
    </TouchableOpacity>
  );
};

export default LogoutButton;