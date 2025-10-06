import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import exampleConfig from './config.example.js';

const SAVED_CHATS_PREFIX = 'channel_console_saved_chats_v2';
const MODEL_STORAGE_PREFIX = 'channel_console_model_v1';
const DEFAULT_MODEL_ID = 'Qwen/Qwen2.5-Coder-32B-Instruct';
const MODEL_DISPLAY_NAMES = {
    'Qwen/Qwen2.5-Coder-32B-Instruct': 'Qwen2.5 Coder 32B',
    'Qwen/Qwen3-8B:nscale': 'Qwen3 8B (nscale)'
};
const DEFAULT_SYSTEM_PROMPT = 'You are the Channel Console assistant. Provide accurate, concise answers and reply in Korean when the user writes in Korean.';
const DUMMY_RESPONSES = [
    '네, 자세한 내용을 알려주시면 맞춤형 답변을 준비할게요.',
    '대화 내용을 정리해서 오른쪽 패널에 자동으로 저장합니다.',
    'SQL 분석이 필요하면 우측 탭에서 관리할 수 있어요.',
    '지금까지의 대화를 기반으로 다음 제안을 준비 중입니다.'
];

export function createChatbot() {
    const state = {
        appConfig: { ...exampleConfig },
        supabaseClient: null,
        isConfigValid: false,
        isAuthenticated: false,
        currentUser: null,
        conversations: [],
        activeConversationId: null,
        selectedModelId: DEFAULT_MODEL_ID,
        hfProxyUrl: exampleConfig.HF_PROXY_URL || '',
        isSendingMessage: false
    };

    const listeners = new Set();

    function emit() {
        const snapshot = getState();
        listeners.forEach((listener) => {
            try {
                listener(snapshot);
            } catch (error) {
                console.error('Chatbot listener error', error);
            }
        });
    }

    function getState() {
        return {
            isConfigValid: state.isConfigValid,
            isAuthenticated: state.isAuthenticated,
            currentUser: state.currentUser,
            conversations: state.conversations.map(cloneConversation),
            activeConversationId: state.activeConversationId,
            selectedModelId: state.selectedModelId,
            modelDisplayNames: { ...MODEL_DISPLAY_NAMES },
            isSendingMessage: state.isSendingMessage
        };
    }

    function cloneConversation(conversation) {
        return {
            ...conversation,
            messages: conversation.messages.map((message) => ({ ...message }))
        };
    }

    function storageKeyFor(user = state.currentUser) {
        const id = user?.id ?? 'guest';
        return `${SAVED_CHATS_PREFIX}:${id}`;
    }

    function storageKeyForModel(user = state.currentUser) {
        const id = user?.id ?? 'guest';
        return `${MODEL_STORAGE_PREFIX}:${id}`;
    }

    function sortConversations() {
        state.conversations.sort((a, b) => {
            const left = b.updatedAt ?? b.createdAt;
            const right = a.updatedAt ?? a.createdAt;
            return left - right;
        });
    }

    function loadConversationsFor(user) {
        const key = storageKeyFor(user);
        try {
            const stored = localStorage.getItem(key);
            if (!stored) {
                return [];
            }
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error('Failed to load conversations', error);
            return [];
        }
    }

    function persistConversations() {
        const key = storageKeyFor();
        localStorage.setItem(key, JSON.stringify(state.conversations));
    }

    function loadModelSelectionFor(user) {
        const fallback = DEFAULT_MODEL_ID;
        const key = storageKeyForModel(user);
        try {
            const stored = localStorage.getItem(key);
            if (!stored) {
                return fallback;
            }
            return MODEL_DISPLAY_NAMES[stored] ? stored : fallback;
        } catch (error) {
            console.error('Failed to load model selection', error);
            return fallback;
        }
    }

    function persistModelSelection() {
        const key = storageKeyForModel();
        try {
            localStorage.setItem(key, state.selectedModelId);
        } catch (error) {
            console.error('Failed to persist model selection', error);
        }
    }

    function deriveChatTitle(messages) {
        const firstUserMessage = messages.find((message) => message.sender === 'user');
        if (firstUserMessage) {
            const trimmed = firstUserMessage.text.trim();
            return trimmed.length <= 32 ? trimmed : `${trimmed.slice(0, 32)}…`;
        }
        return '새로운 대화';
    }

    function ensureActiveConversation() {
        let conversation = state.conversations.find((item) => item.id === state.activeConversationId);
        if (!conversation) {
            conversation = createConversationInternal();
        }
        return conversation;
    }

    function createConversationInternal() {
        const conversation = {
            id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            title: '새로운 대화',
            messages: []
        };
        state.conversations.push(conversation);
        state.activeConversationId = conversation.id;
        return conversation;
    }

    function recordMessage(sender, text) {
        const conversation = ensureActiveConversation();
        conversation.messages.push({ sender, text, timestamp: Date.now() });
        conversation.updatedAt = Date.now();
        conversation.title = deriveChatTitle(conversation.messages);
        sortConversations();
        persistConversations();
        emit();
        return conversation;
    }

    function buildChatCompletionMessages(conversation, prompt) {
        const history = Array.isArray(conversation?.messages) ? conversation.messages.slice(-20) : [];
        const messages = [];
        if (DEFAULT_SYSTEM_PROMPT) {
            messages.push({ role: 'system', content: DEFAULT_SYSTEM_PROMPT });
        }
        history.forEach((message) => {
            if (!message?.text) {
                return;
            }
            const role = message.sender === 'bot' ? 'assistant' : 'user';
            messages.push({ role, content: message.text });
        });

        if (!messages.some((entry) => entry.role === 'user') && prompt) {
            messages.push({ role: 'user', content: prompt });
        }

        return messages;
    }

    async function fetchModelReply(prompt) {
        if (!state.hfProxyUrl) {
            return DUMMY_RESPONSES[Math.floor(Math.random() * DUMMY_RESPONSES.length)];
        }

        const modelId = state.selectedModelId;
        const headers = {
            'Content-Type': 'application/json'
        };

        if (state.appConfig?.SUPABASE_ANON_KEY) {
            headers.Authorization = `Bearer ${state.appConfig.SUPABASE_ANON_KEY}`;
            headers.apikey = state.appConfig.SUPABASE_ANON_KEY;
        }

        const conversation = ensureActiveConversation();
        const messages = buildChatCompletionMessages(conversation, prompt);

        const response = await fetch(state.hfProxyUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                modelId,
                messages,
                parameters: buildProviderParameters(modelId)
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`${response.status} ${errorText}`);
        }

        const data = await response.json();
        return extractTextFromHFResponse(data);
    }

    function buildProviderParameters(modelId) {
        if (modelId.startsWith('openai/gpt-oss')) {
            return {
                provider: {
                    name: 'openai',
                    args: {
                        model: 'gpt-4o-mini',
                        temperature: 0.7
                    }
                }
            };
        }
        return {
            max_tokens: 512,
            max_new_tokens: 512,
            temperature: 0.7
        };
    }

    function extractTextFromHFResponse(data) {
        if (typeof data === 'string') {
            return data;
        }
        if (data && typeof data === 'object' && Array.isArray(data.choices)) {
            for (const choice of data.choices) {
                const content = extractTextFromChoice(choice);
                if (content) {
                    return content;
                }
            }
        }
        if (Array.isArray(data)) {
            for (const entry of data) {
                if (typeof entry?.generated_text === 'string') {
                    return entry.generated_text;
                }
                if (typeof entry?.output_text === 'string') {
                    return entry.output_text;
                }
                if (typeof entry?.text === 'string') {
                    return entry.text;
                }
            }
        }
        if (data && typeof data === 'object') {
            if (typeof data.generated_text === 'string') {
                return data.generated_text;
            }
            if (typeof data.output_text === 'string') {
                return data.output_text;
            }
            if (typeof data.text === 'string') {
                return data.text;
            }
        }
        return JSON.stringify(data);
    }

    function extractTextFromChoice(choice) {
        if (!choice || typeof choice !== 'object') {
            return '';
        }
        const message = choice.message;
        if (message && typeof message === 'object') {
            const content = normalizeChatContent(message.content);
            if (content) {
                return content;
            }
        }
        if (choice.delta && typeof choice.delta === 'object') {
            const deltaContent = normalizeChatContent(choice.delta.content);
            if (deltaContent) {
                return deltaContent;
            }
        }
        if (typeof choice.text === 'string') {
            return choice.text;
        }
        return '';
    }

    function normalizeChatContent(content) {
        if (typeof content === 'string') {
            return content;
        }
        if (Array.isArray(content)) {
            return content
                .map((part) => {
                    if (typeof part === 'string') {
                        return part;
                    }
                    if (part && typeof part === 'object' && typeof part.text === 'string') {
                        return part.text;
                    }
                    return '';
                })
                .join('');
        }
        if (content && typeof content === 'object' && typeof content.text === 'string') {
            return content.text;
        }
        return '';
    }

    function updateModelSelection(modelId) {
        if (!MODEL_DISPLAY_NAMES[modelId]) {
            return;
        }
        state.selectedModelId = modelId;
        persistModelSelection();
        emit();
    }

    function selectConversation(conversationId) {
        const conversation = state.conversations.find((item) => item.id === conversationId);
        if (!conversation) {
            return;
        }
        state.activeConversationId = conversation.id;
        emit();
    }

    function createConversation() {
        const conversation = createConversationInternal();
        conversation.createdAt = Date.now();
        conversation.updatedAt = Date.now();
        conversation.title = '새로운 대화';
        sortConversations();
        persistConversations();
        emit();
        return { ...conversation, messages: conversation.messages.map((message) => ({ ...message })) };
    }

    function renameConversation(conversationId, title) {
        const conversation = state.conversations.find((item) => item.id === conversationId);
        if (!conversation) {
            emit();
            return;
        }
        const trimmed = title.trim();
        conversation.title = trimmed || '새로운 대화';
        conversation.updatedAt = Date.now();
        persistConversations();
        emit();
    }

    function deleteConversation(conversationId) {
        const index = state.conversations.findIndex((item) => item.id === conversationId);
        if (index === -1) {
            return;
        }
        const removed = state.conversations.splice(index, 1)[0];
        if (removed?.id === state.activeConversationId) {
            state.activeConversationId = state.conversations[0]?.id ?? null;
        }
        persistConversations();
        emit();
    }

    async function sendMessage(prompt) {
        if (state.isSendingMessage) {
            throw new Error('이미 메시지를 처리 중입니다.');
        }
        const text = prompt.trim();
        if (!text) {
            return '';
        }

        state.isSendingMessage = true;
        emit();
        try {
            recordMessage('user', text);
            const reply = await fetchModelReply(text);
            recordMessage('bot', reply);
            return reply;
        } finally {
            state.isSendingMessage = false;
            emit();
        }
    }

    async function loadConfigOverrides() {
        try {
            const module = await import('./config.js');
            const overrides = module.default ?? module;
            state.appConfig = { ...state.appConfig, ...overrides };
            state.hfProxyUrl = state.appConfig.HF_PROXY_URL || state.hfProxyUrl;
        } catch (error) {
            if (!error?.message?.includes('Cannot find module')) {
                console.error('Failed to load config.js', error);
            }
        }
    }

    function hasValidConfig(config) {
        return (
            typeof config.SUPABASE_URL === 'string' &&
            config.SUPABASE_URL.startsWith('https://') &&
            !config.SUPABASE_URL.includes('YOUR_SUPABASE_PROJECT') &&
            typeof config.SUPABASE_ANON_KEY === 'string' &&
            config.SUPABASE_ANON_KEY.length > 40 &&
            !config.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY')
        );
    }

    async function initAuth() {
        if (!state.supabaseClient) {
            return;
        }

        const { data, error } = await state.supabaseClient.auth.getSession();
        if (error) {
            console.warn('세션 정보를 불러오지 못했습니다.', error);
            enterGuestMode();
        } else if (data?.session?.user) {
            enterApp(data.session.user);
        } else {
            enterGuestMode();
        }

        state.supabaseClient.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                enterApp(session.user);
            } else {
                enterGuestMode();
            }
        });
    }

    function enterGuestMode() {
        state.currentUser = null;
        state.isAuthenticated = false;
        state.selectedModelId = loadModelSelectionFor(null);
        state.conversations = loadConversationsFor(null);
        sortConversations();
        if (state.conversations.length) {
            state.activeConversationId = state.conversations[0].id;
        } else {
            state.activeConversationId = null;
        }
        emit();
    }

    function enterApp(user) {
        state.currentUser = user;
        state.isAuthenticated = true;
        state.selectedModelId = loadModelSelectionFor(user);
        state.conversations = loadConversationsFor(user);
        sortConversations();
        if (state.conversations.length) {
            state.activeConversationId = state.conversations[0].id;
        } else {
            state.activeConversationId = null;
        }
        emit();
    }

    async function initialize() {
        await loadConfigOverrides();
        state.isConfigValid = hasValidConfig(state.appConfig);
        state.hfProxyUrl = state.appConfig.HF_PROXY_URL || state.hfProxyUrl;

        if (state.isConfigValid) {
            state.supabaseClient = createClient(state.appConfig.SUPABASE_URL, state.appConfig.SUPABASE_ANON_KEY);
            await initAuth();
        } else {
            enterGuestMode();
        }

        if (!state.isAuthenticated) {
            enterGuestMode();
        }
    }

    async function logout() {
        if (state.supabaseClient) {
            try {
                await state.supabaseClient.auth.signOut();
            } catch (error) {
                console.warn('Supabase signOut error', error);
            }
        }
        enterGuestMode();
    }

    return {
        initialize,
        getState,
        subscribe(listener) {
            if (typeof listener === 'function') {
                listeners.add(listener);
                listener(getState());
            }
            return () => listeners.delete(listener);
        },
        sendMessage,
        selectConversation,
        createConversation,
        renameConversation,
        deleteConversation,
        selectModel: updateModelSelection,
        getModelOptions() {
            return Object.entries(MODEL_DISPLAY_NAMES).map(([id, label]) => ({ id, label }));
        },
        getModelLabel(modelId) {
            return MODEL_DISPLAY_NAMES[modelId] || modelId;
        },
        logout
    };
}
