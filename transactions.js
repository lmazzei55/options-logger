// transactions.js

function updateTransactionsTable() {
    const transactionsBody = document.getElementById('transactions-body');
    const searchInput = document.getElementById('transactions-search');
    const typeFilter = document.getElementById('transaction-type-filter');
    
    transactionsBody.innerHTML = '';
    
    const searchTerm = searchInput.value.toLowerCase();
    const filterType = typeFilter.value;
    
    // Sort newest first
    const sortedTransactions = [...transactions].sort(function(a, b) {
        return new Date(b.date) - new Date(a.date);
    });
    
    sortedTransactions.forEach(function(transaction) {
        if (filterType !== 'all' && transaction.type !== filterType) {
            return;
        }
        if (searchTerm && !transactionMatchesSearch(transaction, searchTerm)) {
            return;
        }
        
        const row = document.createElement('tr');
        row.dataset.id = transaction.id;
        
        row.innerHTML = `
            <td>${formatDate(transaction.date)}</td>
            <td>${capitalizeFirstLetter(transaction.type)}</td>
            <td>${transaction.ticker}</td>
            <td>${getActionDisplay(transaction)}</td>
            <td>${getQuantityDisplay(transaction)}</td>
            <td>${getPriceDisplay(transaction)}</td>
            <td>${formatCurrency(transaction.total)}</td>
            <td>${getStatusDisplay(transaction)}</td>
            <td>
                <!-- “View” will open the details modal for that single transaction -->
                <button class="btn-view-transaction" data-id="${transaction.id}">View</button>
            </td>
        `;
        
        transactionsBody.appendChild(row);
    });
    
    // Wire up the “View” button
    document.querySelectorAll('.btn-view-transaction').forEach(function(button) {
        button.addEventListener('click', function() {
            const id = button.getAttribute('data-id');
            showTransactionDetails(id);
        });
    });
    
    // Re-attach search & filter listeners if not already
    if (!searchInput.hasEventListener) {
        searchInput.addEventListener('input', updateTransactionsTable);
        searchInput.hasEventListener = true;
    }
    if (!typeFilter.hasEventListener) {
        typeFilter.addEventListener('change', updateTransactionsTable);
        typeFilter.hasEventListener = true;
    }
}

function transactionMatchesSearch(transaction, searchTerm) {
    if (transaction.ticker.toLowerCase().includes(searchTerm)) {
        return true;
    }
    if (transaction.notes && transaction.notes.toLowerCase().includes(searchTerm)) {
        return true;
    }
    if (transaction.strategy && transaction.strategy.toLowerCase().includes(searchTerm)) {
        return true;
    }
    return false;
}

function getActionDisplay(transaction) {
    if (transaction.type === 'stock') {
        return capitalizeFirstLetter(transaction.action);
    } else {
        const actionText = (transaction.action === 'buy') ? 'Buy' : 'Sell';
        const strategyText = transaction.strategy
            .split('-')
            .map(function(word) { return capitalizeFirstLetter(word); })
            .join(' ');
        return `${actionText} ${strategyText}`;
    }
}

function getQuantityDisplay(transaction) {
    if (transaction.type === 'stock') {
        return `${formatNumber(transaction.shares)} shares`;
    } else {
        return `${transaction.contracts} contract${transaction.contracts > 1 ? 's' : ''}`;
    }
}

function getPriceDisplay(transaction) {
    if (transaction.type === 'stock') {
        return formatCurrency(transaction.price);
    } else {
        return formatCurrency(transaction.premium) + ' per share';
    }
}

function getStatusDisplay(transaction) {
    if (transaction.type === 'stock') {
        return 'Completed';
    } else {
        return capitalizeFirstLetter(transaction.outcome);
    }
}

function showTransactionDetails(id) {
    const transaction = transactions.find(function(t) { return t.id === id; });
    if (!transaction) return;
    
    const modal = document.getElementById('transaction-modal');
    const detailsContainer = document.getElementById('transaction-details');
    const modalTitle = document.getElementById('modal-title');
    const editBtn = document.getElementById('edit-transaction');
    const deleteBtn = document.getElementById('delete-transaction');
    
    // Show the transaction details
    modalTitle.textContent = `${transaction.ticker} ${getActionDisplay(transaction)}`;
    
    let detailsHtml = '';
    detailsHtml += createDetailItem('Transaction Type', capitalizeFirstLetter(transaction.type));
    detailsHtml += createDetailItem('Date', formatDate(transaction.date));
    detailsHtml += createDetailItem('Ticker', transaction.ticker);
    
    if (transaction.type === 'stock') {
        detailsHtml += createDetailItem('Action', capitalizeFirstLetter(transaction.action));
        detailsHtml += createDetailItem('Shares', formatNumber(transaction.shares));
        detailsHtml += createDetailItem('Price per Share', formatCurrency(transaction.price));
        detailsHtml += createDetailItem('Total Value', formatCurrency(Math.abs(transaction.total)));
    } else {
        detailsHtml += createDetailItem('Strategy', transaction.strategy.split('-').map(capitalizeFirstLetter).join(' '));
        detailsHtml += createDetailItem('Action', capitalizeFirstLetter(transaction.action));
        detailsHtml += createDetailItem('Contracts', transaction.contracts);
        detailsHtml += createDetailItem('Strike Price', formatCurrency(transaction.strike));
        detailsHtml += createDetailItem('Premium per Share', formatCurrency(transaction.premium));
        detailsHtml += createDetailItem('Total Premium', formatCurrency(Math.abs(transaction.total)));
        detailsHtml += createDetailItem('Expiration Date', formatDate(transaction.expiration));
        detailsHtml += createDetailItem('Status', capitalizeFirstLetter(transaction.outcome));
        
        if (transaction.outcome === 'assigned' || transaction.outcome === 'closed') {
            detailsHtml += createDetailItem('Assignment/Close Date', formatDate(transaction.assignmentDate));
        }
    }
    
    if (transaction.notes) {
        detailsHtml += createDetailItem('Notes', transaction.notes);
    }
    
    detailsContainer.innerHTML = detailsHtml;
    
    // Show edit/delete for an individual transaction
    editBtn.style.display = 'inline-block';
    deleteBtn.style.display = 'inline-block';
    
    // Assign the transaction ID to the buttons so the click handlers know which one to edit/delete
    editBtn.setAttribute('data-id', transaction.id);
    deleteBtn.setAttribute('data-id', transaction.id);
    
    modal.style.display = 'block';
}

function createDetailItem(label, value) {
    return `
        <div class="detail-item">
            <span class="detail-label">${label}</span>
            <span class="detail-value">${value}</span>
        </div>
    `;
}

// Show the edit transaction form (modal)
function showEditTransaction(transaction) {
    const modal = document.getElementById('edit-modal');
    const formContainer = document.getElementById('edit-form-container');
    
    if (transaction.type === 'stock') {
        formContainer.innerHTML = createStockEditForm(transaction);
    } else {
        formContainer.innerHTML = createOptionEditForm(transaction);
    }
    
    const form = formContainer.querySelector('form');
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        submitEditForm(transaction.id, transaction.type, form);
        modal.style.display = 'none';
    });
    
    // If option, handle outcome changes
    if (transaction.type === 'option') {
        const outcomeSelect = form.querySelector('#edit-option-outcome');
        const assignmentDateGroup = form.querySelector('#edit-assignment-date-group');
        
        outcomeSelect.addEventListener('change', function() {
            const outcome = outcomeSelect.value;
            if (outcome === 'assigned' || outcome === 'closed') {
                assignmentDateGroup.classList.remove('hidden');
                form.querySelector('#edit-option-assignment-date').required = true;
            } else {
                assignmentDateGroup.classList.add('hidden');
                form.querySelector('#edit-option-assignment-date').required = false;
            }
        });
        outcomeSelect.dispatchEvent(new Event('change'));
    }
    
    modal.style.display = 'block';
}

function createStockEditForm(transaction) {
    return `
      <form id="edit-stock-form" class="transaction-form">
        <input type="hidden" id="edit-transaction-id" value="${transaction.id}"/>
        
        <div class="form-group">
          <label for="edit-stock-ticker">Ticker Symbol</label>
          <input type="text" id="edit-stock-ticker" required value="${transaction.ticker}"/>
        </div>
        <div class="form-group">
          <label for="edit-stock-action">Action</label>
          <select id="edit-stock-action" required>
            <option value="buy" ${transaction.action === 'buy' ? 'selected' : ''}>Buy</option>
            <option value="sell" ${transaction.action === 'sell' ? 'selected' : ''}>Sell</option>
            <option value="initial" ${transaction.action === 'initial' ? 'selected' : ''}>Initial Holding</option>
          </select>
        </div>
        <div class="form-group">
          <label for="edit-stock-shares">Number of Shares</label>
          <input type="number" id="edit-stock-shares" required min="1" step="1" value="${transaction.shares}"/>
        </div>
        <div class="form-group">
          <label for="edit-stock-price">Price per Share ($)</label>
          <input type="number" id="edit-stock-price" required min="0.01" step="0.01" value="${transaction.price}"/>
        </div>
        <div class="form-group">
          <label for="edit-stock-date">Date</label>
          <input type="date" id="edit-stock-date" required value="${transaction.date}"/>
        </div>
        <div class="form-group">
          <label for="edit-stock-notes">Notes</label>
          <textarea id="edit-stock-notes">${transaction.notes || ''}</textarea>
        </div>
        <button type="submit" class="btn-submit">Update Transaction</button>
      </form>
    `;
}

function createOptionEditForm(transaction) {
    return `
      <form id="edit-option-form" class="transaction-form">
        <input type="hidden" id="edit-transaction-id" value="${transaction.id}"/>
        
        <div class="form-group">
          <label for="edit-option-ticker">Underlying Stock</label>
          <input type="text" id="edit-option-ticker" required value="${transaction.ticker}"/>
        </div>
        <div class="form-group">
          <label for="edit-option-strategy">Strategy</label>
          <select id="edit-option-strategy" required>
            <option value="cash-secured-put" ${transaction.strategy === 'cash-secured-put' ? 'selected' : ''}>Cash-Secured Put</option>
            <option value="covered-call" ${transaction.strategy === 'covered-call' ? 'selected' : ''}>Covered Call</option>
            <option value="long-call" ${transaction.strategy === 'long-call' ? 'selected' : ''}>Long Call</option>
            <option value="long-put" ${transaction.strategy === 'long-put' ? 'selected' : ''}>Long Put</option>
            <option value="other" ${transaction.strategy === 'other' ? 'selected' : ''}>Other</option>
          </select>
        </div>
        <div class="form-group">
          <label for="edit-option-action">Action</label>
          <select id="edit-option-action" required>
            <option value="buy" ${transaction.action === 'buy' ? 'selected' : ''}>Buy</option>
            <option value="sell" ${transaction.action === 'sell' ? 'selected' : ''}>Sell</option>
          </select>
        </div>
        <div class="form-group">
          <label for="edit-option-contracts">Number of Contracts</label>
          <input type="number" id="edit-option-contracts" required min="1" step="1" value="${transaction.contracts}"/>
        </div>
        <div class="form-group">
          <label for="edit-option-strike">Strike Price ($)</label>
          <input type="number" id="edit-option-strike" required min="0.01" step="0.01" value="${transaction.strike}"/>
        </div>
        <div class="form-group">
          <label for="edit-option-premium">Premium per Share ($)</label>
          <input type="number" id="edit-option-premium" required min="0.01" step="0.01" value="${transaction.premium}"/>
        </div>
        <div class="form-group">
          <label for="edit-option-expiration">Expiration Date</label>
          <input type="date" id="edit-option-expiration" required value="${transaction.expiration}"/>
        </div>
        <div class="form-group">
          <label for="edit-option-outcome">Outcome</label>
          <select id="edit-option-outcome" required>
            <option value="open" ${transaction.outcome === 'open' ? 'selected' : ''}>Open</option>
            <option value="expired" ${transaction.outcome === 'expired' ? 'selected' : ''}>Expired</option>
            <option value="assigned" ${transaction.outcome === 'assigned' ? 'selected' : ''}>Assigned</option>
            <option value="closed" ${transaction.outcome === 'closed' ? 'selected' : ''}>Closed</option>
          </select>
        </div>
        <div class="form-group ${(transaction.outcome !== 'assigned' && transaction.outcome !== 'closed') ? 'hidden' : ''}" id="edit-assignment-date-group">
          <label for="edit-option-assignment-date">Assignment/Close Date</label>
          <input type="date" id="edit-option-assignment-date" ${(transaction.outcome === 'assigned' || transaction.outcome === 'closed') ? 'required' : ''} value="${transaction.assignmentDate || ''}"/>
        </div>
        <div class="form-group">
          <label for="edit-option-date">Transaction Date</label>
          <input type="date" id="edit-option-date" required value="${transaction.date}"/>
        </div>
        <div class="form-group">
          <label for="edit-option-notes">Notes</label>
          <textarea id="edit-option-notes">${transaction.notes || ''}</textarea>
        </div>
        <button type="submit" class="btn-submit">Update Transaction</button>
      </form>
    `;
}

function submitEditForm(transactionId, type, form) {
    const index = transactions.findIndex(function(t) { return t.id === transactionId; });
    if (index === -1) return;
    
    // Update transaction data
    if (type === 'stock') {
        updateStockTransaction(index, form);
    } else {
        updateOptionTransaction(index, form);
    }
    
    // Save and recalc
    saveDataToStorage();
    recalculatePortfolio();
    updateUI();
    showNotification('Transaction updated successfully', 'success');
}

function updateStockTransaction(index, form) {
    const ticker = form.querySelector('#edit-stock-ticker').value.toUpperCase();
    const action = form.querySelector('#edit-stock-action').value;
    const shares = parseFloat(form.querySelector('#edit-stock-shares').value);
    const price = parseFloat(form.querySelector('#edit-stock-price').value);
    const date = form.querySelector('#edit-stock-date').value;
    const notes = form.querySelector('#edit-stock-notes').value;
    
    transactions[index].ticker = ticker;
    transactions[index].action = action;
    transactions[index].shares = shares;
    transactions[index].price = price;
    transactions[index].date = date;
    transactions[index].notes = notes;
    
    transactions[index].total = (action === 'buy' || action === 'initial') 
      ? shares * price 
      : -shares * price;
}

function updateOptionTransaction(index, form) {
    const ticker = form.querySelector('#edit-option-ticker').value.toUpperCase();
    const strategy = form.querySelector('#edit-option-strategy').value;
    const action = form.querySelector('#edit-option-action').value;
    const contracts = parseInt(form.querySelector('#edit-option-contracts').value);
    const strike = parseFloat(form.querySelector('#edit-option-strike').value);
    const premium = parseFloat(form.querySelector('#edit-option-premium').value);
    const expiration = form.querySelector('#edit-option-expiration').value;
    const outcome = form.querySelector('#edit-option-outcome').value;
    const date = form.querySelector('#edit-option-date').value;
    const notes = form.querySelector('#edit-option-notes').value;
    
    let assignmentDate = null;
    if (outcome === 'assigned' || outcome === 'closed') {
        assignmentDate = form.querySelector('#edit-option-assignment-date').value;
    }
    
    transactions[index].ticker = ticker;
    transactions[index].strategy = strategy;
    transactions[index].action = action;
    transactions[index].contracts = contracts;
    transactions[index].strike = strike;
    transactions[index].premium = premium;
    transactions[index].expiration = expiration;
    transactions[index].outcome = outcome;
    transactions[index].date = date;
    transactions[index].notes = notes;
    transactions[index].assignmentDate = assignmentDate;
    
    const multiplier = 100;
    const premiumTotal = contracts * premium * multiplier;
    
    transactions[index].totalPremium = premiumTotal;
    transactions[index].total = (action === 'buy') 
      ? -premiumTotal 
      : premiumTotal;
}

// -----------------------
// Utility helper functions
// -----------------------
function capitalizeFirstLetter(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatNumber(num) {
    return Number(num).toLocaleString();
}

function formatCurrency(num) {
    return `$${Number(num).toFixed(2)}`;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr; // fallback if invalid
    // Format YYYY-MM-DD or local
    return d.toISOString().split('T')[0];
}
