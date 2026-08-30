# KnowGrove

[English](https://github.com/lufie/KnowGrove/blob/main/README.md) · [简体中文](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.zh-CN.md) · [繁體中文](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.zh-TW.md) · [日本語](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ja.md) · **한국어** · [Deutsch](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.de.md) · [Français](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.fr.md) · [Español](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.es.md) · [Português (Brasil)](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.pt-BR.md) · [Русский](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ru.md)

KnowGrove는 수집 속도가 정리 속도보다 빠른 사용자를 위한 로컬 우선 Obsidian 지식 워크플로입니다. 원본 자료를 Vault에 보존하고 구조를 추출해 주제와 근거로 연결한 뒤 재사용 가능한 결과물로 만듭니다.

현재 소스 버전: `2.8.32`

## 자료에서 결과물까지 하나의 흐름으로

| 수집 | 처리 | 정리 | 작성 |
| --- | --- | --- | --- |
| 글, 링크, 로컬 오디오·동영상, 녹음, 이미지를 저장합니다. | 웹 본문을 추출하고 이미지를 구조화된 Markdown으로 변환하며 오디오·동영상을 전사합니다. | 나중에 읽기, 속성, 주제, 댓글, 블록 참조, 근거를 연결합니다. | 선택한 자료로 개요, 보고서, 장문, 채널별 원고를 만듭니다. |

Vault가 항상 단일 진실 공급원입니다. KnowGrove는 클라이언트 텔레메트리를 수집하지 않으며, 사용자가 선택한 로컬 도구 또는 호환 제공자만 해당 콘텐츠를 처리합니다.

## 주요 기능

- **나중에 읽기**: 하나의 받은 편지함에서 읽지 않음/읽음을 관리하고 문서 끝까지 읽으면 자동으로 완료할 수 있습니다.
- **브라우저 및 모바일 수집**: 글, 동영상, 링크, 짧은 음성 메모를 Vault로 보냅니다.
- **콘텐츠 처리**: 본문 이미지를 보존하고, 동영상은 자막을 우선 사용하며 자막이 없을 때만 로컬 음성 인식을 실행합니다.
- **AI 이미지 텍스트 변환**: 이미지 한 장 또는 노트의 모든 이미지를 변환하고 표와 구조화된 텍스트를 원본 이미지 아래에 저장합니다. 백그라운드에서 실제 처리 단계를 표시하며 안전한 취소와 결과 위치 이동을 지원합니다.
- **Word와 같은 라이브 프리뷰 편집**: 제목, 목록, 작업, 이미지, 코드 블록, 표의 서식을 유지합니다. 선택 영역의 빈 줄을 제거할 때 GFM 표 경계를 보존하거나 복구해 라이브 프리뷰와 읽기 보기에서 계속 표로 렌더링합니다.
- **빠르고 복구 가능한 수집**: 브라우저 작업은 긴 처리 대기열에 들어가기 전에 열 수 있는 최소 Markdown을 만들고 다시 읽습니다. AI와 미디어 처리는 백그라운드에서 계속됩니다.
- **긴 문서 탐색**: 제목 목록의 처음과 끝에 항상 접근할 수 있고 파일 위치 버튼을 표시하면서 본문 스크롤을 가로채지 않습니다.
- **속성 관리**: 유형, 수명 주기 상태, 분야, 주제, 추적 가능한 출처 사실을 하나의 간결한 표준으로 관리합니다. 마이그레이션은 미리 보고 확인하며 알 수 없는 속성이나 사용자 본문을 덮어쓰지 않습니다.
- **주제와 연구**: 모든 주제와 관련 자료를 찾고 분야, 주제, 연구 질문을 구성합니다.
- **댓글과 블록 참조**: 선택한 텍스트에 댓글을 달고 Obsidian 기본 블록 임베드로 재사용합니다.
- **근거 기반 작성**: 선택한 자료에서 개요, 보고서, 장문 및 채널별 원고를 만듭니다.
- **안전한 첨부 파일 정리**: 이전에 참조된 첨부 파일만 추적하고 마지막 참조가 사라질 때 확인 후 Obsidian 휴지통으로 이동합니다.

## 언어와 데이터

KnowGrove는 Obsidian의 인터페이스 언어를 따릅니다. 노트 제목, 경로, 댓글, 분야, 주제, 속성 값, frontmatter, Base, Markdown 본문은 번역하거나 수정하지 않습니다.

## 설치

Obsidian **설정 → 커뮤니티 플러그인 → 탐색**에서 KnowGrove를 검색하고 설치할 수 있습니다.

수동 설치는 최신 GitHub Release의 `main.js`, `manifest.json`, `styles.css`를 `<vault>/.obsidian/plugins/knowgrove/`에 복사한 뒤 Obsidian을 다시 불러옵니다. 다른 사용자의 `data.json`을 복사하지 마세요.

[개인정보 보호](../../PRIVACY.md), [보안](../../SECURITY.md), [MIT 라이선스](../../LICENSE)를 확인하세요.
