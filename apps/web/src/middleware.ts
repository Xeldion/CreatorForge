import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Route protection middleware.
 *
 * All /dashboard/* routes require authentication.
 * Unauthenticated users are redirected to /signin.
 */

export default auth((req) => {
  const isAuthenticated = !!req.auth?.user;
  const isDashboardRoute = req.nextUrl.pathname.startsWith("/dashboard");
  const isSignInRoute = req.nextUrl.pathname === "/signin";
  const isApiAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");

  // Allow auth API routes to pass through (handled by NextAuth)
  if (isApiAuthRoute) return NextResponse.next();

  // Redirect authenticated users away from sign-in
  if (isAuthenticated && isSignInRoute) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Redirect unauthenticated users to sign-in
  if (!isAuthenticated && isDashboardRoute) {
    const signInUrl = new URL("/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/signin", "/api/auth/:path*"],
};
