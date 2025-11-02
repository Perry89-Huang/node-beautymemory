@echo off
echo beautymemory API Testing
echo ==================
echo.

set APP_URL=https://beautymemory-6a58c48154f4.herokuapp.com

echo 1.Health checking...
curl %APP_URL%/health
echo.
echo.

echo 2.API information...
curl %APP_URL%/
echo.
echo.

echo 3.Cost estimation (1000 requests)...
curl "%APP_URL%/api/estimate-cost?count=1000"
echo.
echo.

echo 4.Test completed!
echo.
echo Open the test interface in your browser:
echo %APP_URL%/index.html
echo.
pause