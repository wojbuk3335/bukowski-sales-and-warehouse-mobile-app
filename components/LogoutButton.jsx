import React, { useContext } from 'react';
import { TouchableOpacity, Text, View } from 'react-native';
import { GlobalStateContext } from '../context/GlobalState';

import { tc, useAppTheme } from '../context/ThemeContext'; // kolory zależne od motywu
const LogoutButton = ({ position = 'top-right', style = {} }) => {
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

  const defaultButtonStyle = {
    backgroundColor: "#dc3545",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  };

  const buttonStyle = {
    ...getPositionStyle(),
    ...defaultButtonStyle,
    ...style,
  };

  return (
    <TouchableOpacity
      onPress={handleLogout}
      style={buttonStyle}
    >
      <Text style={{ 
        fontSize: 12, 
        color: tc('text', "#fff"), 
        fontWeight: "bold",
        textAlign: 'center'
      }}>
        Wyloguj
      </Text>
    </TouchableOpacity>
  );
};

export default LogoutButton;