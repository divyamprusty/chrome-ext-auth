// Extension configuration and utilities for consistent database operations
class ExtensionDatabase {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
        this.currentUser = null;
    }

    // Initialize with current user
    async initialize() {
        const { data: { user } } = await this.supabase.auth.getUser();
        this.currentUser = user;
        return user;
    }

    // Create session with proper user_id
    async createSession(title = null) {
        if (!this.currentUser) {
            throw new Error('User not authenticated');
        }

        const { data, error } = await this.supabase
            .from('chat_sessions')
            .insert({ 
                user_id: this.currentUser.id,
                title: title 
            })
            .select('id, title, updated_at')
            .single();

        if (error) throw error;
        return data;
    }

    // Send message with proper user_id
    async sendMessage(sessionId, content, role = 'user') {
        if (!this.currentUser) {
            throw new Error('User not authenticated');
        }

        const { data, error } = await this.supabase
            .from('chat_messages')
            .insert({
                session_id: sessionId,
                user_id: this.currentUser.id,
                role: role,
                content: content
            })
            .select('id, role, content, created_at')
            .single();

        if (error) throw error;
        return data;
    }

    // Get user's sessions
    async getSessions() {
        if (!this.currentUser) {
            throw new Error('User not authenticated');
        }

        const { data, error } = await this.supabase
            .from('chat_sessions')
            .select('id, title, updated_at')
            .eq('user_id', this.currentUser.id)
            .order('updated_at', { ascending: false });

        if (error) throw error;
        return data;
    }

    // Get messages for a session
    async getMessages(sessionId) {
        if (!this.currentUser) {
            throw new Error('User not authenticated');
        }

        // Verify session belongs to user
        const { data: session } = await this.supabase
            .from('chat_sessions')
            .select('id')
            .eq('id', sessionId)
            .eq('user_id', this.currentUser.id)
            .single();

        if (!session) {
            throw new Error('Session not found or access denied');
        }

        const { data, error } = await this.supabase
            .from('chat_messages')
            .select('id, role, content, created_at')
            .eq('session_id', sessionId)
            .eq('user_id', this.currentUser.id)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data;
    }

    // Delete session
    async deleteSession(sessionId) {
        if (!this.currentUser) {
            throw new Error('User not authenticated');
        }

        const { error } = await this.supabase
            .from('chat_sessions')
            .delete()
            .eq('id', sessionId)
            .eq('user_id', this.currentUser.id);

        if (error) throw error;
        return true;
    }

    // Call Edge Function with proper authentication
    async callChatFunction(sessionId, message) {
        if (!this.currentUser) {
            throw new Error('User not authenticated');
        }

        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session?.access_token) {
            throw new Error('No valid session token');
        }

        const functionUrl = `${this.supabase.supabaseUrl}/functions/v1/chat`;
        
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
                message: message,
                sessionId: sessionId
            })
        });

        if (!response.ok) {
            throw new Error(`Chat function failed: ${response.status}`);
        }

        return await response.json();
    }
}

// Export for use in extension
window.ExtensionDatabase = ExtensionDatabase;
