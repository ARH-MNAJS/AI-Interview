"use client";

import { createContext, useContext, useState, ReactNode } from 'react';

interface NavbarHoverContextType {
  hoveringButton: string | null;
  setHoveringButton: (button: string | null) => void;
}

const NavbarHoverContext = createContext<NavbarHoverContextType | undefined>(undefined);

export function NavbarHoverProvider({ children }: { children: ReactNode }) {
  const [hoveringButton, setHoveringButton] = useState<string | null>(null);

  return (
    <NavbarHoverContext.Provider value={{ hoveringButton, setHoveringButton }}>
      {children}
    </NavbarHoverContext.Provider>
  );
}

export function useNavbarHover() {
  const context = useContext(NavbarHoverContext);
  if (context === undefined) {
    throw new Error('useNavbarHover must be used within a NavbarHoverProvider');
  }
  return context;
}

