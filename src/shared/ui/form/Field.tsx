import type { ReactNode } from "react";

type Props = {
  label: string;
  children: ReactNode;
};

export function Field({ label, children }: Props) {
  return (
    <label style={{ display: "grid", gap: 8 }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

