@echo off
:: 프로젝트 폴더로 이동 (/d 옵션은 드라이브가 달라도 이동하게 해줍니다)
cd /d "C:\Users\MIN\Desktop\inventory_portal_nextjs_template"

:: 개발 서버 실행 안내 메시지
echo Next.js 개발 서버를 시작합니다...
echo.

:: npm run dev 실행
npm run dev

:: 서버가 꺼지거나 에러가 났을 때 창이 바로 닫히지 않게 함
pause