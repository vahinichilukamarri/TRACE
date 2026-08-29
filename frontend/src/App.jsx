import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import CommandCenter from "@/pages/CommandCenter";
import RecoveryCases from "@/pages/RecoveryCases";
import CaseInvestigation from "@/pages/CaseInvestigation";
import Performance from "@/pages/Performance";
import PolicyControlCenter from "@/pages/PolicyControlCenter";

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<CommandCenter />} />
          <Route path="/cases" element={<RecoveryCases />} />
          <Route path="/cases/:paymentId" element={<CaseInvestigation />} />
          <Route path="/performance" element={<Performance />} />
          <Route path="/policy" element={<PolicyControlCenter />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
