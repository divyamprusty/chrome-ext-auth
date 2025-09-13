"use client"
import React, { useState, useEffect } from "react";

/// <reference path="../types/chrome.d.ts" />

declare global {
  interface Window {
    supabaseClient?: any;
  }
}

const AuthPage: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [supabaseClient, setSupabaseClient] = useState<any>(null);

  useEffect(() => {
    // Wait for Supabase client to be available
    const checkSupabase = () => {
      if (window.supabaseClient) {
        setSupabaseClient(window.supabaseClient);
        console.log('Supabase client loaded in web app');
      } else {
        setTimeout(checkSupabase, 100);
      }
    };
    checkSupabase();
  }, []);

  const openChatbotExtension = () => {
    // Send message to content script to open side panel
    window.postMessage({
      type: 'OPEN_SIDE_PANEL',
      source: 'web-app'
    }, window.location.origin);
  };

  const notifyExtension = (session: any) => {
    // Check if we're in a Chrome extension context
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage({
          type: 'STORE_AUTH',
          token: session.access_token,
          refreshToken: session.refresh_token || null,
          user: session.user || null
        }).catch((error: any) => {
          console.log('Extension not available:', error);
        });
      } catch (error: any) {
        console.log('Chrome runtime not available:', error);
      }
    } else {
      console.log('Not in extension context, skipping extension notification');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!supabaseClient) {
      setMessage("Authentication system not ready. Please wait...");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      let result;
      
      if (isSignUp) {
        result = await supabaseClient.auth.signUp({
          email,
          password,
        });
        
        if (result.error) {
          throw result.error;
        }
        
        if (result.data?.user && !result.data.session) {
          setMessage("Please check your email to confirm your account.");
          setLoading(false);
          return;
        }
      } else {
        result = await supabaseClient.auth.signInWithPassword({
          email,
          password,
        });
        
        if (result.error) {
          throw result.error;
        }
      }

      if (result.data?.session) {
        setMessage(`${isSignUp ? 'Sign up' : 'Sign in'} successful!`);
        
        // Notify extension of authentication
        notifyExtension(result.data.session);
        
        // Redirect or update UI as needed
        console.log('Authentication successful:', result.data.user?.email);
      }
      
    } catch (error: any) {
      console.error('Auth error:', error);
      setMessage(error.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-800 rounded-lg shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">ChatBot</h1>
            <p className="text-gray-400">
              {isSignUp ? "Create your account" : "Sign in to your account"}
            </p>
          </div>

          {message && (
            <div className={`mb-4 p-3 rounded-md text-sm ${
              message.includes('successful') || message.includes('check your email') 
                ? 'bg-green-900 text-green-300 border border-green-700' 
                : 'bg-red-900 text-red-300 border border-red-700'
            }`}>
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !supabaseClient}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
            >
              {loading ? 'Processing...' : (isSignUp ? "Create Account" : "Sign In")}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-blue-400 hover:text-blue-300 text-sm transition-colors duration-200"
            >
              {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
            </button>
          </div>

          <div className="mt-4 text-center">
            <button
              onClick={openChatbotExtension}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200 mb-2"
            >
              Open ChatBot Extension
            </button>
          </div>

          <div className="mt-2 text-center">
            <p className="text-xs text-gray-500">
              {supabaseClient ? 'Connected to authentication service' : 'Loading authentication service...'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
