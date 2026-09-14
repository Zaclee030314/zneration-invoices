import { AuthGuard } from "@/components/AuthGuard";
import { WorkspaceProvider } from "@/lib/workspace";
import { TimerProvider } from "@/lib/timer";
import { Sidebar } from "@/components/shell/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <WorkspaceProvider>
        <TimerProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0 px-6 py-6 lg:px-8">{children}</main>
          </div>
        </TimerProvider>
      </WorkspaceProvider>
    </AuthGuard>
  );
}
