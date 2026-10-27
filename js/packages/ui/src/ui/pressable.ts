import type { KeyboardEvent } from "react";

/** Props that make a row, list item or shape work like a button: in the Tab order, and Enter or Space runs it. Rows and list items keep their role. */
export function pressable(onPress: () => void, role?: string) {
  return {
    ...(role ? { role } : {}),
    tabIndex: 0,
    onClick: onPress,
    onKeyDown: (e: KeyboardEvent) => {
      // A link or button inside the row handles its own keys.
      if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      onPress();
    },
  };
}
