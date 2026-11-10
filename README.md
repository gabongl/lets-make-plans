# 🐿️ Let's make plans! (약속 잡기 모바일 웹앱)

> **"친구 3~4명 모이기도 힘든 바쁜 일상, 카톡 무한 핑퐁은 이제 그만!"**  
> 모바일 환경에 최적화된 초간편 일정 조율 및 공통 분모 자동 도출 웹 애플리케이션입니다.

---

## 🌟 핵심 기능 (Core Features)

1. **⚡ 모임 주관자: 3초 만에 약속방 개설 & 링크 공유**
   - 모임 이름, 후보 기간(예: 11월 9일 ~ 12월 5일), 예상 인원수 입력 즉시 고유 초대 링크 발급.
   - 번거로운 카카오톡 개발자 승인 절차 없이, **원터치 링크 복사 & 카카오톡 안내 문구 복사** 지원.
2. **📱 참여자: 모바일 터치 연속 캘린더**
   - 주관자가 지정한 11월과 12월이 부드럽게 세로 스크롤로 이어지는 모바일 특화 달력.
   - **원터치(1탭)**: "종일 가능 🟢"
   - **투터치(2탭)**: "몇 시 이후 / 조건부 가능 🟠" 바텀시트 오픈 (`[18:00 이후]`, `[19:00 이후]`, `[점심만]`, `[직접 입력]`).
3. **🔥 실시간 공통 분모 캘린더 히트맵**
   - **🌟 에메랄드 발광 (Glow)**: 모든 인원이 가능한 황금의 약속일 (100% 일치)
   - **🟢 연한 에메랄드 / 블루**: 과반수 이상 참석 가능일
   - **🟠 앰버(주황)**: 조건부 가능자가 포함된 날짜
   - 특정 날짜 클릭 시 "누가 되고, 누가 몇 시 이후 가능한지" 상세 카드 확인.
4. **🎉 전원 확정 축하 팝업 (Full Match Modal + Confetti)**
   - 목표 인원 전원이 응답 완료 시, 꽃가루 효과와 함께 최적의 1·2순위 추천일 팝업 노출!
   - 단톡방 공지용 최종 확정 텍스트 원클릭 복사.
5. **🗄️ Lark(Feishu) Base Bitable DB & Vercel 배포 최적화**
   - Google Sheet보다 월등히 빠른 응답 속도를 자랑하는 Lark Bitable 완벽 지원.
   - 키가 없어도 로컬 스토리지 듀얼 모드로 즉시 100% 기능 체험 가능.

---

## 🚀 빠른 시작 (Local Development)

```bash
# 1. 의존성 패키지 설치
npm install

# 2. 로컬 개발 서버 실행 (초고속 Vite 구동)
npm run dev
```

브라우저에서 `http://localhost:5173` 접속 시 바로 모바일 뷰로 약속방을 만들고 일정을 등록해 볼 수 있습니다.

---

## ☁️ Vercel 배포 가이드 (Vercel.com)

1. 본 프로젝트 코드를 GitHub 저장소에 푸시합니다.
2. [Vercel.com](https://vercel.com)에 로그인 후 **[Add New Project]** ➔ 해당 GitHub 저장소를 선택합니다.
3. Framework Preset이 **`Vite`**로 자동 인식되며, 별도 설정 없이 **[Deploy]** 버튼만 누르면 30초 만에 전 세계에 라이브 배포 완료!

---

## 🗃️ Lark(Feishu) Bitable 연동 방법

Lark Base를 영구 DB로 연결하려면 프로젝트 루트의 `.env.example`을 참고하여 Vercel 환경 변수(Environment Variables) 또는 로컬 `.env`에 입력해 주시면 됩니다:

- `LARK_API_DOMAIN`: `https://open.larksuite.com` (또는 `https://open.feishu.cn`)
- `LARK_APP_ID`: Lark Developer 앱의 App ID (`cli_xxxx`)
- `LARK_APP_SECRET`: Lark Developer 앱의 App Secret
- `LARK_BASE_TOKEN`: 사용할 Bitable URL의 App Token (`bascnxxxx`)
- `LARK_TABLE_MEETINGS`: 모임 테이블 ID (`tblxxxx`)
- `LARK_TABLE_RESPONSES`: 응답 테이블 ID (`tblxxxx`)

*(설정하지 않으셔도 로컬/브라우저 스토리지 모드로 즉시 작동합니다.)*

