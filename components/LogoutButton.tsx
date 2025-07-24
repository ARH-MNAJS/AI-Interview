"use client";

import { Button } from "@/components/ui/button";
import { signOut } from "firebase/auth";
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth";

const LogoutButton = () => {
  const { auth } = useFirebaseAuth();

  const handleLogout = async () => {
    try {
      // Clear server-side session
      await fetch("/api/auth/signout", { method: "POST" });
      // Clear client-side Firebase auth and redirect
      if (auth) {
        await signOut(auth);
      }
      window.location.href = "/sign-in";
    } catch (error) {
      console.error("Error signing out:", error);
      window.location.href = "/sign-in";
    }
  };

  return (
    <Button onClick={handleLogout} className="btn-secondary">
      Logout
    </Button>
  );
};

export default LogoutButton; 