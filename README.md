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
