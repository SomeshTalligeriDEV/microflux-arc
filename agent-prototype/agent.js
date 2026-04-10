/**
 * agent.js — Autonomous AI Trading Agent Main Loop
 * 
 * To run: 
 * 1. npm install axios
 * 2. node agent.js
 */

const { checkPayment, fetchBTCPrice } = require('./api');
const TradingEngine = require('./trading');

const engine = new TradingEngine(10000); // Start with $10,000
const LOOP_INTERVAL = 10000; // 10 seconds

console.log('--------------------------------------------------');
console.log('🤖 MICROFLUX-X1: AUTONOMOUS TRADING AGENT STARTING');
console.log('--------------------------------------------------');
console.log(`Initial Balance: $${engine.balance}`);
console.log(`Strategy: BUY < $60,000 | SELL > $65,000`);
console.log('--------------------------------------------------\n');

async function runAgent() {
    try {
        // 1. Check MicroFlux Payment status before accessing data
        const payment = await checkPayment();
        if (!payment.success) {
            console.log('[Agent] ❌ Access denied. MicroFlux payment required.');
            return;
        }
        console.log(`[Agent] ✅ Payment verified! TxId: ${payment.txId}`);

        // 2. Fetch Market Data
        const price = await fetchBTCPrice();
        if (!price) return;

        console.log(`[Market] Current BTC Price: $${price.toLocaleString()}`);

        // 3. Decide and Execute
        if (price < 60000 && engine.lastAction !== 'BUY') {
            console.log('[Decision] 🟢 Price is low. Executing BUY...');
            const result = engine.buyBTC(price, 1000);
            if (result.success) {
                console.log(`[Trade] Purchased ${result.amount.toFixed(6)} BTC @ $${price}`);
            }
        } 
        else if (price > 65000 && engine.btcHoldings > 0) {
            console.log('[Decision] 🔴 Price target reached. Executing SELL...');
            const result = engine.sellBTC(price);
            if (result.success) {
                console.log(`[Trade] Sold ${result.amount.toFixed(6)} BTC @ $${price}`);
                console.log(`[Trade] Profit realized: $${result.profit.toFixed(2)}`);
            }
        } else {
            console.log('[Decision] ⚪ Holding position. No action required.');
        }

        // 4. Output Status
        const status = engine.getStatus();
        const portfolio = engine.getPortfolioValue(price);
        
        console.log(`\n[Portfolio Status]`);
        console.log(`   Balance: $${status.usd}`);
        if (engine.btcHoldings > 0) {
          console.log(`   Holdings: ${status.btc} BTC`);
        }
        console.log(`   Total Value: $${portfolio.toFixed(2)}`);
        console.log('--------------------------------------------------\n');

    } catch (error) {
        console.error('[Agent Loop Error]', error);
    }
}

// Start the continuous loop
setInterval(runAgent, LOOP_INTERVAL);

// Run immediately on start
runAgent();
