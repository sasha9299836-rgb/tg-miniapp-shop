import type { InputHTMLAttributes } from "react";
import { Input } from "../Input";
import { normalizeFio } from "../../lib/formatFio";

type FioInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

export function FioInput({ value, onChange, ...rest }: FioInputProps) {
  return (
    <Input
      {...rest}
      value={value}
      onChange={(e) => onChange(normalizeFio(e.target.value))}
    />
  );
}

export default FioInput;
