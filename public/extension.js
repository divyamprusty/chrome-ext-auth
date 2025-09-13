// Extension functionality - Web App Sync Mode
let currentUser = null;
let authToken = null;
let refreshToken = null;
let chatSessions = [];
let currentSessionId = null;
let isAuthenticated = false;
let authCheckInterval = null;
let realtimeSubscriptions = [];

// DOM elements
let statusContainer, redirectBtn;

// Add global error handler for service worker errors
window.addEventListener('error', (event) => {
    if (event.error && event.error.message && event.error.message.includes('No SW')) {
        console.log('Service worker error caught and ignored:', event.error.message);
        event.preventDefault();
        return false;
    }
});

// Add unhandled rejection handler
window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && event.reason.message && event.reason.message.includes('No SW')) {
        console.log('Service worker promise rejection caught and ignored:', event.reason.message);
        event.preventDefault();
        return false;
    }
});

// Add global error handler for all errors to prevent crashes
window.addEventListener('error', (event) => {
    console.log('Global error caught:', event.error);
    // Don't prevent default for non-SW errors, just log them
});

// Add global unhandled rejection handler
window.addEventListener('unhandledrejection', (event) => {
    console.log('Global unhandled rejection caught:', event.reason);
    // Don't prevent default for non-SW errors, just log them
});

function showStatus(message, type = 'info') {
    if (!statusContainer) return;
    
    // Clear existing content
    statusContainer.textContent = '';
    
    // Create status message element
    const statusDiv = document.createElement('div');
    statusDiv.className = 'status-message';
    statusDiv.textContent = message;
    
    if (type === 'error') {
        statusDiv.style.backgroundColor = '#dc2626';
    }
    
    statusContainer.appendChild(statusDiv);
}

function clearStatus() {
    if (statusContainer) {
        statusContainer.textContent = '';
    }
}

function showChatInterface() {
    console.log('Showing chat interface for user:', currentUser?.email);
    
    // Hide auth screen and show chat screen
    const authScreen = document.getElementById('auth-screen');
    const chatScreen = document.getElementById('chat-screen');
    
    if (authScreen) {
        authScreen.style.display = 'none';
        console.log('Auth screen hidden');
    }
    if (chatScreen) {
        chatScreen.style.display = 'flex';
        console.log('Chat screen shown');
        // Add chat functionality
        initializeChat();
    } else {
        console.error('Chat screen element not found');
    }
}

function initializeChat() {
    console.log('Initializing chat interface...');
    
    const menuToggle = document.getElementById('menu-toggle');
    const newChatBtn = document.getElementById('new-chat');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const sidebar = document.getElementById('chat-sidebar');
    
    console.log('Chat elements found:', {
        menuToggle: !!menuToggle,
        newChatBtn: !!newChatBtn,
        chatForm: !!chatForm,
        chatInput: !!chatInput,
        sendBtn: !!sendBtn,
        sidebar: !!sidebar
    });
    
    // Menu toggle functionality
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            console.log('Sidebar toggled');
        });
    }
    
    // New chat functionality
    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            console.log('New chat button clicked');
            createNewChat();
        });
    }
    
    // Close panel functionality
    const closePanelBtn = document.getElementById('close-panel');
    if (closePanelBtn) {
        closePanelBtn.addEventListener('click', () => {
            console.log('Close panel button clicked');
            window.close();
        });
    }
    
    // Chat form functionality
    if (chatForm) {
        chatForm.addEventListener('submit', handleChatSubmit);
    }
    
    // Auto-resize textarea
    if (chatInput) {
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 100) + 'px';
        });
        
        // Handle Enter key (send message) and Shift+Enter (new line)
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                chatForm.dispatchEvent(new Event('submit'));
            }
        });
    }
    
    // Wait for Supabase client before loading sessions
    if (window.supabaseClient) {
        console.log('Supabase client available, loading sessions...');
        loadChatSessions();
        setupRealtimeSubscriptions();
    } else {
        console.log('Waiting for Supabase client...');
        setTimeout(() => {
            if (window.supabaseClient) {
                loadChatSessions();
                setupRealtimeSubscriptions();
            }
        }, 1000);
    }
}

function setupRealtimeSubscriptions() {
    // Subscribe to chat_sessions changes for current user
    const sessionsSubscription = window.supabaseClient
        .channel(`chat_sessions_${currentUser.id}`)
        .on('postgres_changes', 
            { 
                event: '*', 
                schema: 'public', 
                table: 'chat_sessions',
                filter: `user_id=eq.${currentUser.id}`
            }, 
            (payload) => {
                console.log('Sessions change:', payload);
                
                if (payload.eventType === 'INSERT') {
                    // Only add if not already in list (avoid duplicates from our own actions)
                    const exists = chatSessions.find(s => s.id === payload.new.id);
                    if (!exists) {
                        chatSessions.unshift({
                            id: payload.new.id,
                            title: payload.new.title,
                            last_message: null,
                            updated_at: payload.new.updated_at
                        });
                        updateSessionsList();
                    }
                } else if (payload.eventType === 'UPDATE') {
                    const index = chatSessions.findIndex(s => s.id === payload.new.id);
                    if (index !== -1) {
                        chatSessions[index] = {
                            ...chatSessions[index],
                            title: payload.new.title,
                            updated_at: payload.new.updated_at
                        };
                        updateSessionsList();
                    }
                } else if (payload.eventType === 'DELETE') {
                    chatSessions = chatSessions.filter(s => s.id !== payload.old.id);
                    updateSessionsList();
                    
                    if (currentSessionId === payload.old.id) {
                        if (chatSessions.length > 0) {
                            currentSessionId = chatSessions[0].id;
                            loadChatMessages(currentSessionId);
                        } else {
                            createNewChat();
                        }
                    }
                }
            }
        )
        .subscribe();

    // Subscribe to chat_messages changes for current user
    const messagesSubscription = window.supabaseClient
        .channel(`chat_messages_${currentUser.id}`)
        .on('postgres_changes', 
            { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'chat_messages',
                filter: `user_id=eq.${currentUser.id}`
            }, 
            (payload) => {
                console.log('New message:', payload);
                
                // Update session last message and timestamp
                const sessionIndex = chatSessions.findIndex(s => s.id === payload.new.session_id);
                if (sessionIndex !== -1) {
                    chatSessions[sessionIndex].last_message = payload.new.content;
                    chatSessions[sessionIndex].updated_at = payload.new.created_at || new Date().toISOString();
                    
                    // Move session to top if it's not already there
                    if (sessionIndex > 0) {
                        const session = chatSessions.splice(sessionIndex, 1)[0];
                        chatSessions.unshift(session);
                    }
                    
                    updateSessionsList();
                }
                
                // If this message is for the current session and we're not the sender,
                // reload messages to stay in sync
                if (payload.new.session_id === currentSessionId) {
                    // Small delay to ensure message is fully saved
                    setTimeout(() => {
                        loadChatMessages(currentSessionId);
                    }, 100);
                }
            }
        )
        .subscribe();

    realtimeSubscriptions.push(sessionsSubscription, messagesSubscription);
}

// Delete session function
async function deleteSession(sessionId) {
    try {
        await window.supabaseClient.from('chat_sessions').delete().eq('id', sessionId);
        chatSessions = chatSessions.filter(s => s.id !== sessionId);
        updateSessionsList();
        
        if (currentSessionId === sessionId) {
            const remainingSessions = chatSessions.filter(s => s.id !== sessionId);
            if (remainingSessions.length > 0) {
                currentSessionId = remainingSessions[0].id;
                loadChatMessages(currentSessionId);
            } else {
                await createNewChat();
            }
        }
    } catch (error) {
        console.error('Error deleting session:', error);
        showStatus('Failed to delete session. Please try again.', 'error');
    }
}

async function createNewChat() {
    try {
        if (!currentUser || !currentUser.id) {
            throw new Error('User not authenticated');
        }

        // Check if we have valid tokens first
        if (!authToken || !refreshToken) {
            throw new Error('No authentication tokens available. Please sign in to your web app first.');
        }

        console.log('Validating session before database operation...');
        
        // Try to get current session first
        let validSession = null;
        try {
            const { data: { session: currentSession }, error: getSessionError } = await window.supabaseClient.auth.getSession();
            
            if (!getSessionError && currentSession && currentSession.user) {
                console.log('Valid session already exists');
                validSession = currentSession;
            } else {
                console.log('No valid session, attempting to set session with stored tokens');
                
                // Try to set session with stored tokens
                const { data, error: setSessionError } = await window.supabaseClient.auth.setSession({
                    access_token: authToken,
                    refresh_token: refreshToken
                });
                
                if (setSessionError || !data.session) {
                    console.error('Failed to set session:', setSessionError);
                    // Clear invalid tokens
                    await chrome.storage.local.remove(['authToken', 'refreshToken', 'user']);
                    authToken = null;
                    refreshToken = null;
                    currentUser = null;
                    isAuthenticated = false;
                    throw new Error('Authentication expired. Please sign in to your web app again.');
                }
                
                validSession = data.session;
                console.log('Session set successfully with stored tokens');
            }
        } catch (error) {
            console.error('Session validation failed:', error);
            // Clear invalid tokens
            await chrome.storage.local.remove(['authToken', 'refreshToken', 'user']);
            authToken = null;
            refreshToken = null;
            currentUser = null;
            isAuthenticated = false;
            throw new Error('Authentication failed. Please sign in to your web app again.');
        }
        
        console.log('Session validation result:', {
            hasValidSession: !!validSession,
            userId: validSession?.user?.id,
            hasAccessToken: !!validSession?.access_token,
            storedAuthToken: !!authToken,
            storedUser: !!currentUser
        });
        
        if (!validSession || !validSession.user) {
            throw new Error('Authentication required. Please sign in to your web app first.');
        }

        console.log('Creating session with authenticated user:', validSession.user.id);

        const { data, error } = await window.supabaseClient
            .from('chat_sessions')
            .insert({
                user_id: validSession.user.id
            })
            .select('id, title, updated_at')
            .single();
            
        if (error) {
            console.error('Supabase error details:', JSON.stringify(error, null, 2));
            console.error('Current auth state:', {
                hasValidSession: !!validSession,
                userId: validSession?.user?.id,
                accessToken: !!validSession?.access_token
            });
            throw error;
        }
        
        currentSessionId = data.id;
        const newSession = {
            id: data.id,
            title: data.title,
            last_message: null,
            updated_at: data.updated_at
        };
        
        chatSessions.unshift(newSession);
        updateSessionsList();
        enableChatInput();
        
        // Clear messages
        const messagesContainer = document.getElementById('messages-container');
        messagesContainer.textContent = '';
        
        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'welcome-message';
        welcomeDiv.textContent = 'Start a conversation...';
        messagesContainer.appendChild(welcomeDiv);
        
        return data.id;
        
    } catch (error) {
        console.error('Create chat error:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        
        // If authentication failed, show login prompt
        if (error.message.includes('sign in') || error.message.includes('Authentication')) {
            showStatus('Please sign in to your web app to continue', 'info');
            // Hide chat interface and show login prompt
            document.getElementById('chat-screen').style.display = 'none';
            isAuthenticated = false;
        } else {
            showStatus(`Failed to create new chat: ${error.message || 'Unknown error'}`, 'error');
        }
        return null;
    }
}

async function loadChatSessions() {
    try {
        if (!currentUser || !currentUser.id) {
            console.log('No authenticated user for loading sessions');
            return;
        }

        // Ensure we have a valid session before loading
        if (authToken && refreshToken) {
            try {
                const { data: { session: currentSession }, error: getSessionError } = await window.supabaseClient.auth.getSession();
                
                if (!getSessionError && currentSession && currentSession.user) {
                    console.log('Using existing valid session for loading');
                } else {
                    console.log('Setting session for loading sessions');
                    const { error: setSessionError } = await window.supabaseClient.auth.setSession({
                        access_token: authToken,
                        refresh_token: refreshToken
                    });
                    
                    if (setSessionError) {
                        throw setSessionError;
                    }
                }
            } catch (error) {
                console.error('Failed to set session for loading:', error);
                // Clear invalid tokens and show login prompt
                await chrome.storage.local.remove(['authToken', 'refreshToken', 'user']);
                authToken = null;
                refreshToken = null;
                currentUser = null;
                isAuthenticated = false;
                showStatus('Please sign in to your web app to continue', 'info');
                return;
            }
        }

        console.log('Loading sessions for user:', currentUser.id);
        console.log('Supabase client available:', !!window.supabaseClient);
        
        const { data, error } = await window.supabaseClient
            .from('chat_sessions')
            .select('id, title, updated_at')
            .eq('user_id', currentUser.id)
            .order('updated_at', { ascending: false })
            .limit(20);
            
        if (error) {
            console.error('Supabase error loading sessions:', error);
            throw error;
        }

        // Fetch latest message preview for each session
        const ids = (data || []).map((d) => d.id);
        const latestBySession = new Map();
        
        if (ids.length > 0) {
            const { data: msgs } = await window.supabaseClient
                .from('chat_messages')
                .select('session_id, content, created_at')
                .in('session_id', ids)
                .order('created_at', { ascending: false });
            
            (msgs || []).forEach((m) => {
                if (!latestBySession.has(m.session_id)) {
                    latestBySession.set(m.session_id, m.content);
                }
            });
        }

        chatSessions = (data || []).map((d) => ({
            id: d.id,
            title: d.title,
            updated_at: d.updated_at,
            last_message: latestBySession.get(d.id) || null
        }));
        
        console.log('Loaded sessions:', chatSessions.length);
        updateSessionsList();
        
        if (chatSessions.length > 0) {
            currentSessionId = chatSessions[0].id;
            console.log('Setting active session:', currentSessionId);
            loadChatMessages(currentSessionId);
            enableChatInput();
        } else {
            console.log('No sessions found, creating new one...');
            // Create first session if none exist
            await createNewChat();
        }
        
    } catch (error) {
        console.error('Load sessions error:', error.message || error);
        showStatus(`Failed to load chat sessions: ${error.message || 'Unknown error'}`, 'error');
    }
}

function updateSessionsList() {
    const sessionsList = document.getElementById('sessions-list');
    if (!sessionsList) return;
    
    // Clear existing content
    sessionsList.textContent = '';
    
    // Create session elements
    chatSessions.forEach(session => {
        const sessionDiv = document.createElement('div');
        sessionDiv.className = `session-item ${session.id === currentSessionId ? 'active' : ''}`;
        sessionDiv.dataset.sessionId = session.id;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'session-content';
        
        const titleDiv = document.createElement('div');
        titleDiv.className = 'session-title';
        titleDiv.textContent = session.title || session.last_message || 'New Chat';
        
        const previewDiv = document.createElement('div');
        previewDiv.className = 'session-preview';
        previewDiv.textContent = session.last_message || 'No messages yet';
        
        contentDiv.appendChild(titleDiv);
        contentDiv.appendChild(previewDiv);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.dataset.sessionId = session.id;
        deleteBtn.title = 'Delete session';
        // Create SVG element properly
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '12');
        svg.setAttribute('height', '12');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        
        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline.setAttribute('points', '3,6 5,6 21,6');
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'm19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2');
        
        svg.appendChild(polyline);
        svg.appendChild(path);
        deleteBtn.appendChild(svg);
        
        sessionDiv.appendChild(contentDiv);
        sessionDiv.appendChild(deleteBtn);
        sessionsList.appendChild(sessionDiv);
    });
    
    // Add event listeners for session items
    document.querySelectorAll('.session-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.delete-btn')) {
                const sessionId = item.dataset.sessionId;
                selectSession(sessionId);
            }
        });
    });
    
    // Add event listeners for delete buttons
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sessionId = btn.dataset.sessionId;
            deleteSession(sessionId);
        });
    });
}

async function selectSession(sessionId) {
    currentSessionId = sessionId;
    updateSessionsList();
    loadChatMessages(sessionId);
    enableChatInput();
}

async function loadChatMessages(sessionId) {
    try {
        if (!sessionId) {
            console.log('No session ID provided for loading messages');
            return;
        }

        console.log('Loading messages for session:', sessionId);
        
        const { data, error } = await window.supabaseClient
            .from('chat_messages')
            .select('id, role, content, created_at')
            .eq('session_id', sessionId)
            .order('id', { ascending: true });
            
        if (error) {
            console.error('Supabase error loading messages:', error);
            throw error;
        }
        
        console.log('Loaded messages:', data?.length || 0);
        displayMessages(data || []);
        
    } catch (error) {
        console.error('Load messages error:', error.message || error);
        showStatus(`Failed to load messages: ${error.message || 'Unknown error'}`, 'error');
    }
}

function displayMessages(messages) {
    const messagesContainer = document.getElementById('messages-container');
    if (!messagesContainer) return;
    
    if (messages.length === 0) {
        messagesContainer.textContent = '';
        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'welcome-message';
        welcomeDiv.textContent = 'Start a conversation...';
        messagesContainer.appendChild(welcomeDiv);
        return;
    }
    
    // Clear existing messages
    messagesContainer.textContent = '';
    
    // Create message elements
    messages.forEach(message => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.role}`;
        
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';
        bubbleDiv.textContent = message.content;
        
        messageDiv.appendChild(bubbleDiv);
        messagesContainer.appendChild(messageDiv);
    });
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function enableChatInput() {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    
    if (chatInput && sendBtn) {
        chatInput.disabled = false;
        sendBtn.disabled = false;
        chatInput.focus();
    }
}

async function handleChatSubmit(e) {
    e.preventDefault();
    
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const message = chatInput.value.trim();
    
    if (!message || !currentSessionId || !currentUser?.id) return;
    
    // Disable input and show loading
    chatInput.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '';
    
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    sendBtn.appendChild(spinner);
    
    const userText = message;
    chatInput.value = '';
    
    // Add user message to UI immediately
    const messagesContainer = document.getElementById('messages-container');
    const currentMessages = [...messagesContainer.querySelectorAll('.message')].map(el => ({
        role: el.classList.contains('user') ? 'user' : 'assistant',
        content: el.querySelector('.message-bubble').textContent
    }));
    
    const userMessage = { role: 'user', content: userText };
    displayMessages([...currentMessages, userMessage]);
    
    try {
        // Call the Edge Function directly (it handles saving messages)
        const functionUrl = `${window.supabaseClient.supabaseUrl}/functions/v1/chat`;
        
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
            },
            body: JSON.stringify({ 
                message: userText, 
                sessionId: currentSessionId 
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to get response');
        }

        const contentType = response.headers.get('Content-Type') || '';
        
        if (contentType.includes('application/json')) {
            // Handle JSON response
            const json = await response.json();
            const content = json?.content || 'Sorry, I encountered an error. Please try again.';
            
            const updatedMessages = [...currentMessages, userMessage, { role: 'assistant', content }];
            displayMessages(updatedMessages);
        } else if (response.body) {
            // Handle streaming response like web app
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let assistantStarted = false;
            let buffer = '';

            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    buffer += chunk;
                    const lines = buffer.split(/\r?\n/);
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith('data:')) continue;
                        
                        const payload = trimmed.replace(/^data:\s*/, '');
                        if (payload === '[DONE]') continue;

                        try {
                            const json = JSON.parse(payload);
                            const delta = json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || '';
                            
                            if (!assistantStarted) {
                                assistantStarted = true;
                                const messagesWithAssistant = [...currentMessages, userMessage, { role: 'assistant', content: '' }];
                                displayMessages(messagesWithAssistant);
                            }

                            if (delta) {
                                // Update the last message (assistant) with new content
                                const messagesContainer = document.getElementById('messages-container');
                                const messages = [...messagesContainer.querySelectorAll('.message')];
                                const lastMessage = messages[messages.length - 1];
                                
                                if (lastMessage && lastMessage.classList.contains('assistant')) {
                                    const bubble = lastMessage.querySelector('.message-bubble');
                                    if (bubble) {
                                        bubble.textContent += delta;
                                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                                    }
                                }
                            }
                        } catch {
                            // Ignore parsing errors
                        }
                    }
                }
            } finally {
                reader.releaseLock();
            }
        }
        
        // Update session in sidebar
        loadChatSessions();
        
    } catch (error) {
        console.error('Chat error:', error);
        
        // Show error message
        const errorMessage = { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' };
        const updatedMessages = [...currentMessages, userMessage, errorMessage];
        displayMessages(updatedMessages);
    } finally {
        // Re-enable input
        chatInput.disabled = false;
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
        chatInput.focus();
    }
}


async function checkAuthStatus() {
    try {
        console.log('Checking auth status...');
        
        // First check if we have a session
        const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
        
        if (sessionError) {
            console.error('Session check error:', sessionError);
            return;
        }
        
        console.log('Session data:', session);
        
        if (session && session.user) {
            console.log('User is authenticated:', session.user.email);
            
            // User is authenticated
            if (!isAuthenticated || currentUser?.id !== session.user.id) {
                console.log('Setting user as authenticated');
                currentUser = session.user;
                isAuthenticated = true;
                clearStatus();
                showChatInterface();
            } else {
                console.log('User already authenticated, no change needed');
            }
        } else {
            console.log('No active session found');
            
            // User is not authenticated
            if (isAuthenticated) {
                console.log('User was logged out, clearing state');
                // User was logged out
                currentUser = null;
                isAuthenticated = false;
                
                // Unsubscribe from real-time updates
                realtimeSubscriptions.forEach(sub => {
                    if (sub && sub.unsubscribe) {
                        sub.unsubscribe();
                    }
                });
                realtimeSubscriptions = [];
                
                location.reload();
            } else {
                console.log('User not authenticated, showing redirect interface');
                // Don't show any status message - just show the redirect interface
                clearStatus();
            }
        }
        
    } catch (error) {
        console.error('Auth check error:', error);
        // Don't show error to user, just log it
    }
}

function startAuthMonitoring() {
    console.log('Starting auth monitoring...');
    
    // Check auth status immediately
    checkAuthStatus();
    
    // Set up interval to check auth status every 3 seconds (increased from 2)
    authCheckInterval = setInterval(checkAuthStatus, 3000);
    
    // Also listen for auth state changes
    const { data: { subscription } } = window.supabaseClient.auth.onAuthStateChange(
        async (event, session) => {
            console.log('Auth state changed:', event, session?.user?.id);
            
            if (event === 'SIGNED_IN' && session) {
                console.log('SIGNED_IN event detected');
                currentUser = session.user;
                isAuthenticated = true;
                clearStatus();
                showChatInterface();
            } else if (event === 'SIGNED_OUT') {
                console.log('SIGNED_OUT event detected');
                currentUser = null;
                isAuthenticated = false;
                
                // Unsubscribe from real-time updates
                realtimeSubscriptions.forEach(sub => {
                    if (sub && sub.unsubscribe) {
                        sub.unsubscribe();
                    }
                });
                realtimeSubscriptions = [];
                
                location.reload();
            } else if (event === 'TOKEN_REFRESHED') {
                console.log('TOKEN_REFRESHED event detected');
                // Token was refreshed, check if we need to update our state
                if (session && session.user && !isAuthenticated) {
                    console.log('Token refreshed, user now authenticated');
                    currentUser = session.user;
                    isAuthenticated = true;
                    clearStatus();
                    showChatInterface();
                }
            }
        }
    );
    
    // Clean up subscription when page unloads
    window.addEventListener('beforeunload', () => {
        if (subscription) {
            subscription.unsubscribe();
        }
    });
}

function initializeExtension() {
    console.log('Initializing extension...');
    
    // Check for requested page navigation from storage
    chrome.storage.local.get(['requestedPage'], (data) => {
        if (data.requestedPage === 'dashboard') {
            console.log('Redirecting to dashboard page based on stored request');
            window.location.href = 'dashboard.html';
            return;
        }
        
        // Continue with normal initialization for chatbot page
        // Get DOM elements
        statusContainer = document.getElementById('status-container');
        redirectBtn = document.getElementById('redirect-btn');
        
        // Set the redirect button URL
        if (redirectBtn && window.WEB_APP_URL) {
            redirectBtn.href = window.WEB_APP_URL;
            redirectBtn.target = '_blank';
            
            // Add click handler to open web app
            redirectBtn.addEventListener('click', (e) => {
                e.preventDefault();
                window.open(window.WEB_APP_URL, '_blank');
            });
        }
        
        // Extension setup
        console.log('Extension setup script loaded');
        window.isChromeExtension = true;
        console.log('Extension setup complete');
        
        // Clear the requested page after processing
        chrome.storage.local.remove(['requestedPage']);
        
        // Wait for Supabase client to be available
        waitForSupabaseClient();
    });
}

function waitForSupabaseClient() {
    if (window.supabaseClient) {
        console.log('Supabase client ready, starting auth monitoring');
        
        // Load auth from chrome.storage.local on init
        chrome.storage.local.get(['authToken', 'refreshToken', 'user'], async (data) => {
            authToken = data?.authToken || null;
            refreshToken = data?.refreshToken || null;
            currentUser = data?.user || null;
            isAuthenticated = Boolean(authToken && currentUser);
            
            console.log('Auth state loaded:', { 
                hasToken: !!authToken, 
                hasUser: !!currentUser, 
                isAuthenticated 
            });
            
            if (isAuthenticated) {
                // Set the session inside supabase client
                try {
                    await window.supabaseClient.auth.setSession({ 
                        access_token: authToken, 
                        refresh_token: refreshToken || '' 
                    });
                    console.log('Supabase session set successfully');
                } catch (error) {
                    console.error('Error setting session:', error);
                }
                clearStatus();
                showChatInterface();
            } else {
                showStatus('Please sign in to your web app to continue', 'info');
            }
        });

        // Listen for auth changes broadcast by background
        chrome.runtime.onMessage.addListener((message) => {
            console.log('Extension received message:', message);
            
            if (message && message.type === 'CLOSE_SIDE_PANEL_INTERNAL') {
                console.log('Received close panel message from background - attempting to close');
                try {
                    window.close();
                    console.log('window.close() called successfully');
                } catch (error) {
                    console.error('Error calling window.close():', error);
                }
                return;
            }
            
            if (message && message.type === 'AUTH_STATE_CHANGED') {
                console.log('Auth state changed message received:', message);
                
                const applyState = async (data) => {
                    const tokenFromMsg = message.authToken ?? data?.authToken ?? null;
                    const refreshFromMsg = message.refreshToken ?? data?.refreshToken ?? null;
                    const userFromMsg = message.user ?? data?.user ?? null;
                    const wasAuthenticated = isAuthenticated;
                    
                    authToken = tokenFromMsg;
                    refreshToken = refreshFromMsg;
                    currentUser = userFromMsg;
                    isAuthenticated = Boolean(authToken && currentUser);
                    
                    console.log('Auth state updated:', { 
                        wasAuthenticated, 
                        isAuthenticated, 
                        hasToken: !!authToken, 
                        hasUser: !!currentUser 
                    });
                    
                    if (isAuthenticated && !wasAuthenticated) {
                        // Set session in Supabase client
                        try {
                            await window.supabaseClient.auth.setSession({ 
                                access_token: authToken, 
                                refresh_token: refreshToken || '' 
                            });
                        } catch (error) {
                            console.error('Error setting session:', error);
                        }
                        clearStatus();
                        showChatInterface();
                    }
                    if (!isAuthenticated && wasAuthenticated) {
                        location.reload();
                    }
                };

                // If token/user are not included in the message, read from storage
                if (message.authToken === undefined && message.user === undefined) {
                    chrome.storage.local.get(['authToken', 'refreshToken', 'user'], (data) => applyState(data));
                } else {
                    applyState();
                }
            }
        });
        
    } else {
        console.log('Waiting for Supabase client...');
        setTimeout(waitForSupabaseClient, 100);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
    initializeExtension();
}
