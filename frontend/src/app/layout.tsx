import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#FFD3AC] text-black min-h-screen">
        <main>{children}</main>
      </body>
    </html>
  );
}