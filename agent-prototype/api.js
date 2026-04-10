/**
 * api.js — MicroFlux-Gated Binance API Client
 */

const axios = require('axios');

/**
 * Simulate a MicroFlux payment verification
 * Returns a mock transaction ID if successful
 */
async function checkPayment() {
    // In a real scenario, this would check the Algorand blockchain for an App Call to MicroFlux-X1
    console.log('[MicroFlux] Validating API access payment...');
    
    // Simulate slight delay for "on-chain" verification
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
        success: true,
        txId: "mfx_pay_" + Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString()
    };
}

/**
 * Fetch real-time BTC price from Binance
 */
async function fetchBTCPrice() {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
        return parseFloat(response.data.price);
    } catch (error) {
        console.error('[API Error] Failed to fetch Binance data:', error.message);
        return null;
    }
}

module.exports = {
    checkPayment,
    fetchBTCPrice
};
