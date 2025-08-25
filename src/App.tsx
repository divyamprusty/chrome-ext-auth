import React, { useEffect, useState } from 'react';
import { supabase } from './auth/supabaseClient';
import { SessionMessage } from './types';
import './index.css';

const App: React.FC = () => {
  const [email, setEmail] = useState<string | null>(null);

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

  const logout = async () => {
    if (supabase) await supabase.auth.signOut();
    setEmail(null);
    chrome.storage.local.remove('supabase_token');
    const msg: SessionMessage = { type: 'SYNC_TOKEN', token: null };
    chrome.tabs.query({ url: 'http://localhost:3000/*' }, (tabs) => {
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
      <div>Waiting for web app login…</div>
    )
  );
};

export default App;
