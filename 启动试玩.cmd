@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 本机未找到 Node.js。无需安装，请直接双击本目录的 index.html 离线试玩。
  pause
  exit /b 0
)
echo 智械边界：本机试玩服务
 echo 打开浏览器访问 http://127.0.0.1:8765/
echo 关闭此窗口或按 Ctrl+C 可停止服务，不会修改系统。
echo 若提示端口已占用，请先试着打开上面的地址；可能已有试玩服务正在运行。
node server.cjs
pause
