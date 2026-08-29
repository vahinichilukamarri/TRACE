import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-bone">
      <Sidebar />
      <div className="pl-60">
        <Topbar title={title} subtitle={subtitle} />
        <main className="px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
