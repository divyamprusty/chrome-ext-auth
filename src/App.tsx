import React, { useEffect, useState } from 'react';
import { supabase } from './auth/supabaseClient';
import { SessionMessage } from './types';
import './index.css';

const App: React.FC = () => {
  const [email, setEmail] = useState<string | null>(null);
  const [formEmail, setFormEmail] = useState<string>("");
  const [formPassword, setFormPassword] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Restore session from storage (expects object with both tokens)
  useEffect(() => {
    chrome.storage.local.get('supabase_token', async ({ supabase_token }) => {
      if (supabase_token && supabase) {
        try {
          const { data: { user } } = await supabase.auth.setSession({
            access_token: supabase_token.access_token,
            refresh_token: supabase_token.refresh_token
          });
          if (user?.email) setEmail(user.email);
        } catch {
          setEmail(null);
        }
      }
    });
  }, []);

  // Forward auth changes with both tokens; maintain storage
  useEffect(() => {
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session) {
          const tok = { access_token: session.access_token, refresh_token: session.refresh_token };
          const msg: SessionMessage = { type: 'SYNC_TOKEN', token: tok };
          chrome.runtime.sendMessage(msg);
          chrome.storage.local.set({ supabase_token: tok });
        }
      } else if (event === 'SIGNED_OUT') {
        const msg: SessionMessage = { type: 'SYNC_TOKEN', token: null };
        chrome.runtime.sendMessage(msg);
        chrome.storage.local.remove('supabase_token');
      }
    });
    return () => sub?.subscription.unsubscribe();
  }, []);

  // Receive SYNC_TOKEN messages (from background/content)
  useEffect(() => {
    const listener = async (msg: unknown) => {
      if (!supabase) return;
      const message = msg as SessionMessage;
      if (message.type === 'SYNC_TOKEN') {
        const tok = message.token;
        if (tok?.access_token && tok?.refresh_token) {
          try {
            const { data: { user } } = await supabase.auth.setSession({
              access_token: tok.access_token,
              refresh_token: tok.refresh_token
            });
            if (user?.email) {
              setEmail(user.email);
              chrome.storage.local.set({ supabase_token: tok });
            }
          } catch {
            setEmail(null);
          }
        } else {
          await supabase.auth.signOut();
          setEmail(null);
          chrome.storage.local.remove('supabase_token');
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // React to storage changes (e.g., background updates while popup is open)
  useEffect(() => {
    const onChange: Parameters<typeof chrome.storage.onChanged.addListener>[0] =
      (changes, area) => {
        if (area !== 'local' || !changes.supabase_token) return;
        const tok = changes.supabase_token.newValue as { access_token: string; refresh_token: string } | null;
        if (!supabase) return;
        if (tok?.access_token && tok?.refresh_token) {
          supabase.auth.setSession({ access_token: tok.access_token, refresh_token: tok.refresh_token })
            .then(({ data }) => setEmail(data.user?.email ?? null))
            .catch(() => setEmail(null));
        } else {
          supabase.auth.signOut().finally(() => setEmail(null));
        }
      };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const login = async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signInWithPassword({
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
      const tok = { access_token: s.access_token, refresh_token: s.refresh_token };
      chrome.storage.local.set({ supabase_token: tok });
      const msg: SessionMessage = { type: 'SYNC_TOKEN', token: tok };
      chrome.runtime.sendMessage(msg);
    }
  };

  const logout = async () => {
    if (supabase) await supabase.auth.signOut();
    setEmail(null);
    chrome.storage.local.remove('supabase_token');
    const msg: SessionMessage = { type: 'SYNC_TOKEN', token: null };
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