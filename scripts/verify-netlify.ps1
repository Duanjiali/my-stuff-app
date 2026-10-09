# Netlify 生产环境外网全链路验证
$ErrorActionPreference = 'Continue'
$base = 'https://my-stuff-app.netlify.app'
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession

function TryStatus([scriptblock]$block) {
  try {
    $r = & $block
    $loc = $null
    try { $loc = [string]$r.Headers['Location'] } catch {}
    return @{ code = [int]$r.StatusCode; content = $r.Content; location = $loc }
  }
  catch {
    $resp = $_.Exception.Response
    $loc = $null
    try { $loc = [string]$resp.Headers['Location'] } catch {}
    $code = 0
    try { $code = [int]$resp.StatusCode } catch {}
    return @{ code = $code; content = ''; location = $loc }
  }
}

# 1. 未登录 → 302
$r = TryStatus { Invoke-WebRequest -Uri "$base/" -WebSession $s -UseBasicParsing -MaximumRedirection 0 }
Write-Host ("1. 未登录 GET / -> " + $r.code + " -> " + $r.location + " (期望 302 -> /login)")

# 2. 登录页
$r = TryStatus { Invoke-WebRequest -Uri "$base/login" -WebSession $s -UseBasicParsing }
Write-Host ("2. GET /login -> " + $r.code + " (期望 200)")

# 3. 静态资源（CDN 直出）
$r = TryStatus { Invoke-WebRequest -Uri "$base/manifest.webmanifest" -WebSession $s -UseBasicParsing }
Write-Host ("3. GET /manifest.webmanifest -> " + $r.code + " (期望 200)")

# 4. 登录
$r = TryStatus { Invoke-WebRequest -Uri "$base/login" -Method POST -Body @{ password = 'MyStuff-ea9cc9e5' } -WebSession $s -UseBasicParsing -MaximumRedirection 0 }
Write-Host ("4. 登录 -> " + $r.code + " (期望 302)")

# 5. 首页（读 Turso）
$r = TryStatus { Invoke-WebRequest -Uri "$base/" -WebSession $s -UseBasicParsing }
Write-Host ("5. 首页 -> " + $r.code + " 含'物品': " + ($r.content -match '物品') + " (验证 Turso 连接)")

# 6. 品类页（Turso 种子数据）
$r = TryStatus { Invoke-WebRequest -Uri "$base/categories" -WebSession $s -UseBasicParsing }
Write-Host ("6. 品类页 -> " + $r.code + " 四种子品类齐全: " + (($r.content -match '服装') -and ($r.content -match '化妆品') -and ($r.content -match '电器')))

# 7. 图片端到端：curl 登录 + 上传真图 -> Cloudinary
$jar = Join-Path $PWD 'nf-cookies.txt'
curl.exe -s -c $jar -o NUL -X POST -d "password=MyStuff-ea9cc9e5" "$base/login"
$up = curl.exe -s -b $jar -o NUL -w "%{http_code}|%{redirect_url}" -F "category_id=1" -F "name=生产测试-图片链路" -F "colors=[]" -F "image=@public/icons/icon.png;type=image/png" "$base/items"
$parts = $up -split '\|'
Write-Host ("7. 上传图片创建物品 -> " + $parts[0] + " redirect=" + $parts[1] + " (期望 302)")
if ($parts[1]) {
  $r = TryStatus { Invoke-WebRequest -Uri $parts[1] -WebSession $s -UseBasicParsing }
  Write-Host ("   详情页含 Cloudinary 图: " + ($r.content -match 'res\.cloudinary\.com'))
}
Remove-Item $jar -Force -ErrorAction SilentlyContinue
Write-Host "外网全链路验证完成"
