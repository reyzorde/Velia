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
      let { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!profileData) {
        const { data: authUser } = await supabase.auth.getUser();
        const email = authUser.user?.email || '';
        const fullName =
          (authUser.user?.user_metadata?.full_name as string) ||
          email.split('@')[0] ||
          'User';
        await supabase.from('profiles').upsert({
          id: userId,
          email,
          full_name: fullName,
        });
        const again = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
        profileData = again.data;
      }

      if (profileData) {
        setProfile(profileData);
        if (profileData.preferred_language) {
          localStorage.setItem('velia_lang', profileData.preferred_language);
        }
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

        let { data: subData } = await supabase
          .from('center_subscriptions')
          .select('*')
          .eq('center_id', (c as Center).id)
          .maybeSingle();

        if (!subData) {
          const { data: alt } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('center_id', (c as Center).id)
            .maybeSingle();
          if (alt) {
            subData = {
              id: alt.id,
              center_id: alt.center_id,
              plan: alt.plan_id || alt.plan || 'start',
              student_limit: alt.student_limit_override ?? alt.student_limit ?? null,
              started_at: alt.started_at,
              expires_at: alt.expires_at,
              created_at: alt.created_at,
              updated_at: alt.updated_at,
            } as CenterSubscription;
          }
        }

        if (subData) setSubscription(subData as CenterSubscription);
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
