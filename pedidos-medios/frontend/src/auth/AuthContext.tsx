import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserProfile } from './types';
import { getMyAccess, isApproved, isAdmin, isTeamOrAdmin, isObserver, signOut as authSignOut } from '../services/auth';
import { getSupabaseClient } from '../services/supabaseClient';

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isApproved: boolean;
  isAdmin: boolean;
  isTeamOrAdmin: boolean;
  isObserver: boolean;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isApproved: false,
  isAdmin: false,
  isTeamOrAdmin: false,
  isObserver: false,
  refreshUser: async () => {},
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    try {
      const res = await getMyAccess();
      if (res.success && res.data) {
        setUser(res.data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();

    try {
      const supabase = getSupabaseClient();
      const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          refreshUser();
        } else {
          setUser(null);
          setIsLoading(false);
        }
      });

      return () => {
        authListener?.subscription?.unsubscribe();
      };
    } catch {
      // Ignorar fallo de cliente en entornos de test sin Supabase
    }
  }, []);

  const handleSignOut = async () => {
    await authSignOut();
    setUser(null);
  };

  const approved = isApproved(user);
  const admin = isAdmin(user);
  const teamOrAdmin = isTeamOrAdmin(user);
  const observer = isObserver(user);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isApproved: approved,
        isAdmin: admin,
        isTeamOrAdmin: teamOrAdmin,
        isObserver: observer,
        refreshUser,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
