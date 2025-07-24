import { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, initializeFirebaseClient } from '@/firebase/client';

export const useFirebaseAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [firebaseReady, setFirebaseReady] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const initAuth = async () => {
      // Ensure Firebase is initialized
      const { auth: initializedAuth } = await initializeFirebaseClient();
      
      setFirebaseReady(true);
      
      if (!initializedAuth) {
        console.warn('Firebase auth not available');
        setLoading(false);
        setAuthInitialized(true);
        return;
      }

      // Set up auth state listener
      unsubscribe = onAuthStateChanged(initializedAuth, (currentUser) => {
        setUser(currentUser);
        setAuthInitialized(true);
        setLoading(false);
      });
    };

    initAuth();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  return {
    user,
    loading,
    authInitialized,
    firebaseReady,
    auth
  };
}; 