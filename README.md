# Channel Console Chatbot

ChatGPT 스타일의 2-컬럼 웹 챗봇 콘솔입니다. `index.html`은 소개/랜딩 페이지이며, **지금 시작하기** 버튼으로 `chat.html`에 접속합니다. 챗 화면에서는 인증 후 대화가 입력 즉시 자동 저장됩니다. 프론트엔드는 순수 HTML·CSS·JS이며, 인증은 Supabase Auth를 사용합니다.

## Supabase 설정

1. [Supabase](https://supabase.com)에서 새 프로젝트를 만들고 **Project URL**과 **anon key**를 확인합니다.
2. `config.example.js`를 복사해서 `config.js` 파일을 만들고, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DEFAULT_DOMAIN` 값을 실제 프로젝트 값으로 교체합니다. (`config.js`는 `.gitignore`에 포함되어 커밋되지 않음)
3. Supabase 대시보드 **Authentication → Users**에서 이메일/비밀번호 유저를 생성하거나, `signup.html` 페이지(헤더의 **회원가입** 링크)를 통해 계정을 만들 수 있습니다.
   - 예: 이메일 `sfmaster1@example.com`, 비밀번호 `1111`
   - 로그인 폼에는 `sfmaster1`처럼 아이디만 입력해도 되도록 기본 도메인을 `DEFAULT_DOMAIN`에서 정의합니다.
4. Hugging Face Inference 프록시를 위해 `supabase/functions/hf-proxy/index.ts`를 배포하고, Supabase 프로젝트에 `HF_TOKEN` 시크릿을 설정합니다. (`supabase functions deploy hf-proxy` → `supabase secrets set HF_TOKEN=hf_xxx`)
5. `config.js`에 `HF_PROXY_URL` 값을 추가합니다. 예: `https://<project-ref>.supabase.co/functions/v1/hf-proxy`

> ⚠️ anon key는 공개 키지만, 실제 서비스에서는 `.env` 등 별도 설정 파일로 관리하는 것이 좋습니다.

## 로그인 & 자동 저장 동작

- `chat.html` 상단 우측 링크가 `login.html` / `signup.html` 페이지로 이동합니다.
- 인증에 성공하면 UI가 "사용자명님 안녕하세요!"와 `로그아웃` 버튼으로 바뀝니다.
- 메시지를 보내거나 봇이 응답할 때마다 현재 대화가 자동으로 저장됩니다.
- 저장된 대화는 우측 "내 채팅기록" 패널에서 바로 확인/전환할 수 있습니다 (수동 저장 버튼 없음).
- 로그아웃 시 게스트 모드로 전환되며, 게스트 전용 로컬 저장소(`localStorage`)가 사용됩니다.
- 모델을 선택하면 Hugging Face Inference API(`https://api-inference.huggingface.co/models/...`)를 호출해 실제 응답을 가져옵니다. 코드에는 `YOUR_HF_TOKEN` 자리표시자만 있으니, 서버/서버리스 프록시 환경변수로 교체해 사용하세요.

## 주요 기능

- 넓은 대화 영역 + 입력 즉시 자동 저장되는 챗 인터페이스
- 상단 우측에 최소한의 인증 컨트롤 (로그인/회원가입/로그아웃)
- Supabase Auth 연동(이메일·비밀번호)
- 자동 저장된 대화 목록 및 선택 기능
- GPT 스타일의 `...` 메뉴로 채팅 제목 변경/삭제, 상단에서 새 채팅 추가
- 삭제 시 커스텀 확인 모달로 안전하게 처리
- 모델 관리 탭에서 Qwen2.5 Coder 32B 모델을 선택해 사용할 수 있음 (사용자별 저장)
- Hugging Face Inference API 연동 (코드에는 토큰 자리표시자만 포함되어 있으며, 실제 배포 시 서버/환경 변수에서 관리하는 것을 권장)
- SQL 기록 탭(향후 확장용 플레이스홀더)

## 로컬 실행 방법

- 랜딩 페이지: `index.html`
- 바로 챗 화면으로 이동하려면 `chat.html`
- 권장 방법 (동일 출처 정책 이슈 방지):
  1. 프로젝트 디렉터리에서 `python -m http.server 8000`
  2. 브라우저에서 `http://localhost:8000` 접속 후 **지금 시작하기** 버튼 클릭

## Hugging Face 프록시 & 도구(Runtime) 구조

- `supabase/functions/hf-proxy/`는 Hugging Face Inference Router를 프록시하면서 도구 호출을 지원합니다.
- `tool-runtime.ts`가 네 개의 도구 모듈(`tools/keyword.ts`, `tools/date.ts`, `tools/glossary.ts`, `tools/query.ts`)을 조합해 `buildToolDefinitions` / `runTool`을 제공합니다.
- 모델은 항상 `tool_choice: "auto"`로 호출되며, **필요한 경우에만** 도구를 사용합니다. 실행 로그는 `steps` 배열에 `status: started/completed/failed` 단계로 기록됩니다.

### 배포 (Supabase 프로젝트)

1. Hugging Face 토큰을 발급받아 Supabase 시크릿으로 저장합니다.
   ```bash
   supabase secrets set HF_TOKEN=hf_xxxxxxxxxxxxxxxxx
   ```
2. 도구 구성에 익명 호출을 허용하려면 `supabase/functions/hf-proxy/function.toml`이 반드시 커밋되어 있어야 합니다.
3. Docker Desktop을 실행한 뒤 아래 명령으로 배포합니다.
   ```bash
   supabase functions deploy hf-proxy
   ```
4. 배포 후 `https://<project-ref>.supabase.co/functions/v1/hf-proxy` 주소가 생성되며, `config.js`의 `HF_PROXY_URL`에 해당 값을 넣어야 프론트가 프록시를 경유합니다.

### 로컬 개발 & 테스트

1. `supabase/functions/hf-proxy/.env` 파일을 만들고 Hugging Face 토큰을 선언합니다.
   ```env
   HF_TOKEN=hf_xxxxxxxxxxxxxxxxx
   ```
2. Docker를 실행한 상태에서 프록시를 로컬로 띄웁니다.
   ```bash
   supabase functions serve hf-proxy \
     --env-file supabase/functions/hf-proxy/.env \
     --no-verify-jwt \
     --debug
   ```
   기본 포트는 `54321`이며, `--port` 옵션으로 변경할 수 있습니다.
3. `config.js`의 `HF_PROXY_URL`을 `http://127.0.0.1:54321/functions/v1/hf-proxy`로 수정하고, 브라우저 `localStorage`의 `channel_console_*` 값을 삭제한 뒤 강력 새로고침(⌘⇧R)합니다.
4. 메시지를 보내면 네트워크 응답의 `steps` 배열에 도구 실행 로그가 포함되고, UI에도 `🔧 <tool>` 메시지가 순차적으로 나타납니다.
   - 툴이 호출되지 않았다면 모델이 자체적으로 필요 없다고 판단한 것입니다. 날짜 계산, 용어 설명, 키워드 추출 요청 등을 보내 도구 사용을 유도할 수 있습니다.

> 배포 환경과 로컬 환경 모두에서 `HF_TOKEN`이 설정되어 있지 않으면 함수가 즉시 500 에러를 반환합니다.

## GitHub Pages 배포

1. 새 GitHub 저장소(예: `username/channel-console-chatbot`)에 소스를 푸시합니다.
2. 저장소 **Settings → Pages**로 이동합니다.
3. **Build and deployment**에서 **Deploy from a branch** 선택 후 `main` 브랜치와 `/ (root)` 폴더 지정.
4. 저장 후 빌드가 완료되면 `https://username.github.io/channel-console-chatbot/` 주소로 접속 가능합니다.
5. 필요하면 https://git.io 에서 짧은 URL을 생성하세요.

## 무료로 호스팅하려면?

GitHub Pages, Netlify, Vercel 등의 정적 호스팅 서비스는 무료 플랜을 제공하므로 이 프로젝트를 별도 서버 없이 배포할 수 있습니다. 실시간 백엔드를 원한다면 Render, Railway, Deta Space 등의 무료 티어를 검토해보세요.

## 데이터 업로드 & 조회

### 구조

- 엑셀 파일은 Supabase Storage 버킷(`Chatbot`)에 저장됩니다.
- 파일 메타데이터는 `public.data_entries` 테이블에 기록됩니다.
- `query_uploaded_data` 도구는 Supabase 서비스 롤 키를 사용해 업로드된 데이터를 조회합니다.

### CLI 환경 준비

1. 로컬 Supabase CLI를 다시 맞추려면 최신 마이그레이션을 반영합니다.
   ```bash
   supabase db reset
   ```
   저장된 데이터가 있다면 `supabase db push`를 활용해도 됩니다.
2. 함수 실행 환경 변수 설정 (`supabase/functions/hf-proxy/.env` 예시):
   ```env
   HF_TOKEN=hf_xxxxxxxxxxxxxxxxx
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=xxxx
   DATA_BUCKET=Chatbot
   ```
3. 함수 실행:
   ```bash
   supabase functions serve hf-proxy \
     --env-file supabase/functions/hf-proxy/.env \
     --no-verify-jwt \
     --debug
   ```

### 프런트엔드 설정

- `config.js`에 다음 항목이 존재해야 합니다.
  ```js
  export const SUPABASE_URL = 'https://<project-ref>.supabase.co';
  export const SUPABASE_ANON_KEY = '<anon-key>';
  export const DEFAULT_DOMAIN = 'example.com';
  export const HF_PROXY_URL = 'http://127.0.0.1:54321/functions/v1/hf-proxy';
  export const DATA_BUCKET = 'Chatbot';
  ```
- 로그인 상태에서 데이터 관리 탭에서 엑셀 파일을 업로드하고 `⋯` 메뉴로 미리보기/삭제를 수행할 수 있습니다.
- 챗봇은 자동으로 업로드된 데이터 목록(`entry_id`, `name`, `size`, `uploaded_at`)을 시스템 메시지에 포함시켜 `query_uploaded_data` 도구 호출에 필요한 정보를 제공합니다.

### query_uploaded_data 사용 예시

모델/도구 호출에 포함되는 JSON 예시:
```json
{
  "entry_id": "8a8e8c1f-...",
  "user_id": "d0b1c24b-...",
  "query": "매출",
  "max_rows": 20
}
```
- `entry_id`: `data_entries.id`
- `user_id`: 현재 로그인한 사용자의 UUID
- `query`: (선택) 검색 키워드, 없으면 상위 행을 반환
- `max_rows`: (선택) 최대 200

결과에는 `headers`, `rows`, `matched_rows`, `returned_rows`, `total_rows`가 포함됩니다. 오류가 발생하면 메시지에 원인을 담아 반환합니다.
