// =============================
// AI ANALYSIS FUNCTIONALITY
// =============================

// Store current analysis data for export
let currentAnalysisData = null;
let currentAnalysisParams = null;

// Initialize AI Analysis section
function initAIAnalysis() {
    const modeSelect = document.getElementById('ai-analysis-mode');
    const singleDateGroup = document.getElementById('ai-single-date-group');
    const startDateGroup = document.getElementById('ai-start-date-group');
    const endDateGroup = document.getElementById('ai-end-date-group');
    const runButton = document.getElementById('run-ai-analysis');
    const resultsDiv = document.getElementById('ai-analysis-results');
    
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    const singleDateInput = document.getElementById('ai-analysis-date');
    if (singleDateInput) {
        singleDateInput.value = today;
    }
    
    // Toggle date inputs based on mode
    if (modeSelect) {
        modeSelect.addEventListener('change', function() {
            if (this.value === 'single') {
                singleDateGroup.style.display = 'block';
                startDateGroup.style.display = 'none';
                endDateGroup.style.display = 'none';
            } else {
                singleDateGroup.style.display = 'none';
                startDateGroup.style.display = 'block';
                endDateGroup.style.display = 'block';
            }
        });
    }
    
    // Run AI analysis button
    if (runButton) {
        runButton.addEventListener('click', async function() {
            await runAIAnalysis();
        });
    }
    
    // Export buttons
    const exportPdfBtn = document.getElementById('export-ai-pdf');
    const exportHtmlBtn = document.getElementById('export-ai-html');
    const exportWordBtn = document.getElementById('export-ai-word');
    const copyLinkBtn = document.getElementById('copy-ai-link');
    
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', exportToPDF);
    }
    if (exportHtmlBtn) {
        exportHtmlBtn.addEventListener('click', exportToHTML);
    }
    if (exportWordBtn) {
        exportWordBtn.addEventListener('click', exportToWord);
    }
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', copyShareLink);
    }
    
    console.log('✅ AI Analysis module initialized');
}

// Run AI Analysis
async function runAIAnalysis() {
    const modeSelect = document.getElementById('ai-analysis-mode');
    const runButton = document.getElementById('run-ai-analysis');
    const resultsDiv = document.getElementById('ai-analysis-results');
    
    if (!modeSelect || !runButton || !resultsDiv) {
        console.error('❌ AI Analysis elements not found');
        return;
    }
    
    const mode = modeSelect.value;
    let apiEndpoint = '/api/ai-analysis';
    let params = {};
    
    try {
        // Disable button during analysis
        runButton.disabled = true;
        runButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyse en cours...';
        
        // Build API parameters based on mode
        if (mode === 'single') {
            const dateInput = document.getElementById('ai-analysis-date');
            if (!dateInput || !dateInput.value) {
                showNotification('Veuillez sélectionner une date', 'error');
                return;
            }
            params.selected_date = dateInput.value;
        } else {
            const startDateInput = document.getElementById('ai-analysis-start-date');
            const endDateInput = document.getElementById('ai-analysis-end-date');
            
            if (!startDateInput || !startDateInput.value || !endDateInput || !endDateInput.value) {
                showNotification('Veuillez sélectionner les dates de début et fin', 'error');
                return;
            }
            
            params.start_date = startDateInput.value;
            params.end_date = endDateInput.value;
        }
        
        // Build query string
        const queryString = new URLSearchParams(params).toString();
        const fullUrl = `${apiEndpoint}?${queryString}`;
        
        console.log('🤖 Calling AI Analysis API:', fullUrl);
        
        // Fetch financial data from external API
        const response = await fetch(fullUrl);
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('📊 AI Analysis result received:', result);
        
        if (!result.success) {
            throw new Error(result.error || 'Erreur inconnue');
        }
        
        // Log AI analysis text for debugging
        if (result.data && result.data.ai_analysis) {
            console.log('🤖 AI Analysis text:\n', result.data.ai_analysis);
        }
        
        // Store data for export
        currentAnalysisData = result.data;
        currentAnalysisParams = params;
        
        // Display AI analysis results
        displayAIAnalysisResults(result.data, params);
        
        // Show results section
        resultsDiv.style.display = 'block';
        resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        // Show export controls
        const exportControls = document.getElementById('ai-export-controls');
        if (exportControls) {
            exportControls.style.display = 'block';
        }
        
        showNotification('Analyse terminée avec succès', 'success');
        
    } catch (error) {
        console.error('❌ Error running AI analysis:', error);
        showNotification(`Erreur lors de l'analyse: ${error.message}`, 'error');
    } finally {
        // Re-enable button
        runButton.disabled = false;
        runButton.innerHTML = '<i class="fas fa-magic"></i> Lancer l\'Analyse AI';
    }
}

// Display AI Analysis Results from OpenAI
function displayAIAnalysisResults(data, params) {
    const { financial_data, ai_analysis, metadata } = data;
    
    // Display the AI text analysis (includes expenses summary and top 5 generated by LLM)
    const summaryContent = document.getElementById('ai-summary-content');
    if (summaryContent) {
        // DEBUG: Show raw text in console
        console.log('=== RAW AI TEXT ===');
        console.log(ai_analysis);
        console.log('=== FORMATTED HTML ===');
        const formattedHtml = formatAIResponse(ai_analysis);
        console.log(formattedHtml);
        
        summaryContent.innerHTML = `<div class="ai-text-response">${formattedHtml}</div>`;
    }
    
    // Also populate structured data if available
    displayStructuredFinancialData(financial_data, params);
}

// Format AI response (convert markdown-like text to HTML)
function formatAIResponse(text) {
    if (!text) return '<p>Aucune analyse disponible.</p>';
    
    // Convert markdown-style formatting to HTML
    let formatted = text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')  // Bold
        .replace(/\*(.+?)\*/g, '<em>$1</em>')              // Italic
        .replace(/^#{1,6}\s+(.+)$/gm, '<h4>$1</h4>')      // Headers
        .replace(/^\d+\.\s+(.+)$/gm, '<li class="numbered-item">$1</li>')  // Numbered list items
        .replace(/^-\s+(.+)$/gm, '<li>$1</li>')           // Bullet list items
        .replace(/\n\n/g, '</p><p>')                       // Paragraphs
        .replace(/<li class="numbered-item">/g, '<ol><li class="numbered-item">')  // Start numbered lists
        .replace(/<\/li>\n(?!<li class="numbered-item">)/g, '</li></ol>')  // End numbered lists
        .replace(/<li>(?!.*class)/g, '<ul><li>')           // Start bullet lists
        .replace(/<\/li>\n(?!<li>)/g, '</li></ul>');      // End bullet lists
    
    return `<p>${formatted}</p>`;
}

// Display structured financial data
function displayStructuredFinancialData(data, params) {
    // Extract key metrics
    const metrics = data.global_metrics || {};
    const periodInfo = data.period_info || {};
    
    // Convert accounts object to array - accounts are grouped by type
    const accountsArray = [];
    const accountsByType = data.accounts || {};
    
    // Iterate through each account type (classique, creance, partenaire, etc.)
    Object.keys(accountsByType).forEach(accountType => {
        const accountsOfType = accountsByType[accountType];
        
        // Iterate through each account within this type
        Object.entries(accountsOfType).forEach(([accountName, accountData]) => {
            accountsArray.push({
                account_name: accountName,
                account_type: accountData.accountInfo?.type || accountType,
                current_balance: accountData.accountInfo?.current_balance || 0,
                dailyExpenses: accountData.dailyExpenses || {},
                monthlyExpenses: accountData.monthlyExpenses || {},
                ...accountData
            });
        });
    });
    
    // NOTE: ai-summary-content is already populated by displayAIAnalysisResults with LLM output
    // Don't overwrite it here
    
    // Populate Key Metrics
    const metricsContent = document.getElementById('ai-metrics-content');
    if (metricsContent && metrics.balances) {
        const balances = metrics.balances;
        const profitLoss = metrics.profitAndLoss || {};
        
        // Extract actual values from nested structure
        const brutPLValue = profitLoss.brutPL?.value ?? profitLoss.brutPL ?? 0;
        const estimatedPLValue = profitLoss.estimatedProfitAndLoss?.value ?? profitLoss.estimatedProfitAndLoss ?? 0;
        
        metricsContent.innerHTML = `
            <div class="metric-item">
                <span class="metric-label">Cash Disponible</span>
                <span class="metric-value ${balances.cash_disponible >= 0 ? 'positive' : 'negative'}">
                    ${formatCurrency(balances.cash_disponible || 0)}
                </span>
            </div>
            <div class="metric-item">
                <span class="metric-label">Balance du Mois</span>
                <span class="metric-value">${formatCurrency(balances.balance_du_mois || 0)}</span>
            </div>
            <div class="metric-item">
                <span class="metric-label">Cash Burn du Mois</span>
                <span class="metric-value negative">${formatCurrency(balances.cash_burn_du_mois || 0)}</span>
            </div>
            <div class="metric-item">
                <span class="metric-label">Cash Burn depuis Lundi</span>
                <span class="metric-value negative">${formatCurrency(balances.cash_burn_depuis_lundi || 0)}</span>
            </div>
            <div class="metric-item">
                <span class="metric-label">PL Brut</span>
                <span class="metric-value ${brutPLValue >= 0 ? 'positive' : 'negative'}">
                    ${formatCurrency(brutPLValue)}
                </span>
            </div>
            <div class="metric-item">
                <span class="metric-label">PL Estimé (avec charges)</span>
                <span class="metric-value ${estimatedPLValue >= 0 ? 'positive' : 'negative'}">
                    ${formatCurrency(estimatedPLValue)}
                </span>
            </div>
        `;
    }
    
    // Generate Insights & Alerts
    const insightsContent = document.getElementById('ai-insights-content');
    if (insightsContent) {
        const insights = generateInsights(data);
        insightsContent.innerHTML = insights;
    }
    
    // Populate Accounts Analysis
    const accountsContent = document.getElementById('ai-accounts-content');
    if (accountsContent) {
        accountsContent.innerHTML = generateAccountsAnalysis(accountsArray);
    }
    
    // Generate Recommendations
    const recommendationsContent = document.getElementById('ai-recommendations-content');
    if (recommendationsContent) {
        const recommendations = generateRecommendations(data);
        recommendationsContent.innerHTML = recommendations;
    }
}

// Generate Insights from financial data
function generateInsights(data) {
    const insights = [];
    const metrics = data.global_metrics || {};
    const balances = metrics.balances || {};
    const profitLoss = metrics.profitAndLoss || {};
    
    // Extract nested values
    const estimatedPLValue = profitLoss.estimatedProfitAndLoss?.value ?? profitLoss.estimatedProfitAndLoss ?? 0;
    
    // Cash availability insight
    if (balances.cash_disponible < 0) {
        insights.push(`<div class="alert alert-danger"><i class="fas fa-exclamation-triangle"></i> <strong>Alerte Trésorerie:</strong> Cash disponible négatif (${formatCurrency(balances.cash_disponible)}). Risque de rupture de trésorerie.</div>`);
    } else if (balances.cash_disponible < 1000000) {
        insights.push(`<div class="alert alert-warning"><i class="fas fa-exclamation-circle"></i> <strong>Attention:</strong> Trésorerie faible (${formatCurrency(balances.cash_disponible)}). Surveillance recommandée.</div>`);
    } else {
        insights.push(`<div class="alert alert-success"><i class="fas fa-check-circle"></i> <strong>Trésorerie saine:</strong> ${formatCurrency(balances.cash_disponible)} disponibles.</div>`);
    }
    
    // P&L insight
    if (estimatedPLValue < 0) {
        insights.push(`<div class="alert alert-danger"><i class="fas fa-chart-line"></i> <strong>Perte estimée:</strong> ${formatCurrency(estimatedPLValue)}. Révision des charges nécessaire.</div>`);
    } else {
        insights.push(`<div class="alert alert-success"><i class="fas fa-chart-line"></i> <strong>Profit estimé:</strong> ${formatCurrency(estimatedPLValue)}.</div>`);
    }
    
    // Cash burn insight
    const burnRate = balances.cash_burn_du_mois || 0;
    if (burnRate > balances.balance_du_mois) {
        insights.push(`<div class="alert alert-warning"><i class="fas fa-fire"></i> <strong>Cash Burn élevé:</strong> Dépenses (${formatCurrency(burnRate)}) supérieures à la balance mensuelle.</div>`);
    }
    
    return insights.length > 0 ? insights.join('') : '<p>Aucune alerte détectée.</p>';
}

// Generate Accounts Analysis
function generateAccountsAnalysis(accounts) {
    if (!accounts || accounts.length === 0) {
        return '<p>Aucun compte trouvé.</p>';
    }
    
    let html = '<div class="accounts-grid">';
    
    // Group accounts by type
    const accountsByType = {};
    accounts.forEach(account => {
        const type = account.account_type || 'autre';
        if (!accountsByType[type]) {
            accountsByType[type] = [];
        }
        accountsByType[type].push(account);
    });
    
    // Display by type
    Object.keys(accountsByType).forEach(type => {
        const typeAccounts = accountsByType[type];
        const typeLabel = type === 'classique' ? 'Comptes Classiques' :
                         type === 'creance' ? 'Créances' :
                         type === 'partenaire' ? 'Partenaires' :
                         type === 'statut' ? 'Statut' :
                         type === 'depot' ? 'Dépôt' : 'Autres';
        
        html += `<h5>${typeLabel}</h5>`;
        
        typeAccounts.forEach(account => {
            let balance = account.current_balance || 0;
            let detailsText = '';
            
            // Handle different account types
            if (type === 'creance') {
                // For creance accounts, sum all client balances
                const clients = account.dailyExpenses?.clients || [];
                const totalCreance = clients.reduce((sum, client) => sum + (client.solde_final || 0), 0);
                balance = totalCreance;
                const nbClients = clients.length;
                detailsText = `${nbClients} client(s) - Solde total créances: ${formatCurrency(totalCreance)}`;
            } else if (type === 'partenaire') {
                // For partner accounts, show remaining balance
                balance = (account.livraisonData?.remaining_balance ?? account.current_balance) || 0;
                const totalValidated = account.livraisonData?.total_validated_deliveries || 0;
                detailsText = `Livraisons validées: ${formatCurrency(totalValidated)}`;
            } else {
                // For other accounts (classique, depot, statut), show monthly expenses
                const monthlyTotal = account.monthlyExpenses?.total_monthly_expenses || 0;
                detailsText = `Dépenses mensuelles: ${formatCurrency(monthlyTotal)}`;
            }
            
            html += `
                <div class="account-card">
                    <div class="account-name">${account.account_name}</div>
                    <div class="account-balance ${balance >= 0 ? 'positive' : 'negative'}">
                        Solde: ${formatCurrency(balance)}
                    </div>
                    <div class="account-expenses">
                        ${detailsText}
                    </div>
                </div>
            `;
        });
    });
    
    html += '</div>';
    return html;
}

// Generate Recommendations
function generateRecommendations(data) {
    const recommendations = [];
    const metrics = data.global_metrics || {};
    const balances = metrics.balances || {};
    const profitLoss = metrics.profitAndLoss || {};
    
    // Extract nested values
    const estimatedPLValue = profitLoss.estimatedProfitAndLoss?.value ?? profitLoss.estimatedProfitAndLoss ?? 0;
    
    // Cash management recommendations
    if (balances.cash_disponible < 0) {
        recommendations.push('<li><strong>Urgence:</strong> Créditer les comptes pour éviter une rupture de trésorerie.</li>');
        recommendations.push('<li>Réviser les dépenses non essentielles immédiatement.</li>');
    }
    
    // P&L recommendations
    if (estimatedPLValue < 0) {
        recommendations.push('<li>Analyser les postes de charges les plus élevés pour identifier des économies.</li>');
        recommendations.push('<li>Vérifier les prix de vente et marges sur les produits.</li>');
    }
    
    // Stock recommendations
    if (data.stockVivant && data.stockVivant.delta) {
        const delta = data.stockVivant.delta;
        if (delta.variation_total < 0) {
            recommendations.push(`<li>Stock vivant en baisse de ${formatCurrency(Math.abs(delta.variation_total))}. Vérifier les approvisionnements.</li>`);
        }
    }
    
    // Creances recommendations
    const totalCreances = balances.total_creances || 0;
    if (totalCreances > 5000000) {
        recommendations.push('<li><strong>Créances importantes:</strong> Accélérer le recouvrement des paiements clients.</li>');
    }
    
    if (recommendations.length === 0) {
        return '<p>Aucune recommandation particulière pour le moment. Situation financière stable.</p>';
    }
    
    return '<ul>' + recommendations.join('') + '</ul>';
}

// Toggle AI Analysis Section visibility
function toggleAIAnalysisSection() {
    const content = document.getElementById('ai-analysis-content');
    const toggleBtn = document.getElementById('ai-analysis-toggle-btn');
    const icon = toggleBtn.querySelector('i');
    
    if (content.style.display === 'none') {
        // Show content
        content.style.display = 'block';
        // Force reflow for animation
        content.offsetHeight;
        content.style.opacity = '1';
        content.style.maxHeight = '5000px';
        
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
    } else {
        // Hide content
        content.style.opacity = '0';
        content.style.maxHeight = '0';
        
        // Wait for animation before hiding
        setTimeout(() => {
            content.style.display = 'none';
        }, 300);
        
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
    }
}

// ========================================
// EXPORT FUNCTIONS
// ========================================

// Export to PDF using browser print
function exportToPDF() {
    if (!currentAnalysisData) {
        showNotification('Aucune analyse à exporter', 'warning');
        return;
    }
    
    // Create a printable version
    const printWindow = window.open('', '_blank');
    const htmlContent = generateExportHTML(currentAnalysisData, currentAnalysisParams);
    
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // Wait for content to load, then print
    printWindow.onload = function() {
        printWindow.print();
    };
    
    showNotification('Fenêtre d\'impression ouverte', 'success');
}

// Export to HTML file
function exportToHTML() {
    if (!currentAnalysisData) {
        showNotification('Aucune analyse à exporter', 'warning');
        return;
    }
    
    const htmlContent = generateExportHTML(currentAnalysisData, currentAnalysisParams);
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    const date = currentAnalysisParams.selected_date || `${currentAnalysisParams.start_date}_${currentAnalysisParams.end_date}`;
    a.href = url;
    a.download = `analyse-financiere-${date}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Fichier HTML téléchargé', 'success');
}

// Export to Word (HTML format that Word can open)
function exportToWord() {
    if (!currentAnalysisData) {
        showNotification('Aucune analyse à exporter', 'warning');
        return;
    }
    
    const htmlContent = generateExportHTML(currentAnalysisData, currentAnalysisParams, true);
    const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    const date = currentAnalysisParams.selected_date || `${currentAnalysisParams.start_date}_${currentAnalysisParams.end_date}`;
    a.href = url;
    a.download = `analyse-financiere-${date}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Fichier Word téléchargé', 'success');
}

// Copy shareable link to clipboard
function copyShareLink() {
    if (!currentAnalysisParams) {
        showNotification('Aucune analyse à partager', 'warning');
        return;
    }
    
    const params = new URLSearchParams(currentAnalysisParams).toString();
    const shareUrl = `${window.location.origin}/api/ai-analysis?${params}`;
    
    navigator.clipboard.writeText(shareUrl).then(() => {
        showNotification('Lien copié dans le presse-papiers', 'success');
    }).catch(err => {
        console.error('Erreur copie:', err);
        showNotification('Erreur lors de la copie du lien', 'error');
    });
}

// Generate HTML content for export
function generateExportHTML(data, params, forWord = false) {
    const { financial_data, ai_analysis, metadata } = data;
    const metrics = financial_data.global_metrics || {};
    const balances = metrics.balances || {};
    const profitLoss = metrics.profitAndLoss || {};
    
    const date = params.selected_date ? 
        new Date(params.selected_date).toLocaleDateString('fr-FR') :
        `${new Date(params.start_date).toLocaleDateString('fr-FR')} - ${new Date(params.end_date).toLocaleDateString('fr-FR')}`;
    
    const brutPLValue = profitLoss.brutPL?.value ?? profitLoss.brutPL ?? 0;
    const estimatedPLValue = profitLoss.estimatedProfitAndLoss?.value ?? profitLoss.estimatedProfitAndLoss ?? 0;
    
    return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Analyse Financière - Mata Group - ${date}</title>
    <style>
        body {
            font-family: ${forWord ? 'Calibri, Arial' : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto'}, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 30px;
            background: ${forWord ? 'white' : '#f5f5f5'};
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 3px solid #667eea;
            padding-bottom: 20px;
        }
        h1 {
            color: #667eea;
            margin: 0;
            font-size: 28px;
        }
        .subtitle {
            color: #666;
            font-size: 16px;
            margin-top: 10px;
        }
        .section {
            background: white;
            padding: 25px;
            margin-bottom: 25px;
            border-radius: 8px;
            border-left: 4px solid #667eea;
            ${forWord ? '' : 'box-shadow: 0 2px 4px rgba(0,0,0,0.1);'}
        }
        h2 {
            color: #667eea;
            margin-top: 0;
            font-size: 22px;
            border-bottom: 2px solid #e9ecef;
            padding-bottom: 10px;
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        .metric-box {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            border: 1px solid #dee2e6;
        }
        .metric-label {
            font-size: 14px;
            color: #666;
            margin-bottom: 5px;
        }
        .metric-value {
            font-size: 22px;
            font-weight: bold;
            color: #333;
        }
        .metric-value.positive { color: #28a745; }
        .metric-value.negative { color: #dc3545; }
        .ai-text {
            line-height: 1.8;
            color: #333;
        }
        .ai-text p {
            margin-bottom: 15px;
        }
        .ai-text strong {
            color: #667eea;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #dee2e6;
            color: #999;
            font-size: 12px;
        }
        @media print {
            body { background: white; }
            .section { box-shadow: none; page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Analyse des Données Financières de la Mata Group</h1>
        <p class="subtitle">Période: ${date}</p>
        <p class="subtitle">Générée le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}</p>
    </div>
    
    <div class="section">
        <h2>📊 Métriques Clés</h2>
        <div class="metrics-grid">
            <div class="metric-box">
                <div class="metric-label">Cash Disponible</div>
                <div class="metric-value ${balances.cash_disponible >= 0 ? 'positive' : 'negative'}">
                    ${formatCurrency(balances.cash_disponible || 0)}
                </div>
            </div>
            <div class="metric-box">
                <div class="metric-label">Balance du Mois</div>
                <div class="metric-value">${formatCurrency(balances.balance_du_mois || 0)}</div>
            </div>
            <div class="metric-box">
                <div class="metric-label">Cash Burn du Mois</div>
                <div class="metric-value negative">${formatCurrency(balances.cash_burn_du_mois || 0)}</div>
            </div>
            <div class="metric-box">
                <div class="metric-label">PL Brut</div>
                <div class="metric-value ${brutPLValue >= 0 ? 'positive' : 'negative'}">
                    ${formatCurrency(brutPLValue)}
                </div>
            </div>
            <div class="metric-box">
                <div class="metric-label">PL Estimé (avec charges)</div>
                <div class="metric-value ${estimatedPLValue >= 0 ? 'positive' : 'negative'}">
                    ${formatCurrency(estimatedPLValue)}
                </div>
            </div>
        </div>
    </div>
    
    <div class="section">
        <h2>🤖 Analyse AI</h2>
        <div class="ai-text">
            ${formatAIResponse(ai_analysis)}
        </div>
    </div>
    
    <div class="footer">
        <p>© ${new Date().getFullYear()} Mata Group - Analyse financière générée automatiquement</p>
        <p>Document confidentiel - Distribution restreinte</p>
    </div>
</body>
</html>
    `.trim();
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAIAnalysis);
} else {
    initAIAnalysis();
}
