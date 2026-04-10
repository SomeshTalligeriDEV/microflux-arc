/**
 * trading.js — Paper Trading Engine logic
 */

class TradingEngine {
    constructor(initialBalance = 10000) {
        this.balance = initialBalance; // USD
        this.btcHoldings = 0;           // BTC
        this.lastAction = 'NONE';
        this.entryPrice = 0;
    }

    /**
     * Execute a simulated BUY order
     */
    buyBTC(price, amountUsd = 1000) {
        if (this.balance < amountUsd) {
            return { success: false, message: 'Insufficient USD balance' };
        }

        const btcToBuy = amountUsd / price;
        this.balance -= amountUsd;
        this.btcHoldings += btcToBuy;
        this.lastAction = 'BUY';
        this.entryPrice = price;

        return {
            success: true,
            amount: btcToBuy,
            price: price,
            newBalance: this.balance
        };
    }

    /**
     * Execute a simulated SELL order (Sell all)
     */
    sellBTC(price) {
        if (this.btcHoldings <= 0) {
            return { success: false, message: 'No BTC holdings to sell' };
        }

        const usdGained = this.btcHoldings * price;
        this.balance += usdGained;
        const btcSold = this.btcHoldings;
        this.btcHoldings = 0;
        this.lastAction = 'SELL';

        const profit = usdGained - (btcSold * this.entryPrice);

        return {
            success: true,
            amount: btcSold,
            price: price,
            usdGained: usdGained,
            profit: profit,
            newBalance: this.balance
        };
    }

    getPortfolioValue(currentPrice) {
        return this.balance + (this.btcHoldings * currentPrice);
    }

    getStatus() {
        return {
            usd: this.balance.toFixed(2),
            btc: this.btcHoldings.toFixed(6),
            lastAction: this.lastAction
        };
    }
}

module.exports = TradingEngine;
