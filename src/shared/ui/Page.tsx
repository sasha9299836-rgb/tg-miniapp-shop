import type { ReactNode } from "react";
import "./page.css";

type PageProps = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
};

export const Page = ({ title, subtitle, children }: PageProps) => {
  return (
    <div className="ui-page">
      {title ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.4px" }}>
            {title}
          </div>
          {subtitle ? (
            <div style={{ marginTop: 6, opacity: 0.75, fontSize: 14, lineHeight: 1.3 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {children}
      </div>
    </div>
  );
};

export default Page;
