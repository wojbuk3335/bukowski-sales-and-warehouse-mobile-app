import React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";
import { KeyboardSafeScreen, KeyboardSafeOverlay } from "../../components/KeyboardSafe";

describe("KeyboardSafe", () => {
  test("ekran renderuje dzieci wewnątrz KeyboardAvoidingView", () => {
    const { getByText, UNSAFE_getByType } = render(
      <KeyboardSafeScreen><Text>pole</Text></KeyboardSafeScreen>
    );
    expect(getByText("pole")).toBeTruthy();
    const { KeyboardAvoidingView } = require("react-native");
    const kav = UNSAFE_getByType(KeyboardAvoidingView);
    expect(["padding", "height"]).toContain(kav.props.behavior);
  });

  test("okienko podnosi się nad klawiaturę (padding) i renderuje dzieci", () => {
    const { getByText, UNSAFE_getByType } = render(
      <KeyboardSafeOverlay><Text>okienko</Text></KeyboardSafeOverlay>
    );
    expect(getByText("okienko")).toBeTruthy();
    const { KeyboardAvoidingView } = require("react-native");
    expect(UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe("padding");
  });
});
