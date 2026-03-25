import type { KeyboardEvent, ReactNode } from "react";
import "./ListItem.css";

type ListItemProps = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  divider?: boolean;

  /** Position in group for rounded corners */
  position?: "single" | "first" | "middle" | "last";
};

export const ListItem = ({
  title,
  subtitle,
  right,
  onClick,
  chevron = true,
  divider = true,
  position = "middle",
}: ListItemProps) => {
  const clickable = Boolean(onClick);
  const normalizedPosition = position === "first" && !divider ? "single" : position;

  const posClass =
    normalizedPosition === "single"
      ? "ui-li--first ui-li--last"
      : normalizedPosition === "first"
        ? "ui-li--first"
        : normalizedPosition === "last"
          ? "ui-li--last"
          : "";

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!clickable || !onClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={`ui-li ${posClass} ${clickable ? "ui-li--click" : ""}`}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={onKeyDown}
    >
      <div className="ui-li__body">
        <div className="ui-li__title">{title}</div>
        {subtitle ? <div className="ui-li__subtitle">{subtitle}</div> : null}
      </div>

      <div className="ui-li__right">
        {right ? <div className="ui-li__rightContent">{right}</div> : null}
        {chevron ? <div className="ui-li__chevron">{">"}</div> : null}
      </div>

      {divider ? <div className="ui-li__divider" /> : null}
    </div>
  );
};

export default ListItem;
