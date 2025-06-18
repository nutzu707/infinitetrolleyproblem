import type { Metadata } from "next";
import { Chewy } from "next/font/google";
import "./globals.css";

const chewy = Chewy({
  variable: "--font-chewy",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Absurd AI Trolley Problems",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${chewy.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
