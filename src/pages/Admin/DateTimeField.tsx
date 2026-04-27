import { useRef } from "react";
import "./datetime-controls.css";

type AdminDateTimeFieldProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
};

function formatDateTimeLocalForDisplay(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return value.replace("T", " ");
  const [, y, m, d, hh, mm] = match;
  return `${d}.${m}.${y} ${hh}:${mm}`;
}

export function AdminDateTimeField({
  value,
  onChange,
  label,
  placeholder = "Выберите дату и время",
  disabled,
  id,
  name,
}: AdminDateTimeFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const displayValue = value ? formatDateTimeLocalForDisplay(value) : placeholder;
  const isPlaceholder = !value;
  const inputId = id ?? name;

  const onOpenPicker = () => {
    if (disabled) return;
    const input = inputRef.current;
    if (!input) return;
    try {
      const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
      pickerInput.showPicker?.();
    } catch {
      // no-op: fallback below
    }
    input.focus({ preventScroll: true });
    input.click();
  };

  return (
    <label className="admin-datetime-field" htmlFor={inputId}>
      {label ? <span className="admin-datetime-field__label">{label}</span> : null}
      <span className="admin-datetime-shell" onClick={onOpenPicker}>
        <span className={`admin-datetime-shell__value${isPlaceholder ? " admin-datetime-shell__value--placeholder" : ""}`}>
          {displayValue}
        </span>
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="datetime-local"
          value={value}
          className="admin-datetime-shell__native"
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-label={label ?? placeholder}
        />
      </span>
    </label>
  );
}
