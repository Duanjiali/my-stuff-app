# MyStuff 冒烟测试：服务须已在 localhost:3000 运行
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

# 1. 未登录访问 / -> 302
$r = TryStatus { Invoke-WebRequest -Uri "$base/" -WebSession $s -UseBasicParsing -MaximumRedirection 0 }
Write-Host ("1. 未登录 GET / -> " + $r.code + " (期望 302)")

# 2. 登录页 -> 200
$r = TryStatus { Invoke-WebRequest -Uri "$base/login" -WebSession $s -UseBasicParsing }
Write-Host ("2. GET /login -> " + $r.code + " (期望 200)")

# 3. 错误密码 -> 401
$r = TryStatus { Invoke-WebRequest -Uri "$base/login" -Method POST -Body @{ password = 'wrong' } -WebSession $s -UseBasicParsing }
Write-Host ("3. 错误密码 -> " + $r.code + " (期望 401)")

# 4. 正确密码 -> 302
$r = TryStatus { Invoke-WebRequest -Uri "$base/login" -Method POST -Body @{ password = 'mystuff123' } -WebSession $s -UseBasicParsing -MaximumRedirection 0 }
Write-Host ("4. 正确密码 -> " + $r.code + " (期望 302)")

# 5. 登录后首页
$r = TryStatus { Invoke-WebRequest -Uri "$base/" -WebSession $s -UseBasicParsing }
Write-Host ("5. GET / -> " + $r.code + " 含统计: " + ($r.content -match '物品'))

# 6. 品类页（种子品类）
$r = TryStatus { Invoke-WebRequest -Uri "$base/categories" -WebSession $s -UseBasicParsing }
Write-Host ("6. GET /categories -> " + $r.code + " 含化妆品: " + ($r.content -match '化妆品') + " 含电器: " + ($r.content -match '电器'))

# 7. 零代码新建"洗衣液"品类（勾消耗品行为 + 2 个动态字段）
$fields = '[{"key":"volume","label":"容量","type":"number","unit":"ml","options":[]},{"key":"opened_at","label":"开封日期","type":"date","unit":"","options":[]}]'
TryStatus { Invoke-WebRequest -Uri "$base/categories" -Method POST -Body @{ name = '洗衣液'; icon = '洗'; behavior_consumable = 'on'; fields = $fields } -WebSession $s -UseBasicParsing -MaximumRedirection 0 } | Out-Null
$r = TryStatus { Invoke-WebRequest -Uri "$base/categories" -WebSession $s -UseBasicParsing }
Write-Host ("7. 新建洗衣液品类 -> 出现: " + ($r.content -match '洗衣液'))

# 解析洗衣液 category id
$catId = $null
if ($r.content -match '(?s)洗衣液.*?/categories/(\d+)/delete') { $catId = $Matches[1] }
Write-Host ("   洗衣液 category id = " + $catId)

# 8. 给洗衣液品类添加物品（无图，动态字段生效）
$r = TryStatus { Invoke-WebRequest -Uri "$base/items" -Method POST -Body @{ category_id = $catId; name = '蓝月亮洗衣液1L'; brand = '蓝月亮'; price = '19.9'; ext_volume = '1000'; colors = '[]' } -WebSession $s -UseBasicParsing -MaximumRedirection 0 }
$itemLaundryId = if ($r.code -eq 302 -and $r.location) { $r.location -replace '/items/', '' } else { $null }
Write-Host ("8. 添加洗衣液物品 -> " + $r.code + " id=" + $itemLaundryId + " (期望 302)")
if ($itemLaundryId) {
  $r = TryStatus { Invoke-WebRequest -Uri ("$base/items/" + $itemLaundryId) -WebSession $s -UseBasicParsing }
  Write-Host ("   详情页含容量 1000ml: " + ($r.content -match '1000'))
}

# 9. 添加两件衣物（白T + 牛仔裤，用于打分）
$r = TryStatus { Invoke-WebRequest -Uri "$base/items" -Method POST -Body @{ category_id = '1'; name = '白色T恤'; season_spring = 'on'; season_summer = 'on'; season_autumn = 'on'; occasion_casual = 'on'; formality = '2'; colors = '[{"family":"white","ratio":0.9,"l":0.92,"s":0.05}]' } -WebSession $s -UseBasicParsing -MaximumRedirection 0 }
$teeId = if ($r.code -eq 302 -and $r.location) { $r.location -replace '/items/', '' } else { $null }
$r = TryStatus { Invoke-WebRequest -Uri "$base/items" -Method POST -Body @{ category_id = '2'; name = '蓝色牛仔裤'; season_spring = 'on'; season_autumn = 'on'; season_winter = 'on'; occasion_casual = 'on'; occasion_work = 'on'; formality = '3'; colors = '[{"family":"indigo","ratio":0.85,"l":0.35,"s":0.5}]' } -WebSession $s -UseBasicParsing -MaximumRedirection 0 }
$jeansId = if ($r.code -eq 302 -and $r.location) { $r.location -replace '/items/', '' } else { $null }
Write-Host ("9. 添加衣物 -> 白T id=" + $teeId + " 牛仔裤 id=" + $jeansId)

# 10. 打分 API：白T + 牛仔裤（白+靛蓝=双中性，应得高分）
$body = @{ itemIds = @([int]$teeId, [int]$jeansId); season = 'spring'; occasion = 'casual' } | ConvertTo-Json -Compress
$r = TryStatus { Invoke-WebRequest -Uri "$base/api/score" -Method POST -ContentType 'application/json' -Body $body -WebSession $s -UseBasicParsing }
Write-Host ("10. 打分 API -> " + $r.code + " 响应: " + $r.content)

# 11. 创建搭配
$form = "name=周一休闲&item_ids=$teeId&item_ids=$jeansId&occasion=casual&season_spring=on"
$r = TryStatus { Invoke-WebRequest -Uri "$base/outfits" -Method POST -ContentType 'application/x-www-form-urlencoded' -Body $form -WebSession $s -UseBasicParsing -MaximumRedirection 0 }
$outfitId = if ($r.code -eq 302 -and $r.location) { $r.location -replace '/outfits/', '' } else { $null }
Write-Host ("11. 创建搭配 -> " + $r.code + " id=" + $outfitId + " (期望 302)")
if ($outfitId) {
  $r = TryStatus { Invoke-WebRequest -Uri ("$base/outfits/" + $outfitId) -WebSession $s -UseBasicParsing }
  Write-Host ("    搭配详情含理由: " + ($r.content -match 'reason') + " 含穿着按钮: " + ($r.content -match '记一次穿着'))
  # 记一次穿着
  $r = TryStatus { Invoke-WebRequest -Uri ("$base/outfits/" + $outfitId + "/wear") -Method POST -WebSession $s -UseBasicParsing -MaximumRedirection 0 }
  Write-Host ("    记一次穿着 -> " + $r.code + " (期望 302)")
}

# 12. 物品列表筛选
$r = TryStatus { Invoke-WebRequest -Uri "$base/items?q=洗衣" -WebSession $s -UseBasicParsing }
Write-Host ("12. 搜索'洗衣' -> " + $r.code + " 命中: " + ($r.content -match '蓝月亮'))
Write-Host "冒烟测试完成"
