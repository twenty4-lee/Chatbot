import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import exampleConfig from './config.example.js';

const pageMode = document.documentElement.dataset.authMode || 'login';
const authForm = document.getElementById('authForm');
const authIdInput = document.getElementById('authId');
const authPasswordInput = document.getElementById('authPassword');
const authConfirmInput = document.getElementById('authConfirm');
const authError = document.getElementById('authError');
const submitButton = document.getElementById('authSubmitBtn');
const domainHint = document.getElementById('domainHint');

let appConfig = { ...exampleConfig };
let supabaseClient = null;
let isConfigValid = false;

function showError(message) {
    if (!authError) {
        return;
    }
    authError.textContent = message;
    authError.hidden = !message;
}

function toEmail(identity) {
    if (!identity) {
        return '';
    }
    if (identity.includes('@')) {
        return identity;
    }
    return `${identity}@${appConfig.DEFAULT_DOMAIN}`;
}

async function loadConfigOverrides() {
    try {
        const module = await import('./config.js');
        const overrides = module.default ?? module;
        appConfig = { ...appConfig, ...overrides };
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

async function handleSubmit(event) {
    event.preventDefault();
    showError('');

    if (!isConfigValid || !supabaseClient) {
        showError('Supabase 환경설정이 필요합니다. config.js를 확인해주세요.');
        return;
    }

    const identity = authIdInput.value.trim();
    const password = authPasswordInput.value.trim();

    if (!identity || !password) {
        showError('아이디와 비밀번호를 모두 입력해주세요.');
        return;
    }

    const email = toEmail(identity);

    if (pageMode === 'signup') {
        const confirmPassword = authConfirmInput.value.trim();
        if (password.length < 6) {
            showError('비밀번호는 6자 이상이어야 합니다.');
            return;
        }
        if (password !== confirmPassword) {
            showError('비밀번호가 일치하지 않습니다.');
            return;
        }
        try {
            const { error } = await supabaseClient.auth.signUp({ email, password });
            if (error) {
                showError(error.message || '회원가입에 실패했습니다. 다시 시도해주세요.');
                return;
            }
            alert('회원가입이 완료되었습니다. 이메일 인증 후 로그인해주세요.');
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Supabase signUp error', error);
            showError('회원가입 중 오류가 발생했습니다. 콘솔을 확인해주세요.');
        }
        return;
    }

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error || !data?.user) {
            showError(error?.message || '로그인에 실패했습니다. 다시 시도해주세요.');
            return;
        }
        window.location.href = 'chat.html';
    } catch (error) {
        console.error('Supabase signIn error', error);
        showError('로그인 중 오류가 발생했습니다. 콘솔을 확인해주세요.');
    }
}

async function bootstrap() {
    await loadConfigOverrides();
    isConfigValid = hasValidConfig(appConfig);

    if (domainHint) {
        domainHint.textContent = `@${appConfig.DEFAULT_DOMAIN}`;
    }

    if (!submitButton) {
        return;
    }

    submitButton.disabled = !isConfigValid;

    if (isConfigValid) {
        supabaseClient = createClient(appConfig.SUPABASE_URL, appConfig.SUPABASE_ANON_KEY);
    } else {
        showError('Supabase 환경설정이 필요합니다. config.js를 확인해주세요.');
    }

    authForm.addEventListener('submit', handleSubmit);
    authIdInput.focus();
}

bootstrap();
