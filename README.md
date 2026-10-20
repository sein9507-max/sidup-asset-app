# 시드업자산

가계부(지출) + 주식 매매 코치를 합친, 휴대폰 홈 화면에 설치해 쓰는 앱. 소원저장소와는 별도 앱이다.

- 숫자는 **맥북 정리 스크립트**(`신혼테크/도구/시드업자산_정리.py`)가 카드 명세서·승인 문자·잔고 캡처·네이버 시세를 모아 PIN으로 **AES-GCM 암호화**해 비공개 저장소 `sein9507-max/newlywed_tech` 의 `시드업자산/data.enc.json` 에 올린다.
- 앱은 그 파일을 받아 **이 휴대폰 안에서만** PIN으로 푼다. 서버 없음, 로그인 없음. 외부 요청은 `api.github.com` 하나뿐(CSP).
- GitHub 열쇠(fine-grained token)와 PIN은 **휴대폰 브라우저 localStorage 에만** 둔다.
- 매매일지는 `시드업자산/매매일지/YYYY-MM.jsonl` 에 한 줄씩 덧붙인다(저장소가 비공개라 평문. 금액 자료와 달리 클로드 루틴이 읽고 복기 피드백을 줄 수 있게).

## 탭 5개
1. **오늘** — 총자산 한 장(투자·현금·안전), 오늘 지출, 이번 달 지출(지난달 같은 날짜 대비), 저축률(설정에 월 수입), 비상금 개월 수.
2. **지출** — 달별 합계·카테고리·TOP5·반복 결제(구독 겹침·이중 결제 경고)·거래 목록(검색·분류).
3. **투자** — 보유·평단·평가·손익, 비중(목표와 ±5%p 벌어지면 리밸런싱 알림), 청약·상조·상품권, 매매일지 기록.
4. **체크** — 장 전 브리핑(시황 발행본), 시장국면, 즉시 중단 신호, 거래 계획(스타일·보유기간·트리거·무효화·허용손실·계좌자산 중 빠지면 **거래 금지**, 다 있으면 수량 공식).
5. **복기** — 주간 규칙 준수 점수·반복 실수·교정 행동(매매일지 기반).

## 쓰는 법
1. 맥북: `python3 도구/시드업자산_정리.py --핀` 으로 PIN 확인 (처음 실행 때 6자리를 만든다).
2. 휴대폰 Safari 로 앱 주소를 열고 → 공유 → **홈 화면에 추가**.
3. 홈 화면 앱을 열어 설정 ⚙ → ① GitHub 열쇠(안내대로 발급, Contents **Read and write**) → ② PIN 입력.
4. 자료 넣는 길: 앱 "넣는 법 보기" 또는 저장소 `시드업자산/단축어_만드는법.md`.

## 로컬 미리보기·검증
```
python3 _design/make_icons.py     # 아이콘 3종 다시 그리기
python3 _design/test_app.py       # 헤드리스 크롬 + 가짜 GitHub 로 15항목 검증, _design/preview/*.png
python3 _design/test_app.py --진짜  # 맥북의 실제 data.json 으로 5탭 스크린샷만 (실제 저장소엔 아무것도 안 씀)
```

## 배포 (아직 안 함 — 사용자가 "발행"이라 하면)
1. GitHub 에 **공개** 저장소 하나 새로 만든다(예: `sein9507-max/sidup-asset-app`). 앱 파일엔 비밀이 없다(열쇠·PIN·숫자는 저장소에 없음).
2. 이 폴더에서:
   ```
   git init && git add -A && git commit -m "시드업자산 1.0.0"
   git remote add origin https://github.com/sein9507-max/sidup-asset-app.git
   git push -u origin main
   ```
   (`_design/` 은 .gitignore 로 빠진다.)
3. 저장소 Settings → Pages → Source: **Deploy from a branch**, Branch: `main` / `(root)` → 저장. 1~2분 뒤 `https://sein9507-max.github.io/sidup-asset-app/`.
4. 아이폰 Safari 로 열어 홈 화면에 추가. (소원저장소와 주소가 다르므로 저장 공간도 따로다.)
5. 고칠 때마다: 파일 수정 → `sw.js` 의 `CACHE` 버전 올리기 → 커밋·푸시. 휴대폰은 다음에 열 때 새 버전을 받는다.

## 만든 것
순수 HTML·CSS·JS. 빌드 도구 없음. 글꼴: [Orbit](https://github.com/JAMO-TYPEFACE/Orbit) (SIL Open Font License 1.1, `fonts/LICENSE-Orbit.txt`). 테마 3종(민트 크롬·라벤더 홀로·블랙 크롬 라임)은 `app.css` 맨 위 토큰.
