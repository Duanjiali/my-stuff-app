# 打分引擎三条规则 + 删品类拦截 + Cookie 属性验证
$ErrorActionPreference = 'Continue'
$base = 'http://localhost:3000'
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

# 登录
TryStatus { Invoke-WebRequest -Uri "$base/login" -Method POST -Body @{ password = 'mystuff123' } -WebSession $s -UseBasicParsing -MaximumRedirection 0 } | Out-Null

function NewTestItem($name, $colors, $extra) {
  $body = @{ category_id = '1'; name = $name; colors = $colors }
  if ($extra) { foreach ($k in $extra.Keys) { $body[$k] = $extra[$k] } }
  $r = TryStatus { Invoke-WebRequest -Uri "$base/items" -Method POST -Body $body -WebSession $s -UseBasicParsing -MaximumRedirection 0 }
  return $r.location -replace '/items/', ''
}

# 规则1: 两件花色 -> -20 且理由明确
$idA = NewTestItem '测试-花色A' '[{"family":"black","ratio":0.5,"l":0.10,"s":0},{"family":"white","ratio":0.45,"l":0.92,"s":0}]' @{ is_patterned = 'on' }
$idB = NewTestItem '测试-花色B' '[{"family":"red","ratio":0.5,"l":0.50,"s":0.70},{"family":"cyan","ratio":0.40,"l":0.50,"s":0.60}]' @{ is_patterned = 'on' }
$body = @{ itemIds = @([int]$idA, [int]$idB) } | ConvertTo-Json -Compress
$r = TryStatus { Invoke-WebRequest -Uri "$base/api/score" -Method POST -ContentType 'application/json' -Body $body -WebSession $s -UseBasicParsing }
Write-Host ("R1 花色冲突 -> 命中-20: " + ($r.content -match '件花色单品互相打架 -20'))

# 规则2: 互补色且都低饱和 -> +12 进阶
$idC = NewTestItem '测试-低饱和红' '[{"family":"red","ratio":0.95,"l":0.55,"s":0.35}]' $null
$idD = NewTestItem '测试-低饱和青' '[{"family":"cyan","ratio":0.95,"l":0.55,"s":0.35}]' $null
$body = @{ itemIds = @([int]$idC, [int]$idD) } | ConvertTo-Json -Compress
$r = TryStatus { Invoke-WebRequest -Uri "$base/api/score" -Method POST -ContentType 'application/json' -Body $body -WebSession $s -UseBasicParsing }
Write-Host ("R2 互补进阶 -> 命中+12: " + ($r.content -match '互补撞色.*进阶 \+12'))

# 规则3: 夏季搭配选冬装 -> hardFail=true + info 理由
$idE = NewTestItem '测试-冬装' '[{"family":"black","ratio":0.90,"l":0.10,"s":0}]' @{ season_winter = 'on' }
$body = @{ itemIds = @([int]$idE); season = 'summer' } | ConvertTo-Json -Compress
$r = TryStatus { Invoke-WebRequest -Uri "$base/api/score" -Method POST -ContentType 'application/json' -Body $body -WebSession $s -UseBasicParsing }
Write-Host ("R3 季节硬规则 -> hardFail: " + ($r.content -match '"hardFail":true') + " 含提示: " + ($r.content -match '未标记适合夏'))

# 规则4: 删品类拦截（洗衣液 id=5 有物品）
$r = TryStatus { Invoke-WebRequest -Uri "$base/categories/5/delete" -Method POST -WebSession $s -UseBasicParsing -MaximumRedirection 0 }
Write-Host ("R4 删有物品品类 -> " + $r.code + " -> " + $r.location + " (期望 302 -> /categories?err=has_items)")

# Cookie 属性
$curlOut = & curl.exe -s -i -X POST -d "password=mystuff123" "$base/login" 2>&1 | Out-String
$hasHttpOnly = $curlOut -match 'HttpOnly'
$hasMaxAge = $curlOut -match 'Max-Age=2592000'
$hasSameSite = $curlOut -match 'SameSite=Lax'
Write-Host ("R5 Cookie -> HttpOnly: $hasHttpOnly Max-Age=30天: $hasMaxAge SameSite=Lax: $hasSameSite")
Write-Host "规则验证完成"
