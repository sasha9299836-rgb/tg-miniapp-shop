import type { HTMLAttributes, ReactNode } from "react";
import "./Card.css";

type DivProps = HTMLAttributes<HTMLDivElement>;

export const Card = ({ className, ...props }: DivProps) => {
  return <div className={["ui-card", className].filter(Boolean).join(" ")} {...props} />;
};

export const CardTitle = ({ children, className }: { children: ReactNode; className?: string }) => {
  return <div className={["ui-card__title", className].filter(Boolean).join(" ")}>{children}</div>;
};

export const CardText = ({ children, className }: { children: ReactNode; className?: string }) => {
  return <div className={["ui-card__text", className].filter(Boolean).join(" ")}>{children}</div>;
};

export default Card;
