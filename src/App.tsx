import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionProvider, useSession } from "@/lib/session";
import { AccessGate } from "@/components/AccessGate";
import { UserPicker } from "@/components/UserPicker";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import Home from "./pages/Home";
import PlanUpload from "./pages/PlanUpload";
import Logger from "./pages/Logger";
import Calendar from "./pages/Calendar";
import Stats from "./pages/Stats";
import Library from "./pages/Library";
import Plan from "./pages/Plan";
import ActivityLogger from "./pages/ActivityLogger";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function GatedRoutes() {
  const { unlocked, user, loading } = useSession();
  if (loading) return null;
  if (!unlocked) return <AccessGate />;
  if (!user) return <UserPicker />;
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/home" element={<Home />} />
      <Route path="/plan" element={<Plan />} />
      <Route path="/plan/upload" element={<PlanUpload />} />
      <Route path="/log/new" element={<Logger />} />
      <Route path="/log/activity" element={<ActivityLogger />} />
      <Route path="/log/:id" element={<Logger />} />
      <Route path="/calendar" element={<Calendar />} />
      <Route path="/stats" element={<Stats />} />
      <Route path="/library" element={<Library />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SessionProvider>
          <ConfirmProvider>
            <GatedRoutes />
          </ConfirmProvider>
        </SessionProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
