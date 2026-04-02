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
        <div className="ui-page__heading">
          <div className="ui-page__title">
            {title}
          </div>
          {subtitle ? (
            <div className="ui-page__subtitle">
              {subtitle}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="ui-page__body">
        {children}
      </div>
    </div>
  );
};

export default Page;
