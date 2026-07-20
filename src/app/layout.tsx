import "./globals.css";
import Link from "next/link";

export const metadata = { title: "Zneration Invoices", description: "Invoice generator for Zneration Media" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b bg-white">
          <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
            <Link href="/invoices" className="font-semibold text-lg">Zneration Invoices</Link>
            <nav className="flex gap-4 text-sm items-center">
              <Link href="/quotations" className="hover:underline">Quotations</Link>
              <Link href="/invoices" className="hover:underline">Invoices</Link>
              <Link href="/receipts" className="hover:underline">Receipts</Link>
              <Link href="/clients" className="hover:underline">Clients</Link>
              <Link href="/invoices/new" className="bg-neutral-900 text-white px-3 py-1.5 rounded">+ Invoice</Link>
              <Link href="/quotations/new" className="border border-neutral-900 px-3 py-1.5 rounded">+ Quotation</Link>
              <Link href="/receipts/new" className="border border-neutral-900 px-3 py-1.5 rounded">+ Receipt</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
