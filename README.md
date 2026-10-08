# 바이브코딩 워크북 Q&A

워크북 장별 가이드 + 익명 질문답변 사이트. 본문을 드래그해 형광펜/메모지로 마킹하고 질문하면 실시간으로 공유되고, 상단 칩·좌측 트리에 색으로 표시돼 바로 이동할 수 있다.

## 실시간 저장 켜기 (Supabase, 5분)

설정 전에는 **로컬 모드**(각자 브라우저에만 저장)로 동작한다.

1. https://supabase.com 에서 새 프로젝트 생성
2. SQL Editor에 `supabase.sql` 내용을 붙여넣고 Run
3. Project Settings → API에서 **Project URL**과 **anon / publishable 키**를 `config.js`에 넣고 커밋
   - `service_role` / secret 키는 절대 넣지 말 것

글 삭제(관리)는 Supabase 대시보드 → Table Editor → `posts`에서 한다.

## 워크북 내용 갱신

```bash
node tools/build.mjs "C:/Users/김민재/Desktop/C++_워크북"
```
`data/chapters.js`와 `files/*.md`를 다시 만든다(체크 표시는 공개본에서 초기화).

## 구조
- `index.html` / `style.css` / `app.js` — 화면 전체 (빌드 도구 없음)
- `config.js` — Supabase 연결 정보
- `data/chapters.js` — 생성 파일, 직접 수정 금지
- `files/` — 장별 원문 .md (다운로드용)
