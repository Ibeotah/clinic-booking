import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface AuthContextType {
  user: User | null;
  role: string;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Reads the role saved on the account: {"role": "admin"}
 */
export function getRole(user: User | null): string {
  return (user?.user_metadata?.role ?? "").trim().toLowerCase();
}

/**
 * Determines which dashboard path a role should open
 */
export function homePath(role: string): string {
  if (role === "admin") return "/admin";
  if (role === "patient") return "/patient";
  return "/login";
}

interface AuthProviderProps {
  children: ReactNode;
}
// Its main job is to remember who is logged in and share that information with every page and button in your app.
// It keeps a shared memory box: Instead of making every single page ask Supabase "Is anyone logged in right now?", AuthProvider asks once and holds onto the answer (user, role, and loading).
// It remembers logins after a page refresh: When a user refreshes their browser, AuthProvider quickly checks Supabase (getSession) to see if they were already logged in, so they don't get kicked out.
// It watches for changes in real time: If a user clicks "Log In" or "Log Out" anywhere in your app, AuthProvider (onAuthStateChange) immediately notices and updates the rest of the app automatically.
// It broadcasts the details to all pages: Because you wrap your whole app inside <AuthProvider>, any component—like your Navbar, Patient Booking Page, or Admin Dashboard—can simply ask useAuth() to find out:
// Who is this person? (user),Are they an admin or a patient? (role), Can I log them out? (signOut)
export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // 1. Check if the user was already logged in (page refresh)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // 2. Watch for login and logout events
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
      },
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const user = session?.user ?? null;
  const role = getRole(user);

  const value: AuthContextType = {
    user,
    role,
    loading,
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
