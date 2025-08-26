import React, { useEffect, useRef, useState } from 'react';
import { getSupabase } from './auth/supabaseClient';
import { SessionMessage } from './types';
import './index.css';

const App: React.FC = () => {
  const [email, setEmail] = useState<string | null>(null);
  const [formEmail, setFormEmail] = useState<string>("");
  const [formPassword, setFormPassword] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Loop suppression flags
  const applyingExternalRef = useRef<boolean>(false);
  const suppressNextBroadcastRef = useRef<boolean>(false);
  const writingStorageRef = useRef<boolean>(false);
  const lastAccessTokenRef = useRef<string | null>(null);

  // Restore from extension storage on popup open
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;

    chrome.storage.local.get('supabase_token', async ({ supabase_token }) => {
      if (supabase_token) {
        try {
          suppressNextBroadcastRef.current = true;
          const { data: { user } } = await sb.auth.setSession({
            access_token: supabase_token.access_token,
            refresh_token: supabase_token.refresh_token
          });
          if (user?.email) {
            setEmail(user.email);
            lastAccessTokenRef.current = supabase_token.access_token;
          }
        } catch {
          setEmail(null);
        }
      }
    });
  }, []);

  // Broadcast local auth changes (but not when applying external)
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;

    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      // If we just applied an external token, drop the very next event
      if (suppressNextBroadcastRef.current) {
        suppressNextBroadcastRef.current = false;
        return;
      }
      if (applyingExternalRef.current) return;

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        if (lastAccessTokenRef.current === session.access_token) return;
        lastAccessTokenRef.current = session.access_token;

        const tok = { access_token: session.access_token, refresh_token: session.refresh_token };
        const msg: SessionMessage = { type: 'SYNC_TOKEN', source: 'popup', token: tok };

        writingStorageRef.current = true;
        chrome.storage.local.set({ supabase_token: tok }, () => { setTimeout(() => { writingStorageRef.current = false; }, 0); });
        chrome.runtime.sendMessage(msg);
      } else if (event === 'SIGNED_OUT') {
        const msg: SessionMessage = { type: 'SYNC_TOKEN', source: 'popup', token: null };
        writingStorageRef.current = true;
        chrome.storage.local.remove('supabase_token', () => { setTimeout(() => { writingStorageRef.current = false; }, 0); });
        chrome.runtime.sendMessage(msg);
      }
    });
    return () => sub?.subscription.unsubscribe();
  }, []);

  // Receive forwarded tokens from background/web
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;

    const listener = async (msg: unknown) => {
      const message = msg as SessionMessage;
      if (message.type !== 'SYNC_TOKEN' || message.source === 'popup') return;

      const tok = message.token;
      if (tok?.access_token && tok?.refresh_token) {
        const current = (await sb.auth.getSession()).data.session;
        if (current && current.access_token === tok.access_token) return;

        applyingExternalRef.current = true;
        suppressNextBroadcastRef.current = true;
        try {
          const { data: { user } } = await sb.auth.setSession({
            access_token: tok.access_token,
            refresh_token: tok.refresh_token
          });
          if (user?.email) {
            setEmail(user.email);
            lastAccessTokenRef.current = tok.access_token;

            writingStorageRef.current = true;
            chrome.storage.local.set({ supabase_token: tok }, () => { setTimeout(() => { writingStorageRef.current = false; }, 0); });
          }
        } finally {
          applyingExternalRef.current = false;
        }
      } else {
        const { data: { session: current } } = await sb.auth.getSession();
        if (!current) return;

        applyingExternalRef.current = true;
        suppressNextBroadcastRef.current = true;
        try {
          await sb.auth.signOut({ scope: 'local' });
          setEmail(null);
          lastAccessTokenRef.current = null;

          writingStorageRef.current = true;
          chrome.storage.local.remove('supabase_token', () => { setTimeout(() => { writingStorageRef.current = false; }, 0); });
        } catch {
          // ignore 403 or already-signed-out
        } finally {
          applyingExternalRef.current = false;
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // React to storage changes (only when not writing ourselves)
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;

    const onChange: Parameters<typeof chrome.storage.onChanged.addListener>[0] =
      async (changes, area) => {
        if (area !== 'local' || !changes.supabase_token) return;
        if (writingStorageRef.current) return;

        const tok = changes.supabase_token.newValue as { access_token: string; refresh_token: string } | null;

        if (tok?.access_token && tok?.refresh_token) {
          const current = (await sb.auth.getSession()).data.session;
          if (current && current.access_token === tok.access_token) return;

          applyingExternalRef.current = true;
          suppressNextBroadcastRef.current = true;
          try {
            const { data } = await sb.auth.setSession({ access_token: tok.access_token, refresh_token: tok.refresh_token });
            setEmail(data.user?.email ?? null);
            lastAccessTokenRef.current = tok.access_token;
          } finally {
            applyingExternalRef.current = false;
          }
        } else {
          const { data: { session: current } } = await sb.auth.getSession();
          if (!current) return;

          applyingExternalRef.current = true;
          suppressNextBroadcastRef.current = true;
          try {
            await sb.auth.signOut({ scope: 'local' });
            setEmail(null);
            lastAccessTokenRef.current = null;
          } catch {
            // ignore 403 or already-signed-out
          } finally {
            applyingExternalRef.current = false;
          }
        }
      };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const login = async () => {
    const sb = getSupabase();
    if (!sb) return;

    setLoading(true);
    setError(null);
    const { data, error } = await sb.auth.signInWithPassword({
      email: formEmail.toLowerCase(),
      password: formPassword
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    const s = data.session;
    if (s) {
      setEmail(data.user?.email ?? null);
      lastAccessTokenRef.current = s.access_token;

      const tok = { access_token: s.access_token, refresh_token: s.refresh_token };
      writingStorageRef.current = true;
      chrome.storage.local.set({ supabase_token: tok }, () => { setTimeout(() => { writingStorageRef.current = false; }, 0); });

      const msg: SessionMessage = { type: 'SYNC_TOKEN', source: 'popup', token: tok };
      chrome.runtime.sendMessage(msg);
    }
  };

  const logout = async () => {
    const sb = getSupabase();
    if (!sb) return;

    const { data: { session: current } } = await sb.auth.getSession();
    if (current) {
      try {
        await sb.auth.signOut({ scope: 'local' });
      } catch {
        // ignore 403 or already-signed-out
      }
    }
    setEmail(null);
    lastAccessTokenRef.current = null;

    writingStorageRef.current = true;
    chrome.storage.local.remove('supabase_token', () => { setTimeout(() => { writingStorageRef.current = false; }, 0); });

    const msg: SessionMessage = { type: 'SYNC_TOKEN', source: 'popup', token: null };
    chrome.tabs.query({ url: 'http://localhost:5173/*' }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) chrome.tabs.sendMessage(tab.id, msg);
      }
    });
  };

  return (
    <div className="min-w-[360px] max-w-[360px] min-h-[420px] bg-gradient-to-b from-white to-slate-50">
      <header className="px-5 py-4 border-b bg-white/70 backdrop-blur">
        <h1 className="text-xl font-semibold text-slate-800">Supabase Auth</h1>
        <p className="text-xs text-slate-500">Chrome extension</p>
      </header>

      <main className="p-5">
        {email ? (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold">
                {email?.[0]?.toUpperCase() ?? 'U'}
              </div>
              <div>
                <p className="text-sm text-slate-500">Signed in as</p>
                <p className="text-base font-medium text-slate-800">{email}</p>
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">
                You are authenticated. Open the web app tab and your session will be in sync.
              </p>
            </div>

            <button
              onClick={logout}
              className="w-full inline-flex items-center justify-center rounded-lg bg-slate-900 text-white h-10 hover:bg-slate-800 transition-colors"
            >
              Logout
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Sign in</h2>
              <p className="text-sm text-slate-500">Use your Supabase email and password</p>
            </div>

            <div className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm text-slate-600">Email</label>
                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full h-10 rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm text-slate-600">Password</label>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="w-full h-10 rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              {error && (
                <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <button
                onClick={login}
                disabled={loading}
                className="w-full inline-flex items-center justify-center rounded-lg bg-indigo-600 text-white h-10 hover:bg-indigo-500 disabled:opacity-60 transition-colors"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Tip: Signing in here will sync with the web app if it’s open on http://localhost:5173
            </p>
          </div>
        )}
      </main>

      <footer className="px-5 py-3 text-[11px] text-slate-400">
        Powered by Supabase • Dev build
      </footer>
    </div>
  );
};

export default App;