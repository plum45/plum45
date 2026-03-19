/**
 * Stacy AI - YouTube Smart Controller (v3.6.2)
 * Version: 3.6.2
 * Focus: High-Precision Search Box Injection
 */

const { execSync } = require('child_process');
const yts = require('yt-search');

/**
 * Execute PowerShell script safely using EncodedCommand to avoid quoting hell
 */
function runPS(script, timeout = 70000) {
    try {
        const encoded = Buffer.from(script, 'utf16le').toString('base64');
        return execSync(`powershell -EncodedCommand ${encoded}`, { timeout }).toString().trim();
    } catch (e) {
        console.error('PS Execution Error:', e.message);
        return 'FAIL';
    }
}

/**
 * Resolve a search string or URL into a final YouTube URL
 */
async function resolveUrl(input) {
    if (input.startsWith('http')) return input;
    const r = await yts(input);
    const videos = r.videos;
    return videos.length > 0 ? videos[0].url : `https://www.youtube.com/results?search_query=${encodeURIComponent(input)}`;
}

/**
 * Play YouTube video in the SAME tab/window if possible (v3.7.0 - Vecna Edition)
 */
async function play_youtube(query) {
    const targetUrl = await resolveUrl(query);
    if (!targetUrl) throw new Error("ขออภัยค่ะ หนูหาเพลงนี้ไม่เจอจริงๆ ค่ะ");

    if (process.platform === 'win32') {
        const escapedUrl = targetUrl.replace(/'/g, "''");
        const psScript = `
            try {
                $ErrorActionPreference = 'Stop'
                Add-Type -AssemblyName System.Windows.Forms
                $ws = New-Object -ComObject WScript.Shell
                Set-Clipboard -Value '${escapedUrl}'
                
                # Get all Chrome processes with visible windows
                $chromeWins = Get-Process chrome | Where-Object { $_.MainWindowTitle -ne '' }
                if (-not $chromeWins) {
                    Start-Process "chrome.exe" "${escapedUrl}"
                    echo 'STARTED'
                    return
                }

                # Priority 1: Check if the CURRENT focus is already YouTube
                foreach ($win in $chromeWins) {
                    if ($win.MainWindowTitle -match 'YouTube|Music|Play') {
                        $ws.AppActivate($win.Id)
                        Start-Sleep -Milliseconds 200
                        [System.Windows.Forms.SendKeys]::SendWait('^l') # Highlight URL bar
                        Start-Sleep -Milliseconds 300
                        [System.Windows.Forms.SendKeys]::SendWait('^v{ENTER}')
                        echo 'REUSED_ACTIVE'
                        return
                    }
                }

                # Priority 2: Scan all tabs in each window
                foreach ($win in $chromeWins) {
                    $ws.AppActivate($win.Id)
                    Start-Sleep -Milliseconds 600
                    # Max 40 tabs scan
                    for ($i=0; $i -lt 40; $i++) {
                        $curr = Get-Process -Id $win.Id
                        $t = $curr.MainWindowTitle
                        if ($t -match 'YouTube|Music|Play') {
                            [System.Windows.Forms.SendKeys]::SendWait('^l')
                            Start-Sleep -Milliseconds 400
                            [System.Windows.Forms.SendKeys]::SendWait('^v{ENTER}')
                            echo 'REUSED_SCANNED'
                            return
                        }
                        [System.Windows.Forms.SendKeys]::SendWait('^{TAB}')
                        Start-Sleep -Milliseconds 150
                    }
                }
                
                # Priority 3: Fallback - Open new tab in the first window
                $ws.AppActivate($chromeWins[0].Id)
                Start-Sleep -Milliseconds 500
                [System.Windows.Forms.SendKeys]::SendWait('^t^l^v{ENTER}')
                echo 'NEW_TAB'
            } catch {
                echo "FAIL: $($_.Exception.Message)"
            }
        `.trim();

        console.log(`📡 [Vecna/Music] Performing Deep Scan v3.7.0...`);
        const res = runPS(psScript, 90000);
        console.log(`💎 [Vecna/Music] Result: ${res}`);
        
        if (res === 'FAIL' || res.includes('FAIL')) {
            execSync(`start chrome "${targetUrl}"`);
        }
        return targetUrl;
    } else {
        execSync(`start chrome "${targetUrl}"`);
        return targetUrl;
    }
}

/**
 * ดึงรายชื่อแท็บ YouTube ทั้งหมด จากทุกหน้าต่าง
 */
async function list_youtube_tabs() {
    if (process.platform !== 'win32') return [];
    try {
        const psScript = `
            Add-Type -AssemblyName System.Windows.Forms
            $ws = New-Object -ComObject WScript.Shell
            $windows = Get-Process chrome | Where-Object { $_.MainWindowTitle -ne '' }
            $tabList = @()
            foreach ($win in $windows) {
                $ws.AppActivate($win.Id)
                Start-Sleep -Milliseconds 400
                for ($i=0; $i -lt 35; $i++) {
                    $curr = Get-Process -Id $win.Id
                    $t = $curr.MainWindowTitle
                    if ($t -match 'YouTube' -or $t -match 'Music' -or $t -match 'Play') {
                        if ($tabList -notcontains $t) { $tabList += $t }
                    }
                    [System.Windows.Forms.SendKeys]::SendWait('^{TAB}')
                    Start-Sleep -Milliseconds 250
                }
            }
            $tabList | ForEach-Object { echo $_ }
        `.trim();
        const result = runPS(psScript, 60000);
        return result && result !== 'FAIL' ? result.split(/\r?\n/) : [];
    } catch (e) { return []; }
}

/**
 * ปิดแท็บเฉพาะจงใจ จากทุกหน้าต่าง
 */
async function close_specific_youtube_tab(titleToMatch) {
    if (process.platform !== 'win32') return false;
    try {
        const psScript = `
            Add-Type -AssemblyName System.Windows.Forms
            $ws = New-Object -ComObject WScript.Shell
            $windows = Get-Process chrome | Where-Object { $_.MainWindowTitle -ne '' }
            foreach ($win in $windows) {
                $ws.AppActivate($win.Id)
                Start-Sleep -Milliseconds 400
                for ($i=0; $i -lt 35; $i++) {
                    $curr = Get-Process -Id $win.Id
                    $t = $curr.MainWindowTitle
                    if ($t -match '${titleToMatch}') {
                        [System.Windows.Forms.SendKeys]::SendWait('^w')
                        echo 'CLOSED'
                        return
                    }
                    [System.Windows.Forms.SendKeys]::SendWait('^{TAB}')
                    Start-Sleep -Milliseconds 250
                }
            }
        `.trim();
        const res = runPS(psScript, 35000);
        return res.includes('CLOSED');
    } catch (e) { return false; }
}

async function close_youtube_tab(target = null) {
    if (target) return await close_specific_youtube_tab(target);
    if (process.platform !== 'win32') return false;
    try {
        const psScript = `
            Add-Type -AssemblyName System.Windows.Forms
            $ws = New-Object -ComObject WScript.Shell
            $windows = Get-Process chrome | Where-Object { $_.MainWindowTitle -ne '' }
            foreach ($win in $windows) {
                $ws.AppActivate($win.Id)
                Start-Sleep -Milliseconds 400
                for ($i=0; $i -lt 35; $i++) {
                    $curr = Get-Process -Id $win.Id
                    $t = $curr.MainWindowTitle
                    if ($t -match 'YouTube' -or $t -match 'Music' -or $t -match 'Play') {
                        [System.Windows.Forms.SendKeys]::SendWait('^w')
                        echo 'CLOSED'
                        return
                    }
                    [System.Windows.Forms.SendKeys]::SendWait('^{TAB}')
                    Start-Sleep -Milliseconds 250
                }
            }
        `.trim();
        const res = runPS(psScript, 35000);
        return res.includes('CLOSED');
    } catch (e) { return false; }
}

async function control_youtube(action) {
    if (process.platform !== 'win32') return false;
    try {
        const keyMap = { 'play_pause': 'k', 'next': '+n', 'prev': '+p', 'mute': 'm' };
        const key = keyMap[action.toLowerCase()];
        if (!key) return false;
        
        const psScript = `
            Add-Type -AssemblyName System.Windows.Forms
            $ws = New-Object -ComObject WScript.Shell
            $windows = Get-Process chrome | Where-Object { $_.MainWindowTitle -ne '' }
            foreach ($win in $windows) {
                $ws.AppActivate($win.Id)
                Start-Sleep -Milliseconds 400
                for ($i=0; $i -lt 35; $i++) {
                    $curr = Get-Process -Id $win.Id
                    $t = $curr.MainWindowTitle
                    if ($t -match 'YouTube' -or $t -match 'Music' -or $t -match 'Play') {
                        [System.Windows.Forms.SendKeys]::SendWait('${key}')
                        echo 'DONE'
                        return
                    }
                    [System.Windows.Forms.SendKeys]::SendWait('^{TAB}')
                    Start-Sleep -Milliseconds 250
                }
            }
        `.trim();
        const res = runPS(psScript, 35000);
        return res.includes('DONE');
    } catch (e) { return false; }
}

/**
 * Type directly into YouTube Search Box (v3.7.0)
 */
async function type_in_youtube(text) {
    if (process.platform !== 'win32') return false;
    try {
        const escapedText = text.replace(/'/g, "''");
        const psScript = `
            try {
                Add-Type -AssemblyName System.Windows.Forms
                $ws = New-Object -ComObject WScript.Shell
                Set-Clipboard -Value '${escapedText}'
                
                $chromeWins = Get-Process chrome | Where-Object { $_.MainWindowTitle -ne '' }
                foreach ($win in $chromeWins) {
                    $ws.AppActivate($win.Id)
                    Start-Sleep -Milliseconds 600
                    for ($i=0; $i -lt 45; $i++) {
                        $curr = Get-Process -Id $win.Id
                        $t = $curr.MainWindowTitle
                        if ($t -match 'YouTube|Music|Play') {
                            # Clear any overlays/popups
                            [System.Windows.Forms.SendKeys]::SendWait('{ESC}{ESC}')
                            Start-Sleep -Milliseconds 300
                            
                            # Focus Search (/) and type
                            [System.Windows.Forms.SendKeys]::SendWait('/') 
                            Start-Sleep -Milliseconds 400
                            
                            # Select All and Paste
                            [System.Windows.Forms.SendKeys]::SendWait('^a{BACKSPACE}')
                            Start-Sleep -Milliseconds 150
                            [System.Windows.Forms.SendKeys]::SendWait('^v{ENTER}')
                            echo 'TYPED'
                            return
                        }
                        [System.Windows.Forms.SendKeys]::SendWait('^{TAB}')
                        Start-Sleep -Milliseconds 150
                    }
                }
            } catch { echo "FAIL" }
        `.trim();
        
        console.log(`📡 [Vecna/Music] Persistent Type-In v3.7.0...`);
        const res = runPS(psScript, 80000);
        
        if (!res.includes('TYPED')) {
            console.warn(`⚠️ [Vecna] Search Box failed. Falling back to URL Bar.`);
            await play_youtube(text);
        }
        return res.includes('TYPED');
    } catch (e) { return false; }
}

module.exports = {
    resolveUrl,
    play_youtube,
    type_in_youtube,
    control_youtube,
    close_youtube_tab,
    list_youtube_tabs,
    play_youtube_music: play_youtube
};
