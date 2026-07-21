# motion-graphics-studio

로컬 전용 Remotion 영상 템플릿 사이트. Next.js + `@remotion/player`로 실시간 미리보기하고, 렌더링은 AWS 없이 로컬에서 `@remotion/renderer`로 처리한다.

## 템플릿

- `SubscribeCTA` — 구독 유도 오버레이
- `CounterStat` — 카운터 통계 카드
- `PieClockTimer` — 파이 시계 타이머

각 템플릿의 라벨/숫자/색상은 사이트에서 폼으로 직접 편집 가능. 필드 정의는 [types/templates.ts](types/templates.ts)에 있다.

## 사용법

```bash
npm install
npm run dev
```

`localhost:3000` 접속 → 템플릿 선택 → 값 수정하면 미리보기에 바로 반영 → "Render video" 클릭하면 `public/renders/`에 mp4가 생성되고 다운로드 버튼이 뜬다.

Remotion Studio(사이드바에서 프레임 단위로 디버깅)로 열려면:

```bash
npx remotion studio
```

## 참고

- 렌더링용 웹팩 번들은 dev 서버 프로세스당 한 번만 만들어진다. 컴포지션 코드를 고치면 `npm run dev`를 재시작해야 반영된다.
- `public/renders/`는 gitignore 처리되어 있다 — 렌더 결과물은 커밋하지 않는다.

## 자동 편집 도구 (auto-edit-backend)

사이드바의 "자동 편집" 그룹(영상 처리 / 음성 무음 제거 / 사운드 개선 / 텍스트 편집)은
[auto-edit-backend/](auto-edit-backend/)에 있는 별도의 Flask(Python) 백엔드를 호출한다.
WhisperX 전사, Silero VAD 무음 감지, DeepFilterNet 노이즈 제거, PANNs 기침 감지 등 무거운
ML 처리는 전부 Python 쪽에서 돈다 — Node.js로 이식할 수 없는 스택이라, "하나의 사이트"는
브라우저에 보이는 UI 레벨에서만 하나이고 실제로는 Next.js와 Flask 두 프로세스가 함께 뜬다.

브라우저는 항상 같은 출처(`/api/auto-edit/*`)로만 호출하고, `next.config.js`의
`rewrites()`가 이를 Flask로 서버측 전달한다 — CORS 설정이 필요 없고, LAN 접속(같은 Wi-Fi의
폰으로 접속)도 그대로 올바르게 동작하며, `middleware.ts`의 `SITE_PASSWORD` 게이트도 자동으로
적용된다.

### 최초 1회 설정

```bash
cd auto-edit-backend
brew install python@3.11 ffmpeg-full
python3.11 -m venv venv
./venv/bin/pip install -r requirements.txt
./venv/bin/pip install --no-deps deepfilternet==0.5.6   # requirements.txt의 주석 참고
```

### 실행

```bash
npm run dev        # Next.js + Flask 동시 실행 (concurrently)
# 또는 따로:
npm run dev:next
npm run dev:backend
```

Flask는 기본적으로 `localhost:5050`에서 뜬다. 다른 주소/포트를 쓰려면 `.env.local`에
`AUTO_EDIT_BACKEND_URL`을 설정한다(`.env.example` 참고). 세부 아키텍처와 API 목록은
[auto-edit-backend/README.md](auto-edit-backend/README.md)에 있다.
