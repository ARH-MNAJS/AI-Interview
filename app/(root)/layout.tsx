import Link from "next/link";
import Image from "next/image";
import { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { getCurrentUser, checkTPOAccess } from "@/lib/actions/auth.action";
import AuthGuard from "@/components/AuthGuard";
import LogoutButton from "@/components/LogoutButton";

interface LayoutProps {
  children: ReactNode;
}

const Layout = async ({ children }: LayoutProps) => {
  // Get user from server-side session
  const user = await getCurrentUser();

  // If no user, let AuthGuard handle it
  if (!user) {
    return <AuthGuard>{children}</AuthGuard>;
  }

  // Check permissions
  const isAuthorizedForGenerate = user.id === "i0bZW01fAeMaiqm2WSOKxFxwTAx2";
  const collegeId = await checkTPOAccess(user.id);
  const isTPO = !!collegeId;

  return (
    <AuthGuard 
      user={user} 
      isAuthorizedForGenerate={isAuthorizedForGenerate} 
      isTPO={isTPO}
    >
      {children}
    </AuthGuard>
  );
};



export default Layout;
