"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import LogoutButton from "@/components/LogoutButton";
import { NavbarHoverProvider, useNavbarHover } from "@/contexts/NavbarHoverContext";

interface AuthGuardProps {
  children: React.ReactNode;
  user?: any;
  isAuthorizedForGenerate?: boolean;
  isTPO?: boolean;
}

const AuthGuard = ({ children, user: serverUser, isAuthorizedForGenerate, isTPO }: AuthGuardProps) => {
  const pathname = usePathname();
  const { user: clientUser, loading, authInitialized, firebaseReady } = useFirebaseAuth();
  
  // Use server user as fallback if client user is not available
  const user = clientUser || serverUser;

  useEffect(() => {
    if (!authInitialized || !firebaseReady) return;

    // If user is authenticated and on auth pages, redirect to home
    if (user && (pathname === "/sign-in" || pathname === "/sign-up")) {
      window.location.href = "/";
      return;
    }

    // If user is not authenticated and not on auth pages, redirect to sign-in
    if (!user && pathname !== "/sign-in" && pathname !== "/sign-up") {
      window.location.href = "/sign-in";
      return;
    }
  }, [user, pathname, authInitialized, firebaseReady]);

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
    <NavbarHoverProvider>
      <AuthGuardInner 
        isAuthorizedForGenerate={isAuthorizedForGenerate}
        isTPO={isTPO}
      >
        {children}
      </AuthGuardInner>
    </NavbarHoverProvider>
  );
};

function AuthGuardInner({ 
  children, 
  isAuthorizedForGenerate, 
  isTPO 
}: { 
  children: React.ReactNode;
  isAuthorizedForGenerate: boolean;
  isTPO: boolean;
}) {
  const { setHoveringButton } = useNavbarHover();

  return (
    <>
      <nav className="flex items-center justify-between mx-auto max-w-7xl py-4 px-4">
                <Link href="/" className="flex items-center gap-2">
                  <Image
                    src="/cclogo.png"
                    alt="Campus Credentials Logo"
                    width={180}
                    height={32}
                    className="object-contain"
                  />
                </Link>
        
        <div className="flex items-center gap-4">
          {isAuthorizedForGenerate && (
            <Link href="/generate">
              <button 
                className="px-6 py-2.5 bg-gradient-to-r from-[#b8b3f5] to-[#d4d0fc] hover:from-[#cac5fe] hover:to-[#e0dcff] text-dark-100 font-bold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                onMouseEnter={() => setHoveringButton('generate')}
                onMouseLeave={() => setHoveringButton(null)}
              >
                Generate Interview
              </button>
            </Link>
          )}
          
          {isTPO && (
            <Link href="/reports">
              <button 
                className="px-6 py-2.5 bg-[#27282f]/80 border border-white/10 hover:border-[#cac5fe]/50 text-light-100 hover:text-white font-semibold rounded-xl transition-all duration-200 hover:bg-[#27282f]"
                onMouseEnter={() => setHoveringButton('reports')}
                onMouseLeave={() => setHoveringButton(null)}
              >
                Reports
              </button>
            </Link>
          )}
          
          <div
            onMouseEnter={() => setHoveringButton('logout')}
            onMouseLeave={() => setHoveringButton(null)}
          >
            <LogoutButton />
          </div>
        </div>
      </nav>

      <div className="root-layout">
        {children}
      </div>
    </>
  );
}

export default AuthGuard; 