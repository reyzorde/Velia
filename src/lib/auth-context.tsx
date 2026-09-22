import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile, Center, CenterSubscription } from '../types/database';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  center: Center | null;
  subscription: CenterSubscription | null;
  role: 'owner' | 'admin' | 'teacher' | null;
  isOwner: boolean;
  isTeacher: boolean;
  canManageStructure: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [center, setCenter] = useState<Center | null>(null);
  const [subscription, setSubscription] = useState<CenterSubscription | null>(null);
  const [role, setRole] = useState<'owner' | 'admin' | 'teacher' | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUserData = async (userId: string) => {
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileData) {
        setProfile(profileData);
        if (profileData.preferred_language) {
          localStorage.setItem('velia_lang', profileData.preferred_language);
        }
        // Theme: prefer local choice (instant UX), fallback to profile
        const localTheme = localStorage.getItem('velia_theme');
        const themeToApply =
          localTheme === 'dark' || localTheme === 'light'
            ? localTheme
            : profileData.theme || 'light';
        document.documentElement.setAttribute('data-theme', themeToApply);
        localStorage.setItem('velia_theme', themeToApply);
      }

      const { data: memberData } = await supabase
        .from('center_members')
        .select('center_id, role, centers(*)')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      if (memberData?.centers) {
        setRole((memberData.role as 'owner' | 'admin' | 'teacher') || null);
        const c = Array.isArray(memberData.centers)
          ? memberData.centers[0]
          : memberData.centers;
        setCenter(c as Center);

        const { data: subData } = await supabase
          .from('center_subscriptions')
          .select('*')
          .eq('center_id', (c as Center).id)
          .single();
        if (subData) setSubscription(subData);
      }
    } catch (err) {
      console.error('Failed to load user data', err);
    }
  };

  const refreshProfile = async () => {
    if (user) await loadUserData(user.id);
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s }, error }) => {
      // A password reset or a replaced browser session can leave an obsolete
      // refresh token in localStorage. Remove only that local auth state.
      if (error) await supabase.auth.signOut({ scope: 'local' });
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadUserData(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadUserData(s.user.id);
      } else {
        setProfile(null);
        setCenter(null);
        setSubscription(null);
        setRole(null);
      }
    });

    return () => authSub.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setCenter(null);
    setSubscription(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        center,
        subscription,
        role,
        isOwner: role === 'owner',
        isTeacher: role === 'teacher',
        canManageStructure: role === 'owner' || role === 'admin',
        loading,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
