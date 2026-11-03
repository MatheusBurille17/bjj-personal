import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Jiu-Jitsu App — gestão para professores",
    template: "%s · Jiu-Jitsu App",
  },
  description:
    "Planejamento, agenda, biblioteca de técnicas e acompanhamento de alunos para professores particulares de Jiu-Jitsu.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#323a2a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
