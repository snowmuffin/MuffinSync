# 🧁 MuffinSync

**Figma Text Layer Extract and Import Plugin**

MuffinSync is a free plugin that extracts text layers from Figma designs, allows external editing, and imports them back to Figma.

## ✨ Key Features

### 1️⃣ Text Layer Extraction (Export)
- Traverse all text layers in selected frames or entire page
- Extract text layer information:
  - `id`: Figma Node ID
  - `name`: Layer name  
  - `characters`: Actual text content
- Automatic download as CSV or JSON files

### 2️⃣ Text Data Modification (External)
- Open extracted CSV/JSON files in external editors for text editing
- ⚠️ **Warning**: Do not modify layer IDs or names

### 3️⃣ Apply Modified Data (Import)
- Upload modified CSV/JSON files
- Find existing Figma text layers and update text content
- Automatic font loading (`loadFontAsync()`)

## 🚀 How to Use

1. **Run Plugin**: Execute Plugins > MuffinSync in Figma
2. **Extract Text**: 
   - Select format (CSV or JSON)
   - "텍스트 레이어 추출하기" 버튼 클릭
3. **데이터 복사 및 저장**:
   - **📄 CSV 다운로드** 또는 **📋 JSON 다운로드** 버튼 클릭
   - 텍스트가 자동 선택되면 `Cmd+C` (Mac) 또는 `Ctrl+C` (Windows)로 복사
   - 텍스트 에디터에서 새 파일을 만들고 붙여넣기
   - `.csv` 또는 `.json` 확장자로 저장
4. **외부 편집**: 저장된 파일을 열어 텍스트 내용 편집
5. **가져오기**: "파일 선택하여 가져오기"로 편집된 파일 업로드

### 💡 파일 저장 팁
- **Mac**: 텍스트편집기.app 또는 VS Code 사용
- **Windows**: 메모장 또는 VS Code 사용  
- **권장 파일명**: `figma-text-layers-[타임스탬프].csv` 또는 `.json`
- **중요**: 반드시 올바른 확장자(.csv 또는 .json)로 저장하세요

## 🛠️ 개발 환경 설정

### 필요 조건
- Node.js 18+
- npm

### 설치 및 빌드
```bash
# 의존성 설치
npm install

# 개발 빌드
npm run dev

# 프로덕션 빌드  
npm run build

# 변경사항 감시 모드
npm run build:watch
```

### 프로젝트 구조
```
MuffinSync/
├── src/
│   ├── code.ts          # 메인 플러그인 로직
│   ├── ui.html          # 플러그인 UI
│   ├── ui.ts            # UI 로직
│   └── global.d.ts      # 타입 정의
├── dist/                # 빌드 결과물
├── manifest.json        # Figma 플러그인 매니페스트
├── package.json
├── tsconfig.json
└── webpack.config.js
```

## 📋 지원 파일 형식

### CSV 형식
```csv
id,name,characters
"123:456","Title Text","안녕하세요"
"123:457","Body Text","본문 텍스트입니다"
```

### JSON 형식
```json
[
  {
    "id": "123:456",
    "name": "Title Text", 
    "characters": "안녕하세요"
  },
  {
    "id": "123:457",
    "name": "Body Text",
    "characters": "본문 텍스트입니다"
  }
]
```

## 🔧 Figma에 플러그인 설치

1. Figma Desktop 앱 실행
2. **Plugins** > **Development** > **Import plugin from manifest...**
3. 이 프로젝트의 `manifest.json` 파일 선택
4. 플러그인이 개발 섹션에 추가됩니다

## ⚠️ 주의사항

- 텍스트를 수정할 때는 `characters` 필드만 편집하세요
- `id`와 `name` 필드는 변경하지 마세요 (매칭이 안됩니다)
- 대량의 텍스트 레이어 처리 시 시간이 걸릴 수 있습니다
- 폰트가 로드되지 않은 경우 오류가 발생할 수 있습니다

## 📄 라이선스

MIT License

## 🤝 기여

버그 리포트나 기능 제안은 언제든 환영합니다!

---

Made with ❤️ for Figma designers
