import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata = { title: "Zneration Hub", description: "Projects, clients, invoices and time for Zneration Media" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
