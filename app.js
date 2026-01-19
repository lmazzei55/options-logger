// app.js

// Global variables to store application data
let transactions = [];
let portfolio = {};

// Initialize the application when DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeDateInputs();
    setupTabs();
    setupTransactionTypeSwitcher();
    setupOptionOutcomeHandler();
    setupFormSubmissions();
    setupNotifications();
    setupModals();
    loadDataFromStorage();
    updateUI();
});

// Initialize date inputs with current date
function initializeDateInputs() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('stock-date').value = today;
    document.getElementById('option-date').value = today;

    // Set expiration date to 30 days from now by default
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    document.getElementById('option-expiration').value = thirtyDaysLater.toISOString().split('T')[0];
}

// Setup tab navigation
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    tabButtons.forEach(function(button) {
        button.addEventListener('click', function() {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            this.classList.add('active');
            const tabId = this.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });
}

// Setup transaction type switcher
function setupTransactionTypeSwitcher() {
    const typeButtons = document.querySelectorAll('.transaction-type');
    const stockForm = document.getElementById('stock-transaction-form');
    const optionForm = document.getElementById('option-transaction-form');
    
    typeButtons.forEach(function(button) {
        button.addEventListener('click', function() {
            typeButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            const type = this.getAttribute('data-type');
            if (type === 'stock') {
                stockForm.classList.remove('hidden');
                optionForm.classList.add('hidden');
            } else {
                stockForm.classList.add('hidden');
                optionForm.classList.remove('hidden');
            }
        });
    });
}

// Setup option outcome handler
function setupOptionOutcomeHandler() {
    const outcomeSelect = document.getElementById('option-outcome');
    const assignmentDateGroup = document.getElementById('assignment-date-group');
    
    outcomeSelect.addEventListener('change', function() {
        const outcome = outcomeSelect.value;
        if (outcome === 'assigned' || outcome === 'closed') {
            assignmentDateGroup.classList.remove('hidden');
            document.getElementById('option-assignment-date').required = true;
        } else {
            assignmentDateGroup.classList.add('hidden');
            document.getElementById('option-assignment-date').required = false;
        }
    });
}

// Setup form submission handlers
function setupFormSubmissions() {
    // Stock transaction form
    document.getElementById('stock-transaction-form').addEventListener('submit', function(e) {
        e.preventDefault();
        
        const transaction = {
            id: generateId(),
            type: 'stock',
            ticker: document.getElementById('stock-ticker').value.toUpperCase(),
            action: document.getElementById('stock-action').value,
            shares: parseFloat(document.getElementById('stock-shares').value),
            price: parseFloat(document.getElementById('stock-price').value),
            date: document.getElementById('stock-date').value,
            notes: document.getElementById('stock-notes').value,
            timestamp: new Date().getTime()
        };
        
        transaction.total = (transaction.action === 'buy' || transaction.action === 'initial') 
            ? transaction.shares * transaction.price 
            : -transaction.shares * transaction.price;
        
        addTransaction(transaction);
        this.reset();
        initializeDateInputs();
        showNotification('Stock transaction added successfully', 'success');
    });
    
    // Option transaction form
    document.getElementById('option-transaction-form').addEventListener('submit', function(e) {
        e.preventDefault();
        
        const strategy = document.getElementById('option-strategy').value;
        const action = document.getElementById('option-action').value;
        const contracts = parseInt(document.getElementById('option-contracts').value);
        const premium = parseFloat(document.getElementById('option-premium').value);
        const outcome = document.getElementById('option-outcome').value;
        
        const transaction = {
            id: generateId(),
            type: 'option',
            ticker: document.getElementById('option-ticker').value.toUpperCase(),
            strategy: strategy,
            action: action,
            contracts: contracts,
            strike: parseFloat(document.getElementById('option-strike').value),
            premium: premium,
            expiration: document.getElementById('option-expiration').value,
            outcome: outcome,
            date: document.getElementById('option-date').value,
            notes: document.getElementById('option-notes').value,
            timestamp: new Date().getTime()
        };
        
        if (outcome === 'assigned' || outcome === 'closed') {
            transaction.assignmentDate = document.getElementById('option-assignment-date').value;
        }
        
        transaction.totalPremium = contracts * premium * 100;
        transaction.total = (action === 'buy') ? -transaction.totalPremium : transaction.totalPremium;
        
        addTransaction(transaction);
        this.reset();
        initializeDateInputs();
        showNotification('Option transaction added successfully', 'success');
    });
}

// Setup notification system
function setupNotifications() {
    const notification = document.getElementById('notification');
    const closeBtn = document.getElementById('close-notification');
    
    closeBtn.addEventListener('click', function() {
        notification.classList.add('hidden');
    });
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    const messageElement = document.getElementById('notification-message');
    
    notification.classList.remove('success', 'error');
    
    if (type === 'success' || type === 'error') {
        notification.classList.add(type);
    }
    
    messageElement.textContent = message;
    notification.classList.remove('hidden');
    
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 5000);
}

// Setup modals with function expressions (so "this" binding works properly)
function setupModals() {
    const transactionModal = document.getElementById('transaction-modal');
    const closeModalBtn = document.querySelector('.close-modal');
    
    closeModalBtn.addEventListener('click', function() {
        transactionModal.style.display = 'none';
    });
    
    const editModal = document.getElementById('edit-modal');
    const closeEditBtn = document.querySelector('.close-edit-modal');
    
    closeEditBtn.addEventListener('click', function() {
        editModal.style.display = 'none';
    });
    
    const deleteModal = document.getElementById('confirm-delete-modal');
    const cancelDeleteBtn = document.getElementById('cancel-delete');
    
    cancelDeleteBtn.addEventListener('click', function() {
        deleteModal.style.display = 'none';
    });
    
    window.addEventListener('click', function(e) {
        if (e.target === transactionModal) {
            transactionModal.style.display = 'none';
        }
        if (e.target === editModal) {
            editModal.style.display = 'none';
        }
        if (e.target === deleteModal) {
            deleteModal.style.display = 'none';
        }
    });
    
    document.getElementById('edit-transaction').addEventListener('click', function() {
        const id = this.getAttribute('data-id');
        if (id) {
            transactionModal.style.display = 'none';
            openEditModal(id);
        }
    });
    
    document.getElementById('delete-transaction').addEventListener('click', function() {
        const id = this.getAttribute('data-id');
        if (id) {
            transactionModal.style.display = 'none';
            openDeleteConfirmation(id);
        }
    });
    
    document.getElementById('confirm-delete').addEventListener('click', function() {
        const id = this.getAttribute('data-id');
        if (id) {
            deleteTransaction(id);
            deleteModal.style.display = 'none';
        }
    });
}

// Helper function to generate a unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Load data from localStorage
function loadDataFromStorage() {
    const storedTransactions = localStorage.getItem('transactions');
    if (storedTransactions) {
        transactions = JSON.parse(storedTransactions);
    }
    
    const storedPortfolio = localStorage.getItem('portfolio');
    if (storedPortfolio) {
        portfolio = JSON.parse(storedPortfolio);
    }
}

// Save data to localStorage
function saveDataToStorage() {
    localStorage.setItem('transactions', JSON.stringify(transactions));
    localStorage.setItem('portfolio', JSON.stringify(portfolio));
}

// Add a new transaction to the list
function addTransaction(transaction) {
    transactions.push(transaction);
    saveDataToStorage();
    updatePortfolio();
    updateTransactionsUI();
}

// Delete a transaction
function deleteTransaction(id) {
    const index = transactions.findIndex(t => t.id === id);
    if (index !== -1) {
        transactions.splice(index, 1);
        saveDataToStorage();
        updatePortfolio();
        updateTransactionsUI();
        showNotification('Transaction deleted successfully', 'success');
    }
}

// Open delete confirmation modal
function openDeleteConfirmation(id) {
    const deleteModal = document.getElementById('confirm-delete-modal');
    const confirmDeleteBtn = document.getElementById('confirm-delete');
    confirmDeleteBtn.setAttribute('data-id', id);
    deleteModal.style.display = 'block';
}

// Open edit modal (calls showEditTransaction in transactions.js)
function openEditModal(id) {
    const transaction = transactions.find(t => t.id === id);
    if (!transaction) return;
    showEditTransaction(transaction);
}

// Update UI with loaded data
function updateUI() {
    updatePortfolioUI();
    updateTransactionsUI();
}

// Recalculate portfolio from scratch after edits
function recalculatePortfolio() {
    updatePortfolio();
}

// The user’s transactions history page is updated here
function updateTransactionsUI() {
    if (typeof updateTransactionsTable === 'function') {
        updateTransactionsTable();
    }
}
