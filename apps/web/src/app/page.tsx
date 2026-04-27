import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center space-y-8">
        <h1 className="text-5xl font-bold tracking-tight">
          CreatorForge
        </h1>
        <p className="text-xl text-muted-foreground">
          Replace vidIQ + TubeBuddy with one platform.
          <br />
          Strategy. Testing. Analytics. Together.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/signin"
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-500 transition-colors"
          >
            Connect Your YouTube Channel
          </Link>
          <Link
            href="/signin"
            className="inline-flex items-center justify-center rounded-lg border px-6 py-3 text-sm font-medium hover:bg-muted transition-colors"
          >
            Sign In
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          Free 14-day trial. $19/month after.
        </p>
      </div>
    </main>
  );
}
