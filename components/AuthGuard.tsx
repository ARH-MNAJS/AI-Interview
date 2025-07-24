"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebase/client";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import LogoutButton from "@/components/LogoutButton";

interface AuthGuardProps {
  children: React.ReactNode;
  user?: any;
  isAuthorizedForGenerate?: boolean;
  isTPO?: boolean;
}

const AuthGuard = ({ children, user: serverUser, isAuthorizedForGenerate, isTPO }: AuthGuardProps) => {
  const pathname = usePathname();
  const [user, setUser] = useState<any>(serverUser);
  const [loading, setLoading] = useState(true);
  const [authInitialized, setAuthInitialized] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthInitialized(true);
      setLoading(false);

      // If user is authenticated and on auth pages, redirect to home
      if (currentUser && (pathname === "/sign-in" || pathname === "/sign-up")) {
        window.location.href = "/";
        return;
      }

      // If user is not authenticated and not on auth pages, redirect to sign-in
      if (!currentUser && pathname !== "/sign-in" && pathname !== "/sign-up") {
        window.location.href = "/sign-in";
        return;
      }
    });

    return () => unsubscribe();
  }, [pathname]);

  // Show loading while auth is being initialized
  if (loading || !authInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Loading...</h2>
        </div>
      </div>
    );
  }

  // Check if we're on an interview page (but not the interview list page)
  const isInterviewPage = pathname.startsWith("/interview/") && pathname !== "/interview";
  
  // For interview pages, render without navbar and root-layout class
  if (isInterviewPage) {
    return <>{children}</>;
  }

  // For all other pages, render with navbar and root-layout
  return (
    <div className="root-layout">
      <nav className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.svg" alt="MockMate Logo" width={38} height={32} />
          <h2 className="text-primary-100">CCInterview</h2>
        </Link>
        
        <div className="flex items-center gap-4">
          {isAuthorizedForGenerate && (
            <Button asChild className="btn-primary">
              <Link href="/generate">Generate Interview</Link>
            </Button>
          )}
          
          {isTPO && (
            <Button asChild className="btn-secondary">
              <Link href="/reports">Reports</Link>
            </Button>
          )}
          
          <LogoutButton />
        </div>
      </nav>

      {children}
    </div>
  );
};

export default AuthGuard; 