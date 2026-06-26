'use client';

import React, { createContext, useContext } from 'react';

export interface UserType {
  id: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: string;
}

interface AuthContextType {
  user: UserType | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const login = async () => {};
  const register = async () => {};
  const logout = async () => {};
  const refreshUser = async () => {};

  return (
    <AuthContext.Provider
      value={{
        user: null,
        token: null,
        loading: false,
        login,
        register,
        logout,
        isAuthenticated: true,
        isAdmin: false,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    return {
      user: null,
      token: null,
      loading: false,
      login: async () => {},
      register: async () => {},
      logout: async () => {},
      isAuthenticated: true,
      isAdmin: false,
      refreshUser: async () => {},
    };
  }
  return context;
};
