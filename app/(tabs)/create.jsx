import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useRenderTiming } from '../../services/tabTiming'; // pomiar przerysowania zakładki
import React, { useEffect, useRef, useState } from "react";
import { Animated, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { GlobalStateContext } from "../../context/GlobalState";
import QRScanner from "../QRScanner";
import LogoutButton from "../../components/LogoutButton";
import { ModalHeader, look } from "../../components/AdminLook";
import tokenService from "../../services/tokenService";
import { getApiUrl } from "../../config/api";
import Logger from "../../services/logger";

import { tc, createThemedStyles, useAppTheme } from '../../context/ThemeContext'; // kolory zależne od motywu
export default function Create() {
  useRenderTiming('create'); // pomiar przerysowania (31.10.2026)
  useAppTheme(); // przerysowanie ekranu po zmianie motywu
  const { 
    stateData, 
    user, 
    sizes, 
    colors, 
    goods, 
    stocks,
    users,
    bags,
    wallets,
    ensureData,
    isDataFresh,
    getFilteredSellingPoints
  } = React.useContext(GlobalStateContext);

  // Zbiory potrzebne do sprzedaży; przy kolejnych wejściach na zakładkę pobierane tylko, gdy nieświeże
  const REQUIRED_DATA = ['sizes', 'colors', 'goods', 'stocks', 'state', 'users', 'bags', 'wallets'];
  
  const isFocused = useIsFocused();
  const [isLoading, setIsLoading] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [currencyRates, setCurrencyRates] = useState([]);
  
  // Animacje dla kropek ładowania
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;
  const spinnerAnim = useRef(new Animated.Value(0)).current;

  // Animacja kropek
  useEffect(() => {
    if (isLoading) {
      const animateDots = () => {
        const createDotAnimation = (animValue, delay) => {
          return Animated.loop(
            Animated.sequence([
              Animated.delay(delay),
              Animated.timing(animValue, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
              }),
              Animated.timing(animValue, {
                toValue: 0,
                duration: 400,
                useNativeDriver: true,
              }),
            ])
          );
        };

        Animated.parallel([
          createDotAnimation(dot1Anim, 0),
          createDotAnimation(dot2Anim, 200),
          createDotAnimation(dot3Anim, 400),
        ]).start();
      };

      // Animacja spinnera
      const animateSpinner = () => {
        Animated.loop(
          Animated.timing(spinnerAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          })
        ).start();
      };

      animateDots();
      animateSpinner();
    } else {
      // Reset animacji gdy loading się skończy
      dot1Anim.setValue(0);
      dot2Anim.setValue(0);
      dot3Anim.setValue(0);
      spinnerAnim.setValue(0);
    }
  }, [isLoading]);

  const fetchAllRequiredData = async () => {
    setErrorMessage("");
    setShowErrorModal(false);

    // Pełnoekranowe „Ładowanie” (które odmontowuje i montuje od nowa skaner) tylko, gdy czegoś naprawdę brakuje.
    // Wcześniej każde wejście na zakładkę „+” to 9 pełnych pobrań i ekran ładowania, choć dane były te same.
    const needsLoading = !isDataFresh(REQUIRED_DATA);
    if (needsLoading) {
      setIsLoading(true);
      // Add a small delay to ensure the loading state renders before starting API calls
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Set up a 10-second timeout for the entire operation (sprzątany po zakończeniu - nie zostaje wiszący timer)
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Timeout - backend nie odpowiada po 10 sekundach'));
      }, 10000);
    });

    try {
      // Fetch currency rates
      const fetchCurrencyRates = async () => {
        try {
          const response = await tokenService.authenticatedFetch(getApiUrl('/currency-rates'));
          if (response && response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
              setCurrencyRates(data.data);
            }
          }
        } catch (error) {
          Logger.error('Error fetching currency rates:', error);
        }
      };

      // Race between data fetching and timeout
      const dataPromise = Promise.all([
        ensureData(REQUIRED_DATA),
        fetchCurrencyRates()
      ]);

      await Promise.race([
        dataPromise,
        timeoutPromise
      ]);
    } catch (error) {
      
      if (error.message.includes('Timeout') || error.message.includes('timeout')) {
        setErrorMessage("Backend nie odpowiada. Upłynął limit czasu 10 sekund. Sprawdź połączenie internetowe i spróbuj ponownie.");
      } else {
        setErrorMessage("Nie można pobrać danych z backendu. Sprawdź połączenie internetowe i spróbuj ponownie.");
      }
      
      setShowErrorModal(true);
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  // Pobierz dane przy każdym wejściu w zakładkę
  useFocusEffect(
    React.useCallback(() => {
      fetchAllRequiredData();
      
      return () => {
        // Cleanup when tab unfocused
      };
    }, [])
  );

  const handleRetry = () => {
    setShowErrorModal(false);
    fetchAllRequiredData();
  };

  const handleCloseError = () => {
    setShowErrorModal(false);
  };

  return (
    <>
      <LogoutButton position="top-right" />
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <View style={styles.spinnerContainer}>
            <Animated.View
              style={[
                styles.customSpinner,
                {
                  transform: [{
                    rotate: spinnerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '360deg'],
                    }),
                  }],
                },
              ]}
            />
          </View>
          <Text style={styles.loadingText}>Pobieranie danych z backendu...</Text>
          <View style={styles.loadingDots}>
            <Animated.View 
              style={[
                styles.dot, 
                {
                  opacity: dot1Anim,
                  transform: [{ 
                    scale: dot1Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1.2],
                    }) 
                  }],
                }
              ]} 
            />
            <Animated.View 
              style={[
                styles.dot, 
                {
                  opacity: dot2Anim,
                  transform: [{ 
                    scale: dot2Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1.2],
                    }) 
                  }],
                }
              ]} 
            />
            <Animated.View 
              style={[
                styles.dot, 
                {
                  opacity: dot3Anim,
                  transform: [{ 
                    scale: dot3Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1.2],
                    }) 
                  }],
                }
              ]} 
            />
          </View>
        </View>
      ) : (
        <QRScanner
          stateData={stateData}
          user={user}
          sizes={sizes}
          colors={colors}
          goods={goods}
          stocks={stocks}
          users={users}
          bags={bags}
          wallets={wallets}
          currencyRates={currencyRates}
          getFilteredSellingPoints={getFilteredSellingPoints}
          isActive={isFocused}
        />
      )}

      {/* Modal błędu */}
      <Modal
        visible={showErrorModal}
        transparent
        animationType="slide"
        onRequestClose={handleCloseError}
      >
        <View style={look.modalOverlay}>
          <View style={look.modalContent}>
            <ModalHeader icon="cloud-offline" color="#DC3545" title="Błąd połączenia" />
            <Text style={look.modalMessage}>{errorMessage}</Text>
            <TouchableOpacity
              style={[look.primaryButton, { flex: 0 }]}
              onPress={handleRetry}
            >
              <Text style={look.buttonText}>Spróbuj ponownie</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[look.neutralButton, { flex: 0, marginTop: 8 }]}
              onPress={handleCloseError}
            >
              <Text style={look.neutralButtonText}>Zamknij</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = createThemedStyles(() => StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tc('bg', 'black'), // Ciemne tło
  },
  spinnerContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    width: 80,
    height: 80,
  },
  customSpinner: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderWidth: 3,
    borderColor: 'transparent',
    borderTopColor: '#0066cc',
    borderRightColor: '#0066cc',
    borderRadius: 30,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    color: tc('text', '#ffffff'), // Biały tekst na ciemnym tle
    textAlign: 'center',
    fontWeight: '500',
  },
  loadingDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgb(13, 110, 253)',
    marginHorizontal: 6,
  },
  // Unified modal styles from search.jsx
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: tc('surface', 'black'),
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    width: '70%',
    color: tc('text', '#fff'),
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
    color: tc('text', '#fff'),
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 14,
    color: tc('text', '#fff'),
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  optionButton: {
    backgroundColor: '#0d6efd',
    padding: 8,
    borderRadius: 8,
    marginVertical: 6,
    width: '90%',
    alignItems: 'center',
  },
  optionText: {
    fontSize: 14,
    color: '#fff',
  },
  closeButton: {
    backgroundColor: 'red',
  },
  closeText: {
    color: tc('text', 'white'),
    fontSize: 14,
  },
}));