import type { Metadata } from 'next';
import { Inter, Oswald } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const oswald = Oswald({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-oswald',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Survivor Pick'em",
  description: 'Weekly Survivor predictions, standings, and season archives.',
};

const NAV = [
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/episodic-picks', label: 'Make Picks' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${oswald.variable} ${inter.variable}`}>
      <body>
        <header className="masthead">
          <div className="masthead__inner">
            <Link href="/" className="wordmark">
              <img src="/icon.svg" alt="" className="wordmark__icon" />
              <span className="wordmark__text">
                Survivor <span>Pick&rsquo;em</span>
              </span>
            </Link>
            <nav className="nav">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="footer">
          <div className="footer__inner">
            <span>Outwit &middot; Outplay &middot; Outlast</span>
            <span className="footer__links">
              <Link href="/archive">Archive</Link>
              <Link href="/admin">Admin</Link>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
