// portfolio.js

let portfolioData = {};

function updatePortfolio() {
    portfolioData = {};
    
    transactions.forEach(function(transaction) {
        const ticker = transaction.ticker;
        if (!portfolioData[ticker]) {
            portfolioData[ticker] = {
                shares: 0,
                totalCost: 0,
                optionsActive: 0
            };
        }
        
        if (transaction.type === 'stock') {
            if (transaction.action === 'buy' || transaction.action === 'initial') {
                portfolioData[ticker].shares += transaction.shares;
                portfolioData[ticker].totalCost += (transaction.shares * transaction.price);
            } else if (transaction.action === 'sell') {
                const prevShares = portfolioData[ticker].shares;
                const prevCost = portfolioData[ticker].totalCost;
                
                // Subtract shares
                portfolioData[ticker].shares -= transaction.shares;
                
                // Subtract proportional cost
                if (prevShares > 0) {
                    const fractionSold = transaction.shares / prevShares;
                    portfolioData[ticker].totalCost -= (fractionSold * prevCost);
                }
                
                // If all shares sold, reset cost
                if (portfolioData[ticker].shares <= 0) {
                    portfolioData[ticker].shares = 0;
                    portfolioData[ticker].totalCost = 0;
                }
            }
        } 
        else if (transaction.type === 'option') {
            // Ensure the ticker object is present
            if (!portfolioData[ticker]) {
                portfolioData[ticker] = {
                    shares: 0,
                    totalCost: 0,
                    optionsActive: 0
                };
            }
            
            // Track active contracts
            if (transaction.outcome === 'open') {
                portfolioData[ticker].optionsActive += transaction.contracts;
            } 
            else if (transaction.outcome === 'expired' || transaction.outcome === 'closed') {
                portfolioData[ticker].optionsActive -= transaction.contracts;
                if (portfolioData[ticker].optionsActive < 0) {
                    portfolioData[ticker].optionsActive = 0;
                }
            } 
            else if (transaction.outcome === 'assigned') {
                portfolioData[ticker].optionsActive -= transaction.contracts;
                if (portfolioData[ticker].optionsActive < 0) {
                    portfolioData[ticker].optionsActive = 0;
                }
                
                // Assigned put => buy shares at strike minus premium
                if (transaction.strategy === 'cash-secured-put' && transaction.action === 'sell') {
                    const sharesAssigned = transaction.contracts * 100;
                    const costBasis = (transaction.strike * sharesAssigned) - transaction.totalPremium;
                    portfolioData[ticker].shares += sharesAssigned;
                    portfolioData[ticker].totalCost += costBasis;
                }
                // Assigned call => sell shares at strike
                else if (transaction.strategy === 'covered-call' && transaction.action === 'sell') {
                    const sharesAssigned = transaction.contracts * 100;
                    const prevShares = portfolioData[ticker].shares;
                    const prevCost = portfolioData[ticker].totalCost;
                    
                    if (prevShares > 0) {
                        portfolioData[ticker].shares -= sharesAssigned;
                        // Proportional cost reduction
                        const fraction = sharesAssigned / prevShares;
                        portfolioData[ticker].totalCost -= (fraction * prevCost);
                        
                        if (portfolioData[ticker].shares < 0) {
                            portfolioData[ticker].shares = 0;
                            portfolioData[ticker].totalCost = 0;
                        }
                    }
                }
            }
            
            // Premium affects totalCost
            if (transaction.action === 'sell') {
                portfolioData[ticker].totalCost -= transaction.totalPremium;
            } else {
                portfolioData[ticker].totalCost += transaction.totalPremium;
            }
        }
    });
    
    localStorage.setItem('portfolio', JSON.stringify(portfolioData));
    updatePortfolioUI();
}

function updatePortfolioUI() {
    const portfolioBody = document.getElementById('portfolio-body');
    portfolioBody.innerHTML = '';
    
    let totalPositions = 0;
    let totalShares = 0;
    let totalInvestment = 0;
    
    const portfolioKeys = Object.keys(portfolioData);
    if (portfolioKeys.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="5" class="text-center">No portfolio positions found.</td>';
        portfolioBody.appendChild(emptyRow);
    } else {
        portfolioKeys.forEach(function(ticker) {
            const data = portfolioData[ticker];
            
            // Skip if no shares and no options
            if (data.shares === 0 && data.optionsActive === 0) {
                return;
            }
            
            const avgCost = (data.shares > 0) ? (data.totalCost / data.shares) : 0;
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${ticker}</td>
                <td>${data.shares}</td>
                <td>$${avgCost.toFixed(2)}</td>
                <td>$${data.totalCost.toFixed(2)}</td>
                <td>${data.optionsActive}</td>
            `;
            
            // Click row => show position details
            row.addEventListener('click', function() {
                showPositionDetails(ticker);
            });
            
            portfolioBody.appendChild(row);
            totalPositions++;
            totalShares += data.shares;
            totalInvestment += data.totalCost;
        });
    }
    
    document.getElementById('total-positions').textContent = totalPositions;
    document.getElementById('total-shares').textContent = totalShares;
    document.getElementById('total-investment').textContent = `$${totalInvestment.toFixed(2)}`;
    
    const avgCostOverall = (totalShares > 0) ? (totalInvestment / totalShares) : 0;
    document.getElementById('average-cost').textContent = `$${avgCostOverall.toFixed(2)}`;
    
    setupPortfolioSearch();
}

function setupPortfolioSearch() {
    const searchInput = document.getElementById('portfolio-search');
    searchInput.addEventListener('input', function() {
        const searchTerm = searchInput.value.toLowerCase();
        const rows = document.querySelectorAll('#portfolio-body tr');
        
        rows.forEach(function(row) {
            const ticker = row.cells[0].textContent.toLowerCase();
            row.style.display = ticker.includes(searchTerm) ? '' : 'none';
        });
    });
}

function showPositionDetails(ticker) {
    const position = portfolioData[ticker];
    const modal = document.getElementById('transaction-modal');
    const detailsContainer = document.getElementById('transaction-details');
    
    document.getElementById('modal-title').textContent = `${ticker} Position Details`;
    
    const avgCost = (position.shares > 0) ? (position.totalCost / position.shares) : 0;
    
    detailsContainer.innerHTML = `
        <div class="detail-item">
            <span class="detail-label">Ticker:</span>
            <span class="detail-value">${ticker}</span>
        </div>
        <div class="detail-item">
            <span class="detail-label">Shares Held:</span>
            <span class="detail-value">${position.shares}</span>
        </div>
        <div class="detail-item">
            <span class="detail-label">Average Cost:</span>
            <span class="detail-value">$${avgCost.toFixed(2)}</span>
        </div>
        <div class="detail-item">
            <span class="detail-label">Total Investment:</span>
            <span class="detail-value">$${position.totalCost.toFixed(2)}</span>
        </div>
        <div class="detail-item">
            <span class="detail-label">Active Options:</span>
            <span class="detail-value">${position.optionsActive}</span>
        </div>
    `;
    
    const relatedTransactions = transactions.filter(function(t) {
        return t.ticker === ticker;
    });
    
    if (relatedTransactions.length > 0) {
        detailsContainer.innerHTML += `
            <div class="detail-item" style="grid-column: span 2;">
                <span class="detail-label">Recent Transactions:</span>
                <div class="recent-transactions-list">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Action</th>
                                <th>Quantity</th>
                                <th>Price</th>
                            </tr>
                        </thead>
                        <tbody id="related-transactions"></tbody>
                    </table>
                </div>
            </div>
        `;
        
        const relatedTransactionsList = document.getElementById('related-transactions');
        
        relatedTransactions
            .sort(function(a, b) { return new Date(b.date) - new Date(a.date); })
            .slice(0, 5)
            .forEach(function(trx) {
                const row = document.createElement('tr');
                let quantity, price;
                
                if (trx.type === 'stock') {
                    quantity = trx.shares;
                    price = `$${trx.price.toFixed(2)}`;
                } else {
                    quantity = `${trx.contracts} contract${trx.contracts > 1 ? 's' : ''}`;
                    price = `$${trx.premium.toFixed(2)}`;
                }
                
                row.innerHTML = `
                    <td>${trx.date}</td>
                    <td>${trx.type}</td>
                    <td>${trx.action}</td>
                    <td>${quantity}</td>
                    <td>${price}</td>
                `;
                relatedTransactionsList.appendChild(row);
            });
    }
    
    // Hide edit/delete buttons here because these details are for the entire position, not a single transaction
    document.getElementById('edit-transaction').style.display = 'none';
    document.getElementById('delete-transaction').style.display = 'none';
    
    modal.style.display = 'block';
}
