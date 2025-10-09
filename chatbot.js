import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import exampleConfig from './config.example.js';
import DEFAULT_SYSTEM_PROMPT from './chatbot-system-prompt.js';

const SAVED_CHATS_PREFIX = 'channel_console_saved_chats_v2';
const MODEL_STORAGE_PREFIX = 'channel_console_model_v1';
const DATA_STORAGE_PREFIX = 'channel_console_data_v1';
const DEFAULT_MODEL_ID = 'Qwen/Qwen2.5-Coder-32B-Instruct';
const MODEL_DISPLAY_NAMES = {
    'Qwen/Qwen2.5-Coder-32B-Instruct': 'Qwen2.5 Coder 32B',
    'Qwen/Qwen3-8B:nscale': 'Qwen3 8B (nscale)'
};
const DUMMY_RESPONSES = [
    '네, 자세한 내용을 알려주시면 맞춤형 답변을 준비할게요.',
    '대화 내용을 정리해서 오른쪽 패널에 자동으로 저장합니다.',
    '데이터 관리 탭에서 업로드한 파일을 확인하고 정리할 수 있어요.',
    '지금까지의 대화를 기반으로 다음 제안을 준비 중입니다.'
];
const DEFAULT_DATA_BUCKET = 'Chatbot';
const SHEETJS_MODULE_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm';

let sheetParserPromise = null;

async function loadSheetParser() {
    if (!sheetParserPromise) {
        sheetParserPromise = import(SHEETJS_MODULE_URL);
    }
    return sheetParserPromise;
}

function formatFileSize(bytes) {
    if (typeof bytes !== 'number' || Number.isNaN(bytes)) {
        return '-';
    }
    if (bytes <= 0) {
        return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }
    const formatted = index === 0 ? value.toFixed(0) : value.toFixed(1);
    return `${formatted} ${units[index]}`;
}

function formatDateTime(timestamp) {
    if (!timestamp) {
        return '';
    }
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

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
        isSendingMessage: false,
        dataEntries: []
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
            isSendingMessage: state.isSendingMessage,
            dataEntries: state.dataEntries.map((entry) => ({ ...entry }))
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

    function storageKeyForData(user = state.currentUser) {
        const id = user?.id ?? 'guest';
        return `${DATA_STORAGE_PREFIX}:${id}`;
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

    function loadDataEntriesFor(user) {
        if (user && state.supabaseClient) {
            return [];
        }

        const key = storageKeyForData(user);
        try {
            const stored = localStorage.getItem(key);
            if (!stored) {
                return [];
            }
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error('Failed to load data entries', error);
            return [];
        }
    }

    function persistDataEntries(user = state.currentUser) {
        if (user && state.isAuthenticated) {
            return;
        }

        const key = storageKeyForData(user);
        try {
            localStorage.setItem(key, JSON.stringify(state.dataEntries));
        } catch (error) {
            console.error('Failed to persist data entries', error);
        }
    }

    async function fetchRemoteDataEntries(user = state.currentUser) {
        if (!user || !state.supabaseClient) {
            return;
        }
        try {
            const { data, error } = await state.supabaseClient
                .from('data_entries')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) {
                throw error;
            }
            state.dataEntries = (data ?? []).map((row) => ({
                id: row.id,
                name: row.name,
                size: row.size,
                type: row.mime,
                uploadedAt: new Date(row.created_at).getTime(),
                storagePath: row.storage_path
            }));
            emit();
        } catch (error) {
            console.error('Failed to fetch data entries', error);
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
        if (state.isAuthenticated && state.currentUser?.id) {
            const entries = state.dataEntries || [];
            const lines = entries.slice(0, 10).map((entry) => {
                const size = formatFileSize(entry.size);
                const uploaded = formatDateTime(entry.uploadedAt);
                return `- entry_id=${entry.id}, name="${entry.name}", size=${size}, uploaded_at=${uploaded}`;
            });
            if (entries.length > 10) {
                lines.push(`… 그리고 ${entries.length - 10}개 추가 파일이 있습니다.`);
            }
            messages.push({
                role: 'system',
                content: [
                    `사용자 ID: ${state.currentUser.id}.`,
                    entries.length
                        ? '사용 가능한 업로드 데이터 목록:'
                        : '사용 가능한 업로드 데이터가 없습니다.',
                    lines.join('\n'),
                    '데이터를 조회할 때는 query_uploaded_data 도구를 사용하고 entry_id와 user_id를 모두 전달하세요. 필요한 경우 query(키워드)와 max_rows(최대 200)를 함께 지정할 수 있습니다.'
                ].filter(Boolean).join('\n')
            });
        } else {
            messages.push({
                role: 'system',
                content: '사용자는 게스트 모드이므로 업로드된 데이터에 접근할 수 없습니다.'
            });
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
            return {
                text: DUMMY_RESPONSES[Math.floor(Math.random() * DUMMY_RESPONSES.length)],
                steps: []
            };
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
        if (data && typeof data === 'object') {
            const text = typeof data.reply === 'string' && data.reply ? data.reply : extractTextFromHFResponse(data);
            const steps = Array.isArray(data.steps) ? data.steps : [];
            return { text, steps };
        }

        return {
            text: extractTextFromHFResponse(data),
            steps: []
        };
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

    function formatToolStep(step) {
        if (!step || typeof step !== 'object') {
            return '';
        }
        const name = typeof step.tool === 'string' ? step.tool : 'tool';
        const prefix = `🔧 ${name}`;
        const status = typeof step.status === 'string' ? step.status : (step.success === false ? 'failed' : 'completed');
        if (status === 'started') {
            return `${prefix} 실행 준비 중…`;
        }
        if (step.success === false || status === 'failed') {
            const reason = typeof step.error === 'string' ? step.error : '실패했습니다.';
            return `${prefix} 실패: ${reason}`;
        }
        const summary = summarizeToolResult(name, step.result);
        return summary ? `${prefix}: ${summary}` : `${prefix} 완료`;
    }

    function summarizeToolResult(name, result) {
        if (!result || typeof result !== 'object') {
            return stringifyResult(result);
        }
        if (name === 'extract_keywords') {
            const keywords = Array.isArray(result.keywords) ? result.keywords : [];
            if (keywords.length) {
                return `키워드 ${keywords.join(', ')}`;
            }
        }
        if (name === 'fetch_current_date') {
            if (typeof result.iso_date === 'string') {
                const segments = [`${result.iso_date}`];
                if (typeof result.weekday === 'string') {
                    segments.push(result.weekday);
                }
                if (typeof result.is_business_day === 'boolean') {
                    segments.push(result.is_business_day ? '영업일' : '휴일');
                }
                if (Array.isArray(result.holidays) && result.holidays.length) {
                    segments.push(`공휴일: ${result.holidays.join(', ')}`);
                }
                if (typeof result.substitute_for === 'string' && result.substitute_for) {
                    segments.push(`${result.substitute_for} 대체휴일`);
                }
                return segments.join(', ');
            }
        }
        if (name === 'lookup_glossary') {
            const count = typeof result.count === 'number' ? result.count : (Array.isArray(result.matches) ? result.matches.length : 0);
            if (count > 0) {
                const first = result.matches?.[0]?.term ?? result.term;
                return `${count}개 용어 발견${first ? ` (예: ${first})` : ''}`;
            }
            return '관련 용어를 찾지 못했습니다.';
        }
        if (name === 'query_uploaded_data') {
            if (typeof result.message === 'string') {
                return result.message;
            }
        }
        return stringifyResult(result);
    }

    function stringifyResult(value) {
        if (!value) {
            return '';
        }
        if (typeof value === 'string') {
            return value;
        }
        try {
            return JSON.stringify(value);
        } catch (_error) {
            return '';
        }
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

    async function addDataEntry(file) {
        if (!(file instanceof File)) {
            throw new Error('유효한 파일이 필요합니다.');
        }

        if (!state.supabaseClient || !state.currentUser || !state.isAuthenticated) {
            const dataEntry = {
                id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                name: file.name,
                size: file.size,
                type: file.type,
                uploadedAt: Date.now()
            };
            state.dataEntries.push(dataEntry);
            state.dataEntries.sort((a, b) => b.uploadedAt - a.uploadedAt);
            persistDataEntries(null);
            emit();
            return { ...dataEntry };
        }

        const dataBucket = state.appConfig?.DATA_BUCKET || DEFAULT_DATA_BUCKET;
        const objectPath = `${state.currentUser.id}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await state.supabaseClient
            .storage
            .from(dataBucket)
            .upload(objectPath, file, {
                contentType: file.type || 'application/octet-stream',
                upsert: false
            });
        if (uploadError) {
            throw uploadError;
        }

        const { data, error } = await state.supabaseClient
            .from('data_entries')
            .insert({
                user_id: state.currentUser.id,
                name: file.name,
                size: file.size,
                mime: file.type,
                storage_path: objectPath
            })
            .select()
            .single();
        if (error) {
            throw error;
        }

        const dataEntry = {
            id: data.id,
            name: data.name,
            size: data.size,
            type: data.mime,
            uploadedAt: new Date(data.created_at).getTime(),
            storagePath: data.storage_path
        };
        state.dataEntries.unshift(dataEntry);
        emit();
        return { ...dataEntry };
    }

    async function deleteDataEntry(entryId) {
        const index = state.dataEntries.findIndex((item) => item.id === entryId);
        if (index === -1) {
            return;
        }
        const entry = state.dataEntries[index];

        if (!state.supabaseClient || !state.currentUser || !state.isAuthenticated) {
            state.dataEntries.splice(index, 1);
            persistDataEntries(null);
            emit();
            return;
        }

        try {
            const dataBucket = state.appConfig?.DATA_BUCKET || DEFAULT_DATA_BUCKET;
            if (entry?.storagePath) {
                const { error: storageError } = await state.supabaseClient
                    .storage
                    .from(dataBucket)
                    .remove([entry.storagePath]);
                if (storageError && storageError.message && !storageError.message.includes('Not Found')) {
                    throw storageError;
                }
            }

            const { error } = await state.supabaseClient
                .from('data_entries')
                .delete()
                .eq('id', entryId);
            if (error) {
                throw error;
            }
        } catch (error) {
            console.error('Failed to delete data entry', error);
            throw error;
        }

        state.dataEntries.splice(index, 1);
        emit();
    }

    async function previewDataEntry(entryId, options = {}) {
        const maxRows = typeof options.maxRows === 'number' ? Math.max(1, Math.floor(options.maxRows)) : 20;
        const entry = state.dataEntries.find((item) => item.id === entryId);
        if (!entry) {
            throw new Error('데이터를 찾을 수 없습니다.');
        }

        if (!state.supabaseClient || !state.currentUser || !state.isAuthenticated || !entry.storagePath) {
            throw new Error('로그인된 사용자만 미리보기를 사용할 수 있습니다.');
        }

        const dataBucket = state.appConfig?.DATA_BUCKET || DEFAULT_DATA_BUCKET;
        const download = await state.supabaseClient
            .storage
            .from(dataBucket)
            .download(entry.storagePath);
        if (download.error) {
            throw download.error;
        }

        const buffer = await download.data.arrayBuffer();
        const XLSX = await loadSheetParser();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames?.[0];
        if (!sheetName) {
            throw new Error('엑셀 시트를 찾을 수 없습니다.');
        }
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        return {
            entry: { ...entry },
            sheetName,
            totalRows: rows.length,
            rows: rows.slice(0, maxRows)
        };
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
            const { text: reply, steps = [] } = await fetchModelReply(text);
            if (Array.isArray(steps) && steps.length) {
                steps.forEach((step) => {
                    const formatted = formatToolStep(step);
                    if (formatted) {
                        recordMessage('bot', formatted);
                    }
                });
            }
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
        state.dataEntries = loadDataEntriesFor(null);
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
        state.dataEntries = loadDataEntriesFor(user);
        sortConversations();
        if (state.conversations.length) {
            state.activeConversationId = state.conversations[0].id;
        } else {
            state.activeConversationId = null;
        }
        emit();
        fetchRemoteDataEntries(user);
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
        addDataEntry,
        deleteDataEntry,
        previewDataEntry,
        getModelOptions() {
            return Object.entries(MODEL_DISPLAY_NAMES).map(([id, label]) => ({ id, label }));
        },
        getModelLabel(modelId) {
            return MODEL_DISPLAY_NAMES[modelId] || modelId;
        },
        logout
    };
}
