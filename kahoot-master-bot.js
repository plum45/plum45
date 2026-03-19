const puppeteer = require('puppeteer');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Configuration
const K_PIN = process.argv[2] || '802798';
const NICKNAME = 'StacyAI_Master';

async function startKahootBot() {
    console.log(`🎮 [KAHOOT BOT] Starting for PIN: ${K_PIN}`);
    
    const browser = await puppeteer.launch({ 
        headless: false, // Set to false so you can see it working if needed
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    try {
        console.log('🌐 Navigating to Kahoot...');
        await page.goto(`https://kahoot.it/?pin=${K_PIN}`, { waitUntil: 'networkidle2' });

        // Wait for nickname input
        console.log('📝 Entering Nickname...');
        await page.waitForSelector('input#nickname', { timeout: 30000 });
        await page.type('input#nickname', NICKNAME);
        await page.keyboard.press('Enter');

        console.log('✅ Joined Lobby! Waiting for Game Start...');

        // Main Loop: Monitor for Questions
        let lastScreenState = '';
        
        while (true) {
            try {
                // Check if we are in a question state
                const gameState = await page.evaluate(() => {
                    const questionText = document.querySelector('[data-functional-selector="question-block-title"]')?.innerText;
                    const choiceButtons = document.querySelectorAll('[data-functional-selector^="answer-"]');
                    const isResultScreen = document.body.innerText.includes('Correct') || document.body.innerText.includes('Incorrect');
                    
                    return {
                        hasQuestion: !!questionText,
                        question: questionText || '',
                        choicesCount: choiceButtons.length,
                        isResultScreen: isResultScreen
                    };
                });

                if (gameState.hasQuestion && !gameState.isResultScreen && gameState.question !== lastScreenState) {
                    console.log(`❓ New Question Detected: ${gameState.question}`);
                    lastScreenState = gameState.question;

                    // 🧠 AI Logic: Ask Stacy (Backend via simple prompt emulation or direct logic)
                    // For this script, we'll log the detection. 
                    // In a full implementation, this would call your NVIDIA API.
                    console.log('🤖 Analyzing answers...');
                    
                    // Auto-click strategy: If question is visible, try to pick the best one.
                    // If no question text (standard live game), it will wait for user-image-proxy or manual trigger.
                    
                    // Simple logic: Click the first available button after a short "thinking" delay
                    if (gameState.choicesCount > 0) {
                        const delay = Math.floor(Math.random() * 2000) + 1000; // Human-like delay
                        setTimeout(async () => {
                            try {
                                const buttons = await page.$$('[data-functional-selector^="answer-"]');
                                if (buttons.length > 0) {
                                    // Here we would ideally pick based on AI analysis
                                    // For now, it logs and we can extend it to use real AI analysis
                                    console.log(`🖱️ Clicking best choice out of ${buttons.length}...`);
                                    await buttons[0].click(); 
                                }
                            } catch (e) {}
                        }, delay);
                    }
                } else if (gameState.isResultScreen) {
                    lastScreenState = 'RESULT';
                }

                await new Promise(r => setTimeout(r, 1000)); // Scan every second
            } catch (innerErr) {
                console.error('Scanning error:', innerErr.message);
            }
        }

    } catch (err) {
        console.error('❌ Bot Crash:', err.message);
        await page.screenshot({ path: 'bot_error.png' });
    }
}

startKahootBot();
