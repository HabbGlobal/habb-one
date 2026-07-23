import Link from "next/link";
import Image from "next/image";

export function PublicHeader() {
  return (
    <header className="border-b border-habb-line bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/brand/habb-logo.png"
            alt="HABB One"
            width={32}
            height={32}
            className="h-8 w-auto"
          />
          <span className="text-base font-semibold tracking-tight">
            HABB One
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/#features"
            className="hidden text-habb-muted hover:text-habb-ink sm:inline"
          >
            Features
          </Link>
          <Link
            href="/#time-tracking"
            className="hidden text-habb-muted hover:text-habb-ink sm:inline"
          >
            Time Tracking
          </Link>
          <Link href="/pricing" className="font-medium text-habb-ink">
            Pricing
          </Link>
          <Link href="/login" className="text-habb-muted hover:text-habb-ink">
            Login
          </Link>
          <Link
            href="/register"
            className="hidden sm:inline-flex items-center gap-1 rounded-md bg-habb-black px-3 py-1.5 text-xs font-medium text-white hover:bg-habb-ink"
          >
            Start Trial
          </Link>
        </nav>
      </div>
    </header>
  );
}
