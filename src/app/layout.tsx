import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "cyrillic"] });
const mono = JetBrains_Mono({ variable: "--font-jb-mono", subsets: ["latin", "cyrillic"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Study RAG",
  description: "Разметка учебных документов агентами и RAG по ним",
};

// выбранная тема ставится до первой отрисовки, без вспышки
const THEME = `try{var t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" suppressHydrationWarning className={`${inter.variable} ${mono.variable} h-full antialiased`}>
      <head>
        <script
          type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME }}
        />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
