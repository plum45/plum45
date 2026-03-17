# Fix-WoWLAN.ps1
Write-Host "Setting up Wake-on-WiFi..."
Set-NetAdapterAdvancedProperty -Name "Wi-Fi" -DisplayName "Wake on Magic Packet" -DisplayValue "Enabled" -ErrorAction SilentlyContinue
Set-NetAdapterAdvancedProperty -Name "Wi-Fi" -DisplayName "Wake on Pattern Match" -DisplayValue "Enabled" -ErrorAction SilentlyContinue
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power" -Name "HiberbootEnabled" -Value 0
$adapterKey = Get-ChildItem -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e972-e325-11ce-bfc1-08002be10318}" | Where-Object { $_.GetValue("DriverDesc") -like "*Realtek*Wireless*" }
if ($adapterKey) {
    $path = "HKLM:\$($adapterKey.Name.Substring($adapterKey.Name.IndexOf('SYSTEM')))"
    Set-ItemProperty -Path $path -Name "PnPCapabilities" -Value 24 -ErrorAction SilentlyContinue
    Write-Host "Registry set"
}
Write-Host "Done. Please enable Wake on WLAN in BIOS."
