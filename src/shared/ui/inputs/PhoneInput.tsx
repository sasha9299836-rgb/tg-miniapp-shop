import { useRef } from "react";
import type { ChangeEvent, InputHTMLAttributes, KeyboardEvent } from "react";
import {
  countNationalDigitsBeforeCursor,
  cursorPosByNationalDigits,
  extractNationalDigits,
  formatRussianPhoneFromNationalDigits,
} from "../../lib/formatPhone";
import "../ui.css";

type PhoneInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

function removeDigitAt(value: string, index: number): string {
  if (index < 0 || index >= value.length) return value;
  return `${value.slice(0, index)}${value.slice(index + 1)}`;
}

export function PhoneInput({ value, onChange, onKeyDown, className, ...rest }: PhoneInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const nationalDigits = extractNationalDigits(value);
  const formattedValue = formatRussianPhoneFromNationalDigits(nationalDigits);

  const applyCaret = (nextFormatted: string, digitsBeforeCursor: number) => {
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      const caret = cursorPosByNationalDigits(nextFormatted, digitsBeforeCursor);
      input.setSelectionRange(caret, caret);
    });
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    const caret = event.target.selectionStart ?? raw.length;
    const digitsBeforeCursor = countNationalDigitsBeforeCursor(raw, caret);
    const nextDigits = extractNationalDigits(raw);
    const nextFormatted = formatRussianPhoneFromNationalDigits(nextDigits);
    onChange(nextFormatted);
    applyCaret(nextFormatted, digitsBeforeCursor);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (onKeyDown) onKeyDown(event);
    if (event.defaultPrevented) return;

    const input = inputRef.current;
    if (!input) return;

    const start = input.selectionStart ?? formattedValue.length;
    const end = input.selectionEnd ?? formattedValue.length;
    const hasSelection = end > start;

    if (hasSelection || (event.key !== "Backspace" && event.key !== "Delete")) {
      return;
    }

    const digitsBeforeCursor = countNationalDigitsBeforeCursor(formattedValue, start);
    const removeIndex = event.key === "Backspace" ? digitsBeforeCursor - 1 : digitsBeforeCursor;
    if (removeIndex < 0 || removeIndex >= nationalDigits.length) {
      return;
    }

    event.preventDefault();
    const nextDigits = removeDigitAt(nationalDigits, removeIndex);
    const nextFormatted = formatRussianPhoneFromNationalDigits(nextDigits);
    onChange(nextFormatted);
    applyCaret(nextFormatted, Math.max(0, removeIndex));
  };

  return (
    <input
      {...rest}
      ref={inputRef}
      className={`input ${className ?? ""}`}
      inputMode="tel"
      value={formattedValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
    />
  );
}

export default PhoneInput;
