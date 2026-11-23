$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot '.runtime'
$downloadRoot = Join-Path $runtimeRoot 'downloads'
New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null

function Get-VerifiedArchive($url, $destination, $checksum) {
    if (!(Test-Path -LiteralPath $destination)) {
        Write-Host ('Downloading ' + [IO.Path]::GetFileName($destination))
        Invoke-WebRequest -Uri $url -OutFile ($destination + '.partial') -TimeoutSec 300
        Move-Item -LiteralPath ($destination + '.partial') -Destination $destination -Force
    }
    $actual = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $checksum.Trim().ToLowerInvariant()) { throw ('Checksum verification failed: ' + $destination) }
}

$neo4jVersion = '5.26.33'
$neo4jName = 'neo4j-community-' + $neo4jVersion
$neo4jHome = Join-Path $runtimeRoot $neo4jName
if (!(Test-Path -LiteralPath (Join-Path $neo4jHome 'bin/neo4j.bat'))) {
    $neo4jUrl = 'https://dist.neo4j.org/' + $neo4jName + '-windows.zip'
    $checksum = (Invoke-WebRequest -Uri ($neo4jUrl + '.sha256') -TimeoutSec 30).Content
    $archive = Join-Path $downloadRoot ($neo4jName + '.zip')
    Get-VerifiedArchive $neo4jUrl $archive $checksum
    Write-Host 'Extracting Neo4j...'
    Expand-Archive -LiteralPath $archive -DestinationPath $runtimeRoot -Force
}

$javaHome = Get-ChildItem -LiteralPath $runtimeRoot -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin/java.exe') } | Select-Object -First 1
if (!$javaHome) {
    $assets = Invoke-RestMethod -Uri 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse' -TimeoutSec 30
    $package = $assets[0].binary.package
    $archive = Join-Path $downloadRoot $package.name
    Get-VerifiedArchive $package.link $archive $package.checksum
    Write-Host 'Extracting Java 21...'
    Expand-Archive -LiteralPath $archive -DestinationPath $runtimeRoot -Force
    $javaHome = Get-ChildItem -LiteralPath $runtimeRoot -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin/java.exe') } | Select-Object -First 1
}
if (!$javaHome) { throw 'The Java runtime could not be located.' }

$configuration = @'
server.default_listen_address=127.0.0.1
server.default_advertised_address=localhost
server.bolt.enabled=true
server.bolt.listen_address=:7687
server.http.enabled=true
server.http.listen_address=:7474
server.https.enabled=false
server.memory.heap.initial_size=256m
server.memory.heap.max_size=768m
server.memory.pagecache.size=512m
server.directories.data=__DATA__/neo4j
server.directories.logs=__DATA__/neo4j-logs
server.directories.run=__DATA__/neo4j-run
server.directories.import=__DATA__/neo4j-import
dbms.usage_report.enabled=false
'@
[IO.File]::WriteAllText((Join-Path $neo4jHome 'conf/neo4j.conf'), $configuration.Replace('__DATA__', ($projectRoot.Replace('\', '/') + '/data')))
$layout = @{ neo4jHome = $neo4jName; javaHome = $javaHome.Name; version = $neo4jVersion }
$layout | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeRoot 'layout.json') -Encoding utf8
Write-Host 'Local graph runtime is ready. Run npm run local to start the application and database.'
