import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import Landing from "@/pages/Landing";
import CommandCenter from "@/pages/CommandCenter";
import RecoveryCases from "@/pages/RecoveryCases";
import CaseInvestigation from "@/pages/CaseInvestigation";
import Performance from "@/pages/Performance";
import PolicyControlCenter from "@/pages/PolicyControlCenter";

/**
 * The landing page renders WITHOUT the app chrome -- no sidebar, no run
 * selector -- so it is deliberately outside AppShell rather than inside it
 * with the shell conditionally hidden.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="*"
          element={
            <AppShell>
              <Routes>
                <Route path="/dashboard" element={<CommandCenter />} />
                <Route path="/cases" element={<RecoveryCases />} />
                <Route path="/cases/:paymentId" element={<CaseInvestigation />} />
                <Route path="/performance" element={<Performance />} />
                <Route path="/policy" element={<PolicyControlCenter />} />
              </Routes>
            </AppShell>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
