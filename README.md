# BETTER ME — 웹앱(PWA) 버전 0.3.0

`BETTER_ME_v0.3_Developer_Spec` 기준으로 만든 iPhone용 습관 앱입니다. 네이티브(SwiftUI) 대신 **Safari에서 '홈 화면에 추가'해 앱처럼 쓰는 웹앱**으로 구현했습니다. 빌드 도구 없이 HTML/CSS/JS 파일만으로 동작합니다.

## 아이폰에 설치하기

웹앱은 **HTTPS 주소**에 올려야 아이폰에서 오프라인 동작과 홈 화면 앱이 제대로 됩니다. 이 폴더(`better-me-pwa`) 전체를 정적 호스팅에 올리면 됩니다.

### 방법 A — GitHub Pages (무료, 추천)
1. GitHub에 새 저장소를 만들고 이 폴더의 파일을 모두 올립니다 (`index.html`이 저장소 최상위에 오도록).
2. 저장소 **Settings → Pages → Branch: main / (root)** 를 선택하고 저장합니다.
3. 1~2분 뒤 `https://<아이디>.github.io/<저장소>/` 주소가 생깁니다.

### 방법 B — Netlify Drop
1. https://app.netlify.com/drop 에 로그인한 뒤 `better-me-pwa` 폴더를 끌어다 놓습니다.
2. 생성된 `https://….netlify.app` 주소를 사용합니다.

### 아이폰에서
1. **Safari**로 위 주소를 엽니다 (Chrome 앱에서는 홈 화면 앱으로 설치되지 않습니다).
2. 공유 버튼 → **홈 화면에 추가** → 추가.
3. 홈 화면의 BETTER ME 아이콘으로 실행합니다. 한 번 연 뒤에는 비행기 모드에서도 열립니다.

> 데이터는 **그 아이폰의 앱 저장소에만** 저장됩니다. 홈 화면 앱을 삭제하거나 Safari 웹사이트 데이터를 지우면 기록이 사라질 수 있으니, **설정 → 내 데이터 → JSON 내보내기**로 가끔 백업해 주세요.

## PC에서 미리 보기 / 테스트

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File better-me-pwa/tools/serve.ps1 -Port 8765
```

- 앱: http://localhost:8765/
- 계산 규칙 테스트(명세 AC 예시 21개): http://localhost:8765/tests.html

## 명세 대비 구현 범위

| 명세 항목 | 이 버전 |
|---|---|
| 5탭(홈·습관·성장·AI 코치·설정), 탭별 내비게이션 스택과 마지막 위치 복원 | 구현 |
| 온보딩(소개 → 5영역 → 습관 선택), 5영역 템플릿 + 수면 선택 | 구현 |
| 체크/수치 기록, 연타 1회 처리, 5초 실행 취소(revision 비교), 지난 날짜 수정, 미래 기록 금지 | 구현 |
| 습관 CRUD, 검증 문구, 목표·요일·방식 변경은 내일부터(HabitVersion), 일시중지·보관·복원·영구 삭제 | 구현 |
| 작성 중 폼·코치 입력문 임시 보관(앱 종료 후 복구) | 구현 |
| 성장: 주/월, ΣC/ΣN 달성률, 예정 0일은 대시, 표 보기, 영역별·날짜별 화면, 연속 달성 | 구현 |
| JSON v1 내보내기/복원(20MB·스키마 검증·미리보기·원자적 교체), 대화 삭제, 전체 초기화 | 구현 |
| 디자인 토큰, 다크 모드, Dynamic Type, VoiceOver 라벨, 동작 줄이기 | 구현 |
| **Apple Health(걸음·수면 자동 읽기)** | **웹에서는 불가** → 수치로 직접 기록 |
| **AI 코치(서버 프록시·외부 AI)** | 명세상 제공자·보관 조건 미확정 빌드는 전송 금지 → **기기 내 규칙 기반 코치**로 대체. 제안 카드·검토·중복 적용 차단 흐름은 명세대로 |
| **습관 알림** | iOS 웹앱은 서버 없이 로컬 알림 예약 불가 → 미구현 |

## 파일 구조

```
index.html              앱 진입점
css/app.css             디자인 토큰과 화면 스타일
js/store.js             로컬 저장소(localStorage 트랜잭션), 날짜·시간대 유틸, 상수
js/model.js             습관·버전·기록·제안 규칙, 내보내기/복원 검증
js/stats.js             집계 서비스(홈·성장·코치 공유)
js/coach.js             기기 내 코치 규칙과 제안 검증
js/app.js               화면과 상호작용
js/icons.js             탭/버튼 아이콘(SVG)
sw.js, manifest.webmanifest, icons/   오프라인 캐시와 홈 화면 앱 설정
tests.html, js/tests.js 계산 규칙 테스트
tools/serve.ps1         로컬 개발 서버
```

배포 후 파일을 고쳤다면 `sw.js`의 `CACHE` 이름을 바꿔 올리면 아이폰이 새 버전을 받습니다.
