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
  const displayValue = value ? formatDateTimeLocalForDisplay(value) : placeholder;
  const isPlaceholder = !value;
  const inputId = id ?? name;

  return (
    <label className="admin-datetime-field" htmlFor={inputId}>
      {label ? <span className="admin-datetime-field__label">{label}</span> : null}
      <span className="admin-datetime-shell">
        <span className={`admin-datetime-shell__value${isPlaceholder ? " admin-datetime-shell__value--placeholder" : ""}`}>
          {displayValue}
        </span>
        <input
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

