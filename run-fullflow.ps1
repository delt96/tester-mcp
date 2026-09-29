param([string[]]$Scenarios, [int]$TimeoutMs = 0)

$ErrorActionPreference = "Continue"

# bin/tester-mcp.js and scenarios/ are resolved relative to CWD, so pin it to this script's dir.
Set-Location $PSScriptRoot

# powershell -File passes "a,b,c" as ONE string, so split it back apart.
if ($Scenarios) { $Scenarios = $Scenarios -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ } }

if (-not $Scenarios -or $Scenarios.Count -eq 0) {
  $Scenarios = @(
    "00a-mp-register",
    "00b-mp-request-registration",
    "00c-gd-reception",
    "01b-assign-lgreview",
    "02-lgreview-complete",
    "03-committee-referral",
    "04-dept-main-executors",
    "04b-lang-exntn-opinions",
    "04c-committee-opinion",
    "05-plenary-submit-and-result",
    "06-legalact-toktom",
    "07-lawreg",
    "08-govtransfer-sign-and-letter",
    "09-promulgate"
  )
}

$log = Join-Path $PSScriptRoot "fullflow-progress.log"
"=== FULLFLOW START $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File -FilePath $log -Append -Encoding utf8

foreach ($s in $Scenarios) {
  $start = Get-Date
  "--- [$s] START $($start.ToString('HH:mm:ss'))" | Out-File -FilePath $log -Append -Encoding utf8
  $args = @("bin/tester-mcp.js","run","scenarios/ebill/seed/$s.yaml","-c","tester-mcp.config.yaml")
  if ($TimeoutMs -gt 0) { $args += @("--timeout","$TimeoutMs") }
  $out = & node @args 2>&1 | Out-String
  $dur = [int]((Get-Date) - $start).TotalSeconds
  $out.TrimEnd() | Out-File -FilePath $log -Append -Encoding utf8
  "--- [$s] END (${dur}s)" | Out-File -FilePath $log -Append -Encoding utf8

  if ($out -match "\[PASS\]") {
    "STATUS: PASS" | Out-File -FilePath $log -Append -Encoding utf8
  } else {
    "STATUS: NOT-PASS -> CHAIN STOPPED at $s" | Out-File -FilePath $log -Append -Encoding utf8
    break
  }
}
"=== FULLFLOW END $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File -FilePath $log -Append -Encoding utf8
