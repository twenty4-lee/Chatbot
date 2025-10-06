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

## Hugging Face 프록시 배포

1. `supabase/functions/hf-proxy/index.ts`는 Supabase Edge Functions용 서버 코드입니다.
2. 터미널에서 `supabase functions deploy hf-proxy`를 실행하고, `HF_TOKEN`을 시크릿으로 등록합니다.<br />
   `supabase secrets set HF_TOKEN=hf_xxxxxxxxxxxxxxxxx`
3. 배포가 완료되면 `https://<project-ref>.supabase.co/functions/v1/hf-proxy` 주소가 생성됩니다.
4. `config.js`의 `HF_PROXY_URL` 값을 위 주소로 설정하면 프론트엔드가 해당 엔드포인트를 통해 Inference API를 호출합니다.

## GitHub Pages 배포

1. 새 GitHub 저장소(예: `username/channel-console-chatbot`)에 소스를 푸시합니다.
2. 저장소 **Settings → Pages**로 이동합니다.
3. **Build and deployment**에서 **Deploy from a branch** 선택 후 `main` 브랜치와 `/ (root)` 폴더 지정.
4. 저장 후 빌드가 완료되면 `https://username.github.io/channel-console-chatbot/` 주소로 접속 가능합니다.
5. 필요하면 https://git.io 에서 짧은 URL을 생성하세요.

## 무료로 호스팅하려면?

GitHub Pages, Netlify, Vercel 등의 정적 호스팅 서비스는 무료 플랜을 제공하므로 이 프로젝트를 별도 서버 없이 배포할 수 있습니다. 실시간 백엔드를 원한다면 Render, Railway, Deta Space 등의 무료 티어를 검토해보세요.
