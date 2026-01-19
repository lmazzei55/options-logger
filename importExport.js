// importExport.js

document.addEventListener('DOMContentLoaded', function() {
    setupImportExport();
});

function setupImportExport() {
    const exportBtn = document.getElementById('export-btn');
    exportBtn.addEventListener('click', exportTransactionsToCSV);
    
    const importFile = document.getElementById('import-file');
    importFile.addEventListener('change', handleFileSelect);
    
    const importBtn = document.getElementById('import-btn');
    importBtn.addEventListener('click', showImportPreview);
    
    const confirmImportBtn = document.getElementById('confirm-import');
    confirmImportBtn.addEventListener('click', confirmImport);
    
    const cancelImportBtn = document.getElementById('cancel-import');
    cancelImportBtn.addEventListener('click', cancelImport);
}

function exportTransactionsToCSV() {
    if (transactions.length === 0) {
        showNotification('No transactions to export', 'error');
        return;
    }
    
    let csv = 'id,type,ticker,action,date,shares,contracts,price,premium,strike,expiration,outcome,assignmentDate,total,notes\n';
    
    transactions.forEach(function(transaction) {
        const row = [
            transaction.id,
            transaction.type,
            transaction.ticker,
            transaction.action,
            transaction.date,
            transaction.type === 'stock' ? transaction.shares : '',
            transaction.type === 'option' ? transaction.contracts : '',
            transaction.type === 'stock' ? transaction.price : '',
            transaction.type === 'option' ? transaction.premium : '',
            transaction.type === 'option' ? transaction.strike : '',
            transaction.type === 'option' ? transaction.expiration : '',
            transaction.type === 'option' ? transaction.outcome : '',
            transaction.type === 'option' && transaction.assignmentDate ? transaction.assignmentDate : '',
            transaction.total,
            transaction.notes ? transaction.notes.replace(/,/g, ';').replace(/\n/g, ' ') : ''
        ];
        csv += row.join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `trading_journal_export_${formatDate(new Date())}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('Transactions exported successfully', 'success');
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    const importBtn = document.getElementById('import-btn');
    
    if (file) {
        const fileExt = file.name.split('.').pop().toLowerCase();
        if (fileExt !== 'csv') {
            showNotification('Please select a CSV file', 'error');
            event.target.value = '';
            importBtn.disabled = true;
            return;
        }
        importBtn.disabled = false;
    } else {
        importBtn.disabled = true;
    }
}

let importData = [];

function showImportPreview() {
    const file = document.getElementById('import-file').files[0];
    
    if (!file) {
        showNotification('No file selected', 'error');
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const csvData = e.target.result;
            const parsedData = parseCSV(csvData);
            const requiredHeaders = ['id', 'type', 'ticker', 'action', 'date'];
            const header = parsedData[0];
            
            const missingHeaders = requiredHeaders.filter(function(h) { return !header.includes(h); });
            if (missingHeaders.length > 0) {
                throw new Error(`Missing required headers: ${missingHeaders.join(', ')}`);
            }
            
            importData = parsedData.slice(1).map(function(row) {
                const obj = {};
                header.forEach(function(key, index) {
                    obj[key] = row[index] || '';
                });
                return obj;
            });
            
            importData = importData.filter(function(item) {
                return item.ticker && item.type && item.action && item.date;
            });
            
            if (importData.length === 0) {
                throw new Error('No valid transactions found in the file');
            }
            
            updateImportPreview();
            document.querySelector('.import-preview').classList.remove('hidden');
            
        } catch (error) {
            showNotification(`Error parsing CSV file: ${error.message}`, 'error');
        }
    };
    
    reader.onerror = function() {
        showNotification('Error reading file', 'error');
    };
    
    reader.readAsText(file);
}

function parseCSV(text) {
    const lines = text.split('\n');
    return lines.map(function(line) {
        const values = [];
        let inQuote = false;
        let currentValue = '';
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"' && (i === 0 || line[i-1] !== '\\')) {
                inQuote = !inQuote;
            } else if (char === ',' && !inQuote) {
                values.push(currentValue);
                currentValue = '';
            } else {
                currentValue += char;
            }
        }
        values.push(currentValue);
        return values;
    }).filter(function(row) {
        return row.length > 1 && row.some(function(cell) { return cell.trim() !== ''; });
    });
}

function updateImportPreview() {
    const previewBody = document.getElementById('import-preview-body');
    const summaryElement = document.getElementById('import-summary');
    
    previewBody.innerHTML = '';
    
    const stockCount = importData.filter(function(item) { return item.type === 'stock'; }).length;
    const optionCount = importData.filter(function(item) { return item.type === 'option'; }).length;
    summaryElement.textContent = `Found ${importData.length} transactions: ${stockCount} stock and ${optionCount} option transactions.`;
    
    importData.slice(0, 5).forEach(function(item) {
        const row = document.createElement('tr');
        
        const date = document.createElement('td');
        date.textContent = item.date;
        
        const type = document.createElement('td');
        type.textContent = item.type;
        
        const ticker = document.createElement('td');
        ticker.textContent = item.ticker;
        
        const action = document.createElement('td');
        action.textContent = item.action;
        
        const quantity = document.createElement('td');
        quantity.textContent = item.type === 'stock' ? item.shares : (item.contracts + ' contracts');
        
        const price = document.createElement('td');
        price.textContent = item.type === 'stock' ? ('$' + parseFloat(item.price || 0).toFixed(2)) : ('$' + parseFloat(item.premium || 0).toFixed(2));
        
        row.appendChild(date);
        row.appendChild(type);
        row.appendChild(ticker);
        row.appendChild(action);
        row.appendChild(quantity);
        row.appendChild(price);
        
        previewBody.appendChild(row);
    });
    
    if (importData.length > 5) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 6;
        cell.textContent = `... and ${importData.length - 5} more transaction(s)`;
        cell.style.textAlign = 'center';
        cell.style.fontStyle = 'italic';
        row.appendChild(cell);
        previewBody.appendChild(row);
    }
}

function confirmImport() {
    try {
        let importCount = 0;
        let skipCount = 0;
        
        importData.forEach(function(item) {
            if (!item.ticker || !item.type || !item.action || !item.date) {
                console.warn('Skipping incomplete transaction:', item);
                skipCount++;
                return;
            }
            
            const transaction = {
                id: item.id || generateId(),
                type: item.type,
                ticker: item.ticker.toUpperCase(),
                action: item.action,
                date: item.date,
                notes: item.notes || '',
                timestamp: item.timestamp || new Date().getTime()
            };
            
            if (transactions.some(function(t) { return t.id === transaction.id; })) {
                console.warn('Skipping duplicate transaction with ID:', transaction.id);
                skipCount++;
                return;
            }
            
            if (transaction.type === 'stock') {
                const shares = parseFloat(item.shares);
                const price = parseFloat(item.price);
                
                if (isNaN(shares) || isNaN(price) || shares <= 0 || price < 0) {
                    console.warn('Skipping invalid stock transaction:', item);
                    skipCount++;
                    return;
                }
                
                transaction.shares = shares;
                transaction.price = price;
                transaction.total = (transaction.action === 'buy' || transaction.action === 'initial') 
                    ? transaction.shares * transaction.price 
                    : -transaction.shares * transaction.price;
            } else if (transaction.type === 'option') {
                const contracts = parseInt(item.contracts);
                const premium = parseFloat(item.premium);
                const strike = parseFloat(item.strike);
                
                if (isNaN(contracts) || isNaN(premium) || isNaN(strike) || contracts <= 0 || premium < 0 || strike <= 0) {
                    console.warn('Skipping invalid option transaction:', item);
                    skipCount++;
                    return;
                }
                
                transaction.strategy = item.strategy || 'other';
                transaction.contracts = contracts;
                transaction.strike = strike;
                transaction.premium = premium;
                transaction.expiration = item.expiration;
                transaction.outcome = item.outcome || 'open';
                
                if (item.assignmentDate) {
                    transaction.assignmentDate = item.assignmentDate;
                }
                
                transaction.totalPremium = transaction.contracts * transaction.premium * 100;
                transaction.total = (transaction.action === 'buy') 
                    ? -transaction.totalPremium 
                    : transaction.totalPremium;
            } else {
                console.warn('Skipping transaction with invalid type:', item);
                skipCount++;
                return;
            }
            
            transactions.push(transaction);
            importCount++;
        });
        
        saveDataToStorage();
        updatePortfolio();
        updateTransactionsUI();
        
        cancelImport();
        
        const skipMessage = skipCount > 0 ? ` (${skipCount} skipped)` : '';
        showNotification(`Imported ${importCount} transactions successfully${skipMessage}`, 'success');
        
    } catch (error) {
        showNotification(`Error importing data: ${error.message}`, 'error');
    }
}

function cancelImport() {
    document.getElementById('import-file').value = '';
    document.querySelector('.import-preview').classList.add('hidden');
    document.getElementById('import-btn').disabled = true;
}
