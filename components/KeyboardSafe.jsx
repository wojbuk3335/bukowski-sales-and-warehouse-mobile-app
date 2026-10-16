import React, { useCallback, useRef } from "react";
import { KeyboardAvoidingView, Platform, findNodeHandle } from "react-native";

/**
 * Klawiatura nie zasłania pola tekstowego - wspólne opakowania dla całej aplikacji.
 *
 * Tryb „pan” z app.json bywa ignorowany na Androidzie (rysowanie od krawędzi do krawędzi w SDK 54),
 * a iOS nigdy sam nie przesuwa ekranu nad klawiaturę - każdy ekran i każde okienko musi zrobić
 * miejsce na klawiaturę samo.
 *
 * Ekran:
 *   <SafeAreaView style={{ flex: 1 }}>
 *     <KeyboardSafeScreen>
 *       <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>…</ScrollView>
 *     </KeyboardSafeScreen>
 *   </SafeAreaView>
 *
 * Okienko (Modal z przyciemnionym tłem):
 *   <Modal transparent …>
 *     <KeyboardSafeOverlay>
 *       <View style={look.modalOverlay}><View style={look.modalContent}>…</View></View>
 *     </KeyboardSafeOverlay>
 *   </Modal>
 */
export const KeyboardSafeScreen = ({ children, style, offset = 0 }) => (
  <KeyboardAvoidingView
    style={[{ flex: 1 }, style]}
    behavior={Platform.OS === "ios" ? "padding" : "height"}
    keyboardVerticalOffset={offset}
  >
    {children}
  </KeyboardAvoidingView>
);

// Okienko leży nad ekranem (własne okno systemowe) - ustawienie ekranu go nie obejmuje,
// dlatego tło okienka samo kurczy się nad klawiaturą i okienko wędruje do góry
export const KeyboardSafeOverlay = ({ children, style }) => (
  <KeyboardAvoidingView style={[{ flex: 1 }, style]} behavior="padding">
    {children}
  </KeyboardAvoidingView>
);

/**
 * Pole z rozwijaną listą podpowiedzi pod spodem: po kliknięciu przewijamy JEDNYM ruchem tak, żeby nad
 * klawiaturą zmieściło się pole RAZEM z listą (spaceBelow = wysokość listy). Bez tego pole ląduje tuż nad
 * klawiaturą, a rozwinięta lista wpada pod klawiaturę albo ekran skacze.
 *
 *   const { scrollRef, revealWithSpace } = useRevealInput();
 *   const inputRef = useRef(null);
 *   <ScrollView ref={scrollRef} …>
 *     <TextInput ref={inputRef} onFocus={() => revealWithSpace(inputRef, 220)} … />
 */
export const useRevealInput = () => {
  const scrollRef = useRef(null);

  const revealWithSpace = useCallback((inputRef, spaceBelow = 220) => {
    // Android: klawiatura i zmiana rozmiaru ekranu dochodzą chwilę po fokusie
    setTimeout(() => {
      const scroll = scrollRef.current;
      const input = inputRef?.current;
      if (!scroll || !input) return;
      const node = findNodeHandle(input);
      const responder = scroll.getScrollResponder ? scroll.getScrollResponder() : scroll;
      if (node && responder?.scrollResponderScrollNativeHandleToKeyboard) {
        responder.scrollResponderScrollNativeHandleToKeyboard(node, spaceBelow, true);
      }
    }, Platform.OS === "android" ? 300 : 80);
  }, []);

  return { scrollRef, revealWithSpace };
};

export default KeyboardSafeScreen;
