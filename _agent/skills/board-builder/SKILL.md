---
name: board-builder
description: GitHub API와 Vercel 서버리스 함수를 이용해 정적 부동산 게시판을 운영하는 스킬
---

# Board Builder

## 목적

루트 정적 HTML 페이지와 `data/posts.json`을 사용하고, GitHub Contents API로 게시글을 읽고 저장한다.

## 파일 규칙

- `public/` 폴더를 만들지 않는다.
- GitHub 토큰은 `config/git_config.json`에 실제 값으로 저장하지 않는다.
- Vercel 환경 변수는 `GITHUB_TOKEN`, `ADMIN_PASSWORD`를 사용한다.
- `api/config.js`는 토큰과 관리자 비밀번호만 반환한다.

## 운영 흐름

1. `admin.html`에서 관리자 인증을 완료한다.
2. `news-write.html`에서 마크다운 본문을 작성한다.
3. `db.js`가 `/api/config`와 `config/git_config.json`을 병렬로 읽어 설정을 병합한다.
4. 게시글 저장 시 GitHub Contents API에 UTF-8 JSON을 커밋한다.
5. 공개 페이지는 `getPosts()`로 최신 데이터를 렌더링한다.

## 보안

마크다운 입력은 먼저 HTML escape하고, 링크는 `http`, `https`, `mailto`만 허용한다. 브라우저에 전달되는 GitHub 토큰은 관리자 기능을 위한 구조이므로 Vercel 환경 변수에만 보관하고 저장소에 커밋하지 않는다.
