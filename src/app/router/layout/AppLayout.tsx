import { Outlet } from "react-router-dom";
import { TabBar } from "../../../widgets/TabBar";
import "./AppLayout.css";

export const AppLayout = () => {
  return (
    <div className="app-shell">
      <main className="app-content">
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
};

export default AppLayout;
