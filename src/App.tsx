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

  useEffect(() => {
    chrome.storage.local.get('supabase_token', async ({ supabase_token }) => {
      if (supabase_token && supabase) {
        try {
          const { data: { user } } = await supabase.auth.setSession({
            access_token: supabase_token,
            refresh_token: ''
          });
          if (user?.email) setEmail(user.email);
        } catch (e) {
          setEmail(null);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const token = session?.access_token ?? null;
      const msg: SessionMessage = { type: 'SYNC_TOKEN', token };
      chrome.runtime.sendMessage(msg);
      if (token) chrome.storage.local.set({ supabase_token: token });
      else chrome.storage.local.remove('supabase_token');
    });
    return () => sub?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const listener = async (msg: unknown) => {
      if (!supabase) return;
      const message = msg as SessionMessage;
      if (message.type === 'SYNC_TOKEN') {
        const token = message.token;
        if (token) {
          try {
            const { data: { user } } = await supabase.auth.setSession({
              access_token: token,
              refresh_token: ''
            });
            if (user?.email) {
              setEmail(user.email);
              chrome.storage.local.set({ supabase_token: token });
            }
          } catch (e) {
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
    const token = data.session?.access_token ?? null;
    if (token) {
      setEmail(data.user?.email ?? null);
      chrome.storage.local.set({ supabase_token: token });
      const msg: SessionMessage = { type: 'SYNC_TOKEN', token };
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
    email ? (
      <>
        <div>👋 Hi, {email}</div>
        <button onClick={logout}>Logout</button>
      </>
    ) : (
      <div>
        <div>Login to Supabase</div>
        <input
          type="email"
          placeholder="Email"
          value={formEmail}
          onChange={(e) => setFormEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={formPassword}
          onChange={(e) => setFormPassword(e.target.value)}
        />
        <button onClick={login} disabled={loading}>{loading ? 'Signing in…' : 'Sign In'}</button>
        {error && <div style={{ color: 'red' }}>{error}</div>}
      </div>
    )
  );
};

export default App;