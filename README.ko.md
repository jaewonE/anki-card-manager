# Anki Card Manager

[ [English](https://github.com/jaewonE/anki-card-manager) | [한국어](https://github.com/jaewonE/anki-card-manager/blob/master/README.ko.md) ]

Anki Card Manager는 `obsidian-to-anki` 마커 블록을 Obsidian 안에서 간결한 접이식 카드로 보여 주고, Vault 전체 카드의 원본 Markdown을 한 화면에서 관리하게 해 주는 확장 프로그램입니다. 버전: **0.1.0**.

## 주요 기능

- 완성된 `<START_ANKI>` / `<END_ANKI>` 블록에서 편집기 선택 영역이 벗어나면 강조 Callout 형태의 카드로 렌더링합니다.
- 카드가 Markdown 코드 펜스의 유일한 내용이면 바깥 펜스까지 UI로 대체해 빈 펜스가 남지 않게 하며, 해당 카드를 삭제할 때도 전용 펜스를 함께 제거합니다.
- 질문은 항상 표시하고 답변은 접이식 영역에 둡니다. 원문 범위에 커서를 다시 두면 마커 블록을 직접 편집할 수 있습니다.
- 기본값은 카드 UI를 원래 위치에 유지하며, 현재 문서의 모든 카드 UI를 문서 하단에 모으는 설정도 제공합니다.
- 한 줄에 `<START_ANKI>`를 입력하면 `Obsidian-Basic`, 질문·답변용 빈 줄, `Back:`, `<END_ANKI>`를 자동으로 완성합니다.
- 자동완성 시 `anki_deck: Inbox`와 `anki_tags: [Inbox]`가 YAML에 없으면 추가합니다. 이 기본값은 설정에서 바꿀 수 있습니다.
- 모든 Markdown 파일을 스캔하여 등록 및 등록 해제 카드를 검색 가능한 표로 보여 줍니다.
- 표에서 원본 위치 열기, 수정, 삭제를 수행하면 해당 Markdown 원문에 직접 반영합니다.
- Anki와 통신하지 않고 등록 상태를 전환합니다. 등록 해제 시 독립된 `<!--ID: ... -->` 줄을 제거하고 마커를 `<ANKI_START>` / `<ANKI_END>`로 바꾸며, 등록 시 원래 마커로 되돌립니다.
- `study/software/sdlc`처럼 계층형 태그를 기준으로 표의 카드를 묶어 볼 수 있습니다.

## 카드 형식

다음 등록 형식을 인식합니다.

```text
<START_ANKI>
Obsidian-Basic
질문(여러 줄 가능)
Back:
답변(여러 줄 가능)
<!--ID: 1775887365861-->
<END_ANKI>
```

카드가 들어 있는 Markdown 파일에는 다음 YAML 속성이 있어야 합니다.

```yaml
---
anki_deck: 개발::정처기
anki_tags:
  - 정처기
---
```

이 플러그인은 `obsidian-to-anki` 형식과 호환되지만 Anki, AnkiConnect 또는 `obsidian-to-anki` 동기화 작업을 직접 실행하지는 않습니다.

## 사용 방법

1. 독립된 줄에 `<START_ANKI>`를 입력합니다. 나머지 카드 템플릿과 누락된 YAML 속성이 즉시 추가됩니다.
2. 질문과 답변을 작성한 뒤 편집기 선택 영역을 마커 블록 밖으로 옮겨 접이식 카드를 확인합니다.
3. 왼쪽 리본의 라이브러리 아이콘을 선택하거나 **Anki Card Manager: Open card manager** 명령을 실행해 Vault를 스캔합니다.
4. 검색, 상태 필터, 태그 계층 묶기, 원문 열기, 수정, 등록 전환 및 삭제 기능을 사용합니다.

관리 화면의 수정과 삭제는 Vault 원문을 직접 변경합니다. 특히 여러 카드를 정리하기 전에는 평소 사용하는 백업이나 버전 관리를 유지하십시오. 스캔 후 파일 내용이 달라졌다면 오래된 범위에 쓰지 않고 작업을 중단하므로, 다시 스캔한 뒤 재시도하면 됩니다.

## 명령과 단축키

- **Open card manager**
- **Insert Anki card**

기본 단축키는 지정하지 않습니다. **Settings → Hotkeys**에서 직접 설정할 수 있습니다.

## 설정

- **Card placement:** 카드 UI를 원래 위치에 유지(기본값)하거나 문서 하단에 모읍니다.
- **Complete start markers:** 카드 자동완성을 켜거나 끕니다.
- **New card defaults:** 카드 유형(`Obsidian-Basic`), 덱(`Inbox`), 태그(`Inbox`) 기본값입니다.

## 개인정보, 네트워크 및 플랫폼 지원

플러그인은 로컬에서만 동작하며 네트워크 요청과 텔레메트리를 사용하지 않습니다. 현재 Vault 안의 Markdown 파일과 플러그인 설정만 읽거나 쓰며 Vault 밖 파일은 읽지 않습니다. 설정은 플러그인 폴더의 `data.json`에 저장됩니다.

`isDesktopOnly`는 `false`입니다. 편집기 카드 UI와 반응형 관리 화면은 Obsidian API와 브라우저 호환 코드로 구현되어 데스크톱과 모바일에서 사용할 수 있습니다.

## 설치

### 수동 설치

1. 일치하는 GitHub Release에서 `main.js`, `manifest.json`, `styles.css`를 내려받습니다.
2. 세 파일을 `<Vault>/.obsidian/plugins/anki-card-manager/`에 복사합니다.
3. Obsidian을 다시 불러온 뒤 **Settings → Community plugins**에서 **Anki Card Manager**를 활성화합니다.

Obsidian Community Plugin Directory 등록이 승인된 이후에는 Community Plugins 화면에서도 설치할 수 있습니다.

## 개발

```bash
npm install
npm run lint
npm test
npm run build
```

프로덕션 릴리스 파일은 저장소 루트에 생성됩니다.

## 라이선스

[0BSD](LICENSE)
