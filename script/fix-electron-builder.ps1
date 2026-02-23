# electron-builder winCodeSign 缓存修复脚本
# 解决符号链接权限问题

$cacheDir = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
$zipFile = Get-ChildItem "$cacheDir\*.7z" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($zipFile) {
    Write-Host "Found cache file: $($zipFile.FullName)"
    Write-Host "Extracting with 7-Zip (skipping symbolic links)..."

    $extractDir = $zipFile.FullName -replace '\.7z$', ''

    # 使用项目中的 7za.exe 解压，跳过符号链接错误
    $sevenZip = ".\node_modules\7zip-bin\win\x64\7za.exe"

    # 创建目标目录
    New-Item -ItemType Directory -Force -Path $extractDir | Out-Null

    # 解压文件，忽略错误（符号链接会失败但其他文件会成功）
    & $sevenZip x -y "$($zipFile.FullName)" "-o$extractDir" 2>&1 | Out-Null

    Write-Host "Extraction completed (symbolic link errors ignored)"
    Write-Host "Cache is now ready for electron-builder"
} else {
    Write-Host "No cache file found. Please run 'npm run build:electron' first to download the cache."
}
