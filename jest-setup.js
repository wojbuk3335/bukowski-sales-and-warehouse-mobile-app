// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock expo-constants
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    manifest: {},
    systemFonts: [],
    sessionId: 'test-session-id',
    platform: {
      ios: undefined,
      android: undefined,
    },
    isDevice: false,
  },
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
  }),
  router: {
    replace: jest.fn(),
    push: jest.fn(),
    back: jest.fn(),
  },
}));

// Mock tokenService
jest.mock('./services/tokenService', () => {
  const mockTokenService = {
    getTokens: jest.fn(() => Promise.resolve({ accessToken: null, refreshToken: null })),
    setTokens: jest.fn(() => Promise.resolve()),
    clearTokens: jest.fn(() => Promise.resolve()),
    parseJWT: jest.fn(() => null),
    isTokenExpiring: jest.fn(() => false),
    refreshAccessToken: jest.fn(() => Promise.resolve('mock-token')),
    getValidAccessToken: jest.fn(() => Promise.resolve('mock-token')),
    getAuthHeaders: jest.fn(() => Promise.resolve({
      'Authorization': 'Bearer mock-token',
      'Content-Type': 'application/json'
    })),
    authenticatedFetch: jest.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('{}')
    })),
    isAuthenticated: jest.fn(() => Promise.resolve(false)),
    logout: jest.fn(() => Promise.resolve()),
    setAutoLogoutCallback: jest.fn(),
    startAutoLogoutMonitoring: jest.fn(),
    performAutoLogout: jest.fn(() => Promise.resolve()),
    clearAutoLogoutTimer: jest.fn(),
    stopAutoLogoutMonitoring: jest.fn(),
  };
  return { __esModule: true, default: mockTokenService };
});

// Global cleanup for preventing memory leaks
global.beforeEach(() => {
  // Clear all timers
  jest.clearAllTimers();
});

global.afterEach(() => {
  // Clean up any pending timers only if fake timers are in use
  try {
    if (jest.isMockFunction(setTimeout)) {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    }
  } catch (e) {
    // Ignore if fake timers aren't active
  }
  
  // Clean up all mocks
  jest.clearAllMocks();
  
  // Clean up any open handles
  if (global.gc) {
    global.gc();
  }
});

// Increase timeout for slow tests
jest.setTimeout(30000);

// Ikony (Ionicons) - pakiet z czcionkami nie jest transformowany w jest; w testach zwykły element
jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  return function IoniconsMock() {
    return React.createElement('Ionicons');
  };
});
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const Icon = () => React.createElement('Ionicons');
  return { Ionicons: Icon, MaterialIcons: Icon, FontAwesome: Icon, MaterialCommunityIcons: Icon };
});
