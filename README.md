# 🌞 Decentralized Forecasting dApp for Renewable Energy Intermittency

Welcome to a groundbreaking Web3 solution for tackling the intermittency of renewable energy sources! This dApp enables decentralized data sharing and collaborative forecasting on the Stacks blockchain using Clarity smart contracts. By crowdsourcing weather, production, and grid data, it helps utilities and grid operators plan more effectively, reducing reliance on fossil fuels and minimizing energy waste.

## ✨ Features
🔄 Crowdsourced data submission for weather, solar/wind output, and grid status  
📈 Collaborative forecasting models with accuracy verification  
💰 Token-based incentives for accurate data providers and forecasters  
🗳️ Community governance for model improvements and parameter tweaks  
🔒 Secure, immutable storage of historical data and forecasts  
📊 Analytics dashboard for grid planners to query aggregated insights  
🚀 Integration with oracles for real-time validation  
⚡ Prevention of spam through staking and reputation systems  

## 🛠 How It Works
This dApp leverages 8 Clarity smart contracts to create a robust, decentralized ecosystem. Users interact via a simple frontend, but all logic is on-chain for transparency and security.

**For Data Providers**  
- Register your account and stake tokens for reputation.  
- Submit real-time or historical data (e.g., wind speeds, solar irradiance) using a unique hash for verification.  
- Earn rewards if your data contributes to accurate forecasts.  

**For Forecasters**  
- Access aggregated data feeds.  
- Submit your intermittency forecasts (e.g., predicted energy dips).  
- Stake on your forecast's confidence—higher accuracy means bigger payouts!  

**For Grid Operators/Planners**  
- Query verified forecasts and historical trends.  
- Use governance to propose data model upgrades.  
- Verify data integrity instantly via on-chain proofs.  

That's it! The system automatically verifies outcomes against oracle-fed actuals, distributes rewards, and evolves through decentralized votes.

## 📂 Smart Contracts Overview
The project is built with 8 interconnected Clarity smart contracts for modularity and security:  
1. **UserRegistry.clar**: Handles user registration, roles (provider, forecaster, operator), and reputation tracking.  
2. **DataSubmission.clar**: Manages submission and hashing of renewable data, with anti-duplicate checks.  
3. **ForecastSubmission.clar**: Allows forecast entries with timestamps and confidence levels.  
4. **OracleIntegration.clar**: Interfaces with external oracles for real-world data validation (e.g., weather APIs).  
5. **AccuracyVerifier.clar**: Compares forecasts to actuals and calculates scores post-event.  
6. **RewardToken.clar**: An SIP-10 compliant fungible token for incentives and staking.  
7. **RewardDistributor.clar**: Pools and distributes tokens based on verification results.  
8. **Governance.clar**: Enables token-weighted voting for protocol upgrades, like adjusting reward formulas.  

## 🚀 Getting Started
Clone the repo, deploy the contracts on Stacks testnet, and build your frontend to interact. Protect the planet—one forecast at a time!