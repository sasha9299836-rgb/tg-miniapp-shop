import { useEffect, useRef, useState } from "react";
import "./favorite-button.css";

type FavoriteButtonProps = {
  isActive: boolean;
  onToggle: () => void;
  className?: string;
  title?: string;
  ariaLabel?: string;
};

export function FavoriteButton({
  isActive,
  onToggle,
  className = "",
  title = "Избранное",
  ariaLabel = "Избранное",
}: FavoriteButtonProps) {
  const [isAnimated, setIsAnimated] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isActive) return;
    setIsAnimated(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setIsAnimated(false), 360);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [isActive]);

  return (
    <button
      type="button"
      className={`favorite-button ${isActive ? "is-on" : ""} ${isAnimated ? "is-animate" : ""} ${className}`.trim()}
      onClick={onToggle}
      aria-label={ariaLabel}
      title={title}
    >
      <svg className="favorite-button__icon" viewBox="0 0 24 24" aria-hidden>
        <path d="M16.4,4C14.6,4,13,4.9,12,6.3C11,4.9,9.4,4,7.6,4C4.5,4,2,6.5,2,9.6C2,14,12,22,12,22s10-8,10-12.4C22,6.5,19.5,4,16.4,4z" />
      </svg>
    </button>
  );
}

export default FavoriteButton;
