import "./ui.css";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({ variant = "primary", className = "", ...props }: Props) {
  return <button {...props} className={`btn btn--${variant} ${className}`} />;
}
