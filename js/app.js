/**
 * HisaabKitab (TripTab 2.0) - Premium Group Expense Tracker & Debt Simplifier
 * CS-344 Web Engineering Assignment 1 · Topic #38
 * Author: Muhammad Zun U Rain Tahir (CMS: 527352) · BESE 15 B
 * 
 * Technical Design:
 * - 100% Vanilla JavaScript (ES6+), semantic DOM manipulation, zero external frameworks.
 * - Currency Math: All internal monetary values are stored in integer paisas (1 PKR = 100 paisas)
 *   to eliminate IEEE 754 floating-point inaccuracies.
 * - Graph Optimization: Greedy bipartite min-cash-flow algorithm reduces N*(N-1)/2 pairwise
 *   debts down to at most N-1 transactions.
 */

'use strict';

/* ==========================================================================
   1. Configuration & Constants
   ========================================================================== */
const STORAGE_KEY = 'hisaabkitab_data_v2';
const LANG_STORAGE_KEY = 'hisaabkitab_lang_pref';
const THEME_STORAGE_KEY = 'hisaabkitab_theme_pref';

// Category definitions with emoji icons
const CATEGORIES = {
  Food: '🍽️',
  Travel: '⛽',
  Stay: '🏨',
  Leisure: '🎟️',
  Utilities: '📱',
  Shopping: '🛍️',
  Emergency: '🩹',
  Settlement: '🤝'
};

// Fixed demo exchange rates to Pakistani Rupee (PKR)
const EXCHANGE_RATES = {
  PKR: 1,
  USD: 280,
  AED: 76,
  SAR: 74.5,
  GBP: 355,
  EUR: 305
};

// Preset quick-add expenses for Pakistani tours
const PRESETS = [
  { label: '☕ Chai & Paratha', desc: 'Peshawari Chai & Paratha', amount: 850, cat: 'Food' },
  { label: '⛽ M2 Motorway Fuel', desc: 'M2 Motorway Shell Fuel Refill', amount: 8500, cat: 'Travel' },
  { label: '🍗 Shinwari Karahi', desc: 'Shinwari Mutton Karahi & Naan', amount: 7200, cat: 'Food' },
  { label: '🏨 Hunza Serena / Hotel', desc: 'Hotel Stay in Karimabad (2 Nights)', amount: 22000, cat: 'Stay' },
  { label: '🎟️ Baltit Fort Tickets', desc: 'Baltit & Altit Fort Heritage Entry', amount: 3400, cat: 'Leisure' },
  { label: '📱 SCOM 4G Data SIMs', desc: 'Local SCOM Data Packs for Team', amount: 1600, cat: 'Utilities' },
  { label: '🚕 Skardu 4x4 Jeep', desc: 'Deosai Plains 4x4 Jeep Rental', amount: 14000, cat: 'Travel' }
];

// Color palette for category charts & avatars
const CHART_COLORS = [
  '#0a5c36', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#14b8a6'
];

const AVATAR_COLORS = [
  '#0a5c36', '#0284c7', '#d97706', '#dc2626', '#7c3aed', '#059669', '#db2777', '#4b5563'
];

/* ==========================================================================
   2. Utility Functions (Formatting, Sanitization, DOM Helpers)
   ========================================================================== */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

/**
 * Formats integer paisas into human-friendly Pakistani Rupee string (e.g. "Rs 24,000.00")
 */
function formatRupees(paisa) {
  const rupees = (paisa / 100);
  return 'Rs ' + rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Escapes unsafe characters to prevent Cross-Site Scripting (XSS)
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

/**
 * Returns a stable color-coded avatar badge for a member name
 */
function renderAvatar(name) {
  const charCodeSum = [...name].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const color = AVATAR_COLORS[charCodeSum % AVATAR_COLORS.length];
  const initial = (name[0] || '?').toUpperCase();
  return `<span class="member-avatar" style="background-color: ${color};" aria-hidden="true">${escapeHtml(initial)}</span>`;
}

/* ==========================================================================
   3. Mathematical Split Algorithms
   ========================================================================== */

/**
 * Distributes integer paisas equally among selected members.
 * Any remainder paisas (paisa % n) are distributed 1 by 1 to the first members
 * ensuring sum(shares) === total with 100% mathematical integrity.
 */
function calculateEqualSplit(totalPaisa, memberList) {
  const n = memberList.length;
  if (n === 0) return {};
  const baseShare = Math.floor(totalPaisa / n);
  let remainder = totalPaisa - (baseShare * n);
  const shares = {};

  memberList.forEach((member) => {
    shares[member] = baseShare + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
  });

  return shares;
}

/**
 * Parses and validates shares based on active split methodology.
 * Returns { shares } on success or { error } with human-friendly guidance.
 */
function parseSplitShares(totalPaisa) {
  const mode = $('#splitMode').value;
  const checkedBoxes = [...$$('#splitFieldsContainer input[type="checkbox"]:checked')].map(cb => cb.value);

  if (checkedBoxes.length === 0) {
    return { error: 'Please select at least one group member to split between.' };
  }

  // 1. Equal Split Mode
  if (mode === 'equal') {
    return { shares: calculateEqualSplit(totalPaisa, checkedBoxes) };
  }

  // Read input values for checked members
  const memberInputs = {};
  let totalInputVal = 0;

  for (const member of checkedBoxes) {
    const inputEl = document.querySelector(`input[data-member="${CSS.escape(member)}"]`);
    const val = parseFloat(inputEl ? inputEl.value : '0');
    if (isNaN(val) || val < 0) {
      return { error: `Please enter a valid positive number for ${member}.` };
    }
    memberInputs[member] = val;
    totalInputVal += val;
  }

  // 2. Exact Amounts Mode (Rs per person)
  if (mode === 'exact') {
    const shares = {};
    let allocatedPaisa = 0;
    for (const [member, rs] of Object.entries(memberInputs)) {
      const p = Math.round(rs * 100);
      shares[member] = p;
      allocatedPaisa += p;
    }
    if (allocatedPaisa !== totalPaisa) {
      const diff = Math.abs(totalPaisa - allocatedPaisa);
      const direction = allocatedPaisa > totalPaisa ? 'over' : 'short';
      return {
        error: `Sum of exact amounts (${formatRupees(allocatedPaisa)}) is ${direction} by ${formatRupees(diff)} compared to bill total (${formatRupees(totalPaisa)}).`
      };
    }
    return { shares };
  }

  // 3. Percentage Split Mode (Must equal 100%)
  if (mode === 'percent') {
    if (Math.abs(totalInputVal - 100) > 0.05) {
      return {
        error: `Percentages sum to ${totalInputVal.toFixed(1)}%. They must total exactly 100%.`
      };
    }
    const shares = {};
    let runningSum = 0;
    const names = Object.keys(memberInputs);
    names.forEach((member, idx) => {
      if (idx === names.length - 1) {
        shares[member] = totalPaisa - runningSum; // Eliminate rounding penny drift
      } else {
        const share = Math.round((totalPaisa * memberInputs[member]) / 100);
        shares[member] = share;
        runningSum += share;
      }
    });
    return { shares };
  }

  // 4. Weighted Shares / Ratio Split Mode (e.g. 2 : 1 : 1)
  if (mode === 'shares') {
    if (totalInputVal <= 0) {
      return { error: 'Total shares must be greater than zero.' };
    }
    const shares = {};
    let runningSum = 0;
    for (const [member, weight] of Object.entries(memberInputs)) {
      const share = Math.floor((totalPaisa * weight) / totalInputVal);
      shares[member] = share;
      runningSum += share;
    }
    // Allocate remaining paisas to member with highest weight
    const topMember = Object.keys(memberInputs).find(m => memberInputs[m] > 0);
    if (topMember) {
      shares[topMember] += (totalPaisa - runningSum);
    }
    return { shares };
  }

  return { error: 'Unknown split mode selected.' };
}

/* ==========================================================================
   4. Debt Simplification & Balance Calculation Engine
   ========================================================================== */

/**
 * Computes net financial balance for every member.
 * Net balance = (Total money paid by member) - (Total shares consumed by member)
 * Positive value = Creditor (is owed money)
 * Negative value = Debtor (owes money)
 * Sum of all net balances always equals 0.
 */
function calculateNetBalances() {
  const net = {};
  AppState.members.forEach(m => { net[m] = 0; });

  AppState.expenses.forEach(exp => {
    // Add paid amount to payer's credit
    if (exp.payer in net) {
      net[exp.payer] += exp.cents;
    }
    // Deduct each participant's consumed share
    for (const [member, sharePaisa] of Object.entries(exp.shares)) {
      if (member in net) {
        net[member] -= sharePaisa;
      }
    }
  });

  return net;
}

/**
 * Greedy Min-Cash-Flow Algorithm
 * Reduces mutual debts from O(N^2) to at most N-1 transactions.
 * Matches the biggest debtor with the biggest creditor iteratively.
 */
function computeSimplifiedDebts(netBalances) {
  const debtors = [];
  const creditors = [];

  for (const [member, balance] of Object.entries(netBalances)) {
    if (balance < 0) {
      debtors.push({ member, amount: -balance });
    } else if (balance > 0) {
      creditors.push({ member, amount: balance });
    }
  }

  // Sort descending by magnitude
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];
    const transfer = Math.min(debtor.amount, creditor.amount);

    if (transfer > 0) {
      transactions.push({
        from: debtor.member,
        to: creditor.member,
        amount: transfer
      });
    }

    debtor.amount -= transfer;
    creditor.amount -= transfer;

    if (debtor.amount === 0) dIdx++;
    if (creditor.amount === 0) cIdx++;
  }

  return transactions;
}

/* ==========================================================================
   5. Sample Dataset (Northern Pakistan Expedition)
   ========================================================================== */
function getSampleDataset() {
  const members = ['Zun (Leader)', 'Ali', 'Hira', 'Bilal'];
  const all = members;

  const makeExp = (id, desc, rs, payer, date, cat, participants, extra = {}) => ({
    id,
    desc,
    cents: rs * 100,
    payer,
    date,
    cat,
    mode: 'equal',
    shares: calculateEqualSplit(rs * 100, participants),
    kind: 'expense',
    cur: 'PKR',
    orig: rs * 100,
    note: '',
    edited: false,
    ...extra
  });

  return {
    members,
    budget: 8500000, // Rs 85,000.00
    expenses: [
      makeExp(1, 'Karimabad Hunza Hotel (2 Nights)', 24000, 'Ali', '2026-10-24', 'Stay', all, {
        note: 'Advance deposit paid via JazzCash'
      }),
      makeExp(2, 'Islamabad to Gilgit High-Octane Fuel', 12500, 'Zun (Leader)', '2026-10-24', 'Travel', all, {
        note: 'Filled tank at PSO Babusar'
      }),
      makeExp(3, 'Trout Fish Dinner at Attabad Lake', 7800, 'Hira', '2026-10-25', 'Food', all),
      makeExp(4, 'Baltit Fort Guided Tour Tickets', 3200, 'Bilal', '2026-10-25', 'Leisure', ['Zun (Leader)', 'Hira', 'Bilal'], {
        note: 'Ali rested at hotel due to fatigue'
      }),
      makeExp(5, 'Local SCOM 4G Connectivity SIMs', 2400, 'Hira', '2026-10-26', 'Utilities', all),
      makeExp(6, 'Deosai Plains 4x4 Jeep Safari Rental', 15000, 'Zun (Leader)', '2026-10-26', 'Travel', all, {
        cur: 'USD',
        orig: 5357, // $53.57 USD
        note: 'Foreign tourist driver rate paid in USD'
      }),
      makeExp(7, 'Dry Fruit & Walnut Cake Souvenirs', 4800, 'Ali', '2026-10-27', 'Shopping', all, {
        mode: 'percent',
        shares: { 'Zun (Leader)': 192000, 'Ali': 96000, 'Hira': 96000, 'Bilal': 96000 },
        edited: true,
        note: 'Zun purchased extra apricot oil'
      }),
      {
        id: 8,
        desc: 'Bilal reimbursed Ali via Raast transfer',
        cents: 400000, // Rs 4,000.00
        payer: 'Bilal',
        date: '2026-10-27',
        cat: 'Settlement',
        mode: 'exact',
        shares: { 'Ali': 400000 },
        kind: 'settlement',
        cur: 'PKR',
        orig: 400000,
        note: 'Raast instant transaction ID #982314',
        edited: false
      }
    ],
    activityLog: [
      { t: Date.now() - 86400000 * 3, text: 'Zun created the Hunza & Skardu Expedition group with 4 members.' },
      { t: Date.now() - 86400000 * 2, text: 'Ali added “Karimabad Hunza Hotel (2 Nights)” (Rs 24,000.00).' },
      { t: Date.now() - 86400000 * 2, text: 'Zun (Leader) added “Islamabad to Gilgit Fuel” (Rs 12,500.00).' },
      { t: Date.now() - 86400000 * 1, text: 'Hira added “Trout Fish Dinner at Attabad Lake” (Rs 7,800.00).' },
      { t: Date.now() - 3600000 * 4, text: 'Bilal recorded settlement: paid Ali Rs 4,000.00 via Raast.' }
    ]
  };
}

/* ==========================================================================
   6. State Persistence & Data Sanitization (Security Defense)
   ========================================================================== */

/**
 * Validates and sanitizes imported or loaded JSON state.
 * Defends against malformed data, prototype pollution, and out-of-bound numbers.
 */
function sanitizeState(data) {
  if (!data || !Array.isArray(data.members) || !Array.isArray(data.expenses)) {
    return null;
  }

  // 1. Sanitize Members
  const members = [...new Set(
    data.members
      .map(m => String(m).replace(/[<>]/g, '').trim().slice(0, 24))
      .filter(m => m.length >= 2)
  )].slice(0, 25);

  if (members.length < 2) return null;

  // 2. Sanitize Expenses
  const isSafeInteger = (val) => Number.isInteger(val) && val >= 0 && val <= 1e11;

  const expenses = data.expenses.slice(0, 500).map((exp, idx) => {
    const shares = {};
    for (const [m, shareVal] of Object.entries(exp.shares || {})) {
      if (members.includes(m) && isSafeInteger(shareVal)) {
        shares[m] = shareVal;
      }
    }

    const cur = (exp.cur in EXCHANGE_RATES) ? exp.cur : 'PKR';
    const cat = (exp.cat in CATEGORIES) ? exp.cat : 'Food';

    return {
      id: Number.isFinite(exp.id) ? exp.id : (Date.now() + idx),
      desc: String(exp.desc || 'Expense').replace(/[<>]/g, '').trim().slice(0, 60),
      cents: isSafeInteger(exp.cents) ? exp.cents : 0,
      payer: members.includes(exp.payer) ? exp.payer : members[0],
      date: /^\d{4}-\d{2}-\d{2}$/.test(exp.date) ? exp.date : new Date().toISOString().slice(0, 10),
      cat,
      mode: ['equal', 'exact', 'percent', 'shares'].includes(exp.mode) ? exp.mode : 'equal',
      shares,
      kind: exp.kind === 'settlement' ? 'settlement' : 'expense',
      note: String(exp.note || '').replace(/[<>]/g, '').trim().slice(0, 120),
      edited: Boolean(exp.edited),
      cur,
      orig: isSafeInteger(exp.orig) ? exp.orig : exp.cents
    };
  }).filter(exp => {
    // Consistency check: sum(shares) must equal exp.cents
    const totalShares = Object.values(exp.shares).reduce((a, b) => a + b, 0);
    return exp.desc && exp.cents > 0 && Object.keys(exp.shares).length > 0 && totalShares === exp.cents;
  });

  // 3. Sanitize Budget & Activity Log
  const budget = isSafeInteger(data.budget) ? data.budget : 0;
  const activityLog = Array.isArray(data.activityLog)
    ? data.activityLog.slice(0, 80).map(item => ({
        t: Number.isFinite(item.t) ? item.t : Date.now(),
        text: String(item.text).replace(/[<>]/g, '').slice(0, 180)
      }))
    : [];

  return { members, expenses, budget, activityLog };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const sanitized = sanitizeState(JSON.parse(raw));
      if (sanitized) return sanitized;
    }
  } catch (err) {
    console.warn('Could not load stored data, fallback to demo dataset:', err);
  }
  return getSampleDataset();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(AppState));
  } catch (err) {
    console.warn('Storage quota exceeded or private mode enabled:', err);
  }
}

let AppState = loadState();
let currentEditingId = null;

function logActivity(text) {
  AppState.activityLog = [
    { t: Date.now(), text },
    ...(AppState.activityLog || [])
  ].slice(0, 80);
}

/* ==========================================================================
   7. UI Rendering Modules
   ========================================================================== */

/**
 * Renders member roster chips, options in dropdowns, and split allocation fields
 */
function renderMembers() {
  const activeMembersSet = new Set(
    AppState.expenses.flatMap(x => [x.payer, ...Object.keys(x.shares)])
  );

  $('#memberCount').textContent = AppState.members.length;

  // Render chips
  $('#memberChipsList').innerHTML = AppState.members.map(member => {
    const isUsed = activeMembersSet.has(member);
    return `
      <li class="member-chip">
        ${renderAvatar(member)}
        <span>${escapeHtml(member)}</span>
        <button type="button" class="member-remove-btn" data-remove-member="${escapeHtml(member)}"
          aria-label="Remove ${escapeHtml(member)}"
          ${isUsed ? 'disabled title="Cannot remove: has active expenses or debts"' : 'title="Remove member"'}>
          ✕
        </button>
      </li>
    `;
  }).join('');

  // Update Dropdowns
  const memberOptions = AppState.members.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
  const currentPayer = $('#expensePayer').value;
  $('#expensePayer').innerHTML = memberOptions;
  if (AppState.members.includes(currentPayer)) {
    $('#expensePayer').value = currentPayer;
  }

  const currentFilterPayer = $('#filterPayer').value;
  $('#filterPayer').innerHTML = '<option value="">All Members</option>' + memberOptions;
  $('#filterPayer').value = currentFilterPayer;

  renderSplitMatrix();
}

/**
 * Dynamically builds the participant checkbox grid with numeric inputs for exact/percent/shares
 */
function renderSplitMatrix(initialValues = {}, checkedMembers = null) {
  const mode = $('#splitMode').value;
  const currentlyChecked = checkedMembers || [
    ...$$('#splitFieldsContainer input[type="checkbox"]:checked')
  ].map(cb => cb.value);

  const container = $('#splitFieldsContainer');
  container.innerHTML = AppState.members.map(member => {
    const isChecked = checkedMembers
      ? checkedMembers.includes(member)
      : (currentlyChecked.length ? currentlyChecked.includes(member) : true);

    const val = initialValues[member] !== undefined ? initialValues[member] : '';
    let extraInput = '';

    if (mode === 'exact') {
      extraInput = `<input type="number" min="0" step="0.01" class="split-input-val" data-member="${escapeHtml(member)}" value="${val}" placeholder="Rs" aria-label="Amount for ${escapeHtml(member)}">`;
    } else if (mode === 'percent') {
      extraInput = `<input type="number" min="0" max="100" step="0.1" class="split-input-val" data-member="${escapeHtml(member)}" value="${val}" placeholder="%" aria-label="Percentage for ${escapeHtml(member)}">`;
    } else if (mode === 'shares') {
      extraInput = `<input type="number" min="1" step="1" class="split-input-val" data-member="${escapeHtml(member)}" value="${val || 1}" placeholder="shares" aria-label="Shares for ${escapeHtml(member)}">`;
    }

    return `
      <div class="split-row">
        <label class="split-check-label">
          <input type="checkbox" value="${escapeHtml(member)}" ${isChecked ? 'checked' : ''}>
          <span>${escapeHtml(member)}</span>
        </label>
        ${extraInput}
      </div>
    `;
  }).join('');

  // Update Status Badge
  const selectedCount = $$('#splitFieldsContainer input[type="checkbox"]:checked').length;
  $('#splitLiveStatus').textContent = `${selectedCount} of ${AppState.members.length} included`;
}

/**
 * Renders individual balances, balance bars, and simplified debt transactions
 */
function renderBalances() {
  const netBalances = calculateNetBalances();
  const maxAbsVal = Math.max(1, ...Object.values(netBalances).map(Math.abs));

  // 1. Member Net Positions List
  $('#balanceList').innerHTML = AppState.members.map(member => {
    const balance = netBalances[member];
    const isCreditor = balance > 0;
    const isDebtor = balance < 0;
    const itemClass = isCreditor ? 'is-creditor' : (isDebtor ? 'is-debtor' : 'is-settled');
    const barWidthPct = Math.min(100, Math.round((Math.abs(balance) / maxAbsVal) * 100));

    let statusText = 'Settled up (Rs 0.00)';
    if (isCreditor) statusText = `Gets back +${formatRupees(balance)}`;
    if (isDebtor) statusText = `Owes −${formatRupees(Math.abs(balance))}`;

    return `
      <li class="balance-item ${itemClass}">
        <span class="balance-person">
          ${renderAvatar(member)}
          <span>${escapeHtml(member)}</span>
        </span>
        <div class="balance-track-wrap" title="${escapeHtml(member)}: ${statusText}">
          <div class="balance-track-bar" style="width: ${barWidthPct}%;"></div>
        </div>
        <span class="balance-val">${statusText}</span>
      </li>
    `;
  }).join('');

  // 2. Simplified Settlement Transactions
  const suggestedSettlements = computeSimplifiedDebts(netBalances);
  renderBalances.activeSettlements = suggestedSettlements;

  if (suggestedSettlements.length === 0) {
    $('#settleList').innerHTML = `
      <li class="settle-item empty-state-box" style="padding: 1.5rem; border-style: solid;">
        <p>🎉 All group members are 100% settled up! No pending payments.</p>
      </li>
    `;
  } else {
    $('#settleList').innerHTML = suggestedSettlements.map((tx, idx) => `
      <li class="settle-item">
        <div class="settle-desc">
          <strong>${escapeHtml(tx.from)}</strong>
          <span class="settle-arrow">➔</span>
          <strong>${escapeHtml(tx.to)}</strong>
          <span class="settle-amount">${formatRupees(tx.amount)}</span>
        </div>
        <button type="button" class="btn btn-xs btn-outline" data-settle-index="${idx}" title="Record that this transfer has been made">
          Mark Paid
        </button>
      </li>
    `).join('');
  }

  // 3. Smart Next Bill Recommendation
  const sortedDebtors = Object.entries(netBalances).sort((a, b) => a[1] - b[1]);
  const biggestDebtor = sortedDebtors[0];
  if (biggestDebtor && biggestDebtor[1] < 0) {
    $('#nextPayerBox').style.display = 'flex';
    $('#nextPayerText').textContent = `Recommendation: Next bill should be paid by ${biggestDebtor[0]}, who currently owes the most (${formatRupees(Math.abs(biggestDebtor[1]))}).`;
  } else {
    $('#nextPayerBox').style.display = 'none';
  }
}

/**
 * Renders Quick Stats and Budget Progress Bar
 */
function renderStats() {
  const pureExpenses = AppState.expenses.filter(x => x.kind === 'expense');
  const totalPaisa = pureExpenses.reduce((sum, exp) => sum + exp.cents, 0);
  const totalCount = pureExpenses.length;
  const avgPaisa = AppState.members.length > 0 ? Math.round(totalPaisa / AppState.members.length) : 0;
  const biggestExp = pureExpenses.reduce((top, cur) => (!top || cur.cents > top.cents ? cur : top), null);

  $('#statTotal').textContent = formatRupees(totalPaisa);
  $('#statCount').textContent = totalCount;
  $('#statAverage').textContent = formatRupees(avgPaisa);
  $('#statBiggest').textContent = biggestExp ? `${formatRupees(biggestExp.cents)} (${escapeHtml(biggestExp.desc.slice(0, 16))})` : '–';

  // Budget Tracker
  const budgetPaisa = AppState.budget || 0;
  $('#budgetInput').value = budgetPaisa > 0 ? (budgetPaisa / 100) : '';

  if (budgetPaisa > 0) {
    const pct = Math.round((totalPaisa / budgetPaisa) * 100);
    $('#budgetProgress').value = Math.min(100, pct);
    $('#budgetPct').textContent = `${pct}%`;
    const remaining = budgetPaisa - totalPaisa;
    if (remaining >= 0) {
      $('#budgetStatusTxt').textContent = `${formatRupees(totalPaisa)} spent of ${formatRupees(budgetPaisa)} target (${formatRupees(remaining)} remaining)`;
    } else {
      $('#budgetStatusTxt').textContent = `⚠️ Over budget by ${formatRupees(Math.abs(remaining))}! (${formatRupees(totalPaisa)} spent of ${formatRupees(budgetPaisa)})`;
    }
  } else {
    $('#budgetProgress').value = 0;
    $('#budgetPct').textContent = '0%';
    $('#budgetStatusTxt').textContent = 'No budget set. Enter an amount above to track spending limits.';
  }
}

/**
 * Renders the Transaction Ledger list with filters & sorting applied
 */
function renderLedger() {
  const searchQuery = ($('#filterSearch').value || '').trim().toLowerCase();
  const selectedCat = $('#filterCategory').value;
  const selectedPayer = $('#filterPayer').value;
  const sortMode = $('#filterSort').value;

  // Filter
  let filtered = AppState.expenses.filter(exp => {
    const matchesSearch = !searchQuery ||
      exp.desc.toLowerCase().includes(searchQuery) ||
      (exp.note && exp.note.toLowerCase().includes(searchQuery)) ||
      exp.payer.toLowerCase().includes(searchQuery) ||
      exp.cat.toLowerCase().includes(searchQuery);

    const matchesCat = !selectedCat || exp.cat === selectedCat;
    const matchesPayer = !selectedPayer || exp.payer === selectedPayer;

    return matchesSearch && matchesCat && matchesPayer;
  });

  // Sort
  filtered.sort((a, b) => {
    if (sortMode === 'high') return b.cents - a.cents;
    if (sortMode === 'low') return a.cents - b.cents;
    if (sortMode === 'old') return a.date.localeCompare(b.date) || a.id - b.id;
    return b.date.localeCompare(a.date) || b.id - a.id; // 'new'
  });

  $('#ledgerCountText').textContent = `Showing ${filtered.length} of ${AppState.expenses.length} entries`;

  if (filtered.length === 0) {
    $('#expenseList').innerHTML = `
      <li class="empty-state-box">
        <p><strong>No transactions found.</strong></p>
        <p>Try clearing your search query or selecting "All Categories" and "All Members".</p>
      </li>
    `;
    return;
  }

  $('#expenseList').innerHTML = filtered.map(exp => {
    const isSettlement = exp.kind === 'settlement';
    const catIcon = CATEGORIES[exp.cat] || '🧾';
    const splitCount = Object.keys(exp.shares).length;
    const splitSummary = isSettlement
      ? `Reimbursement to ${escapeHtml(Object.keys(exp.shares)[0])}`
      : `Split among ${splitCount} member${splitCount > 1 ? 's' : ''} (${exp.mode})`;

    const formattedDate = new Date(exp.date + 'T00:00:00').toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    return `
      <li class="ledger-item" data-id="${exp.id}">
        <div class="ledger-cat-icon" aria-hidden="true">${catIcon}</div>
        <div class="ledger-main-info">
          <div class="ledger-title-line">
            <strong class="ledger-desc">${escapeHtml(exp.desc)}</strong>
            ${isSettlement ? '<span class="tag-badge settlement">Payment</span>' : ''}
            ${exp.edited ? '<span class="tag-badge corrected">Corrected</span>' : ''}
          </div>
          <div class="ledger-meta-line">
            <span>Paid by <strong>${escapeHtml(exp.payer)}</strong></span>
            <span>·</span>
            <span>${splitSummary}</span>
            <span>·</span>
            <time datetime="${exp.date}">${formattedDate}</time>
          </div>
          ${exp.note ? `<div class="ledger-note-quote">“${escapeHtml(exp.note)}”</div>` : ''}
        </div>

        <div class="ledger-amount-box">
          <span class="ledger-amount-pkr">${formatRupees(exp.cents)}</span>
          ${exp.cur && exp.cur !== 'PKR' ? `
            <span class="ledger-amount-orig">${escapeHtml(exp.cur)} ${(exp.orig / 100).toFixed(2)} @ ${EXCHANGE_RATES[exp.cur]}</span>
          ` : ''}
        </div>

        <div class="ledger-btn-actions">
          <button type="button" class="action-link-btn" data-action="details" data-id="${exp.id}">View Details</button>
          ${!isSettlement ? `
            <button type="button" class="action-link-btn" data-action="edit" data-id="${exp.id}">Correct / Edit</button>
            <button type="button" class="action-link-btn" data-action="repeat" data-id="${exp.id}">Repeat</button>
          ` : ''}
          <button type="button" class="action-link-btn danger-link" data-action="delete" data-id="${exp.id}">Delete</button>
        </div>
      </li>
    `;
  }).join('');
}

/**
 * Renders Visual Insights (Donut chart, Category bars, Daily histogram, Member breakdown table, Awards)
 */
function renderInsights() {
  const pureExpenses = AppState.expenses.filter(x => x.kind === 'expense');
  const totalPaisa = pureExpenses.reduce((sum, exp) => sum + exp.cents, 0);

  // 1. Category Totals
  const categoryTotals = {};
  pureExpenses.forEach(exp => {
    categoryTotals[exp.cat] = (categoryTotals[exp.cat] || 0) + exp.cents;
  });

  const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

  // Donut chart using CSS conic-gradient
  if (totalPaisa > 0) {
    let accumulated = 0;
    const gradientStops = sortedCategories.map(([cat, amount], idx) => {
      const startPct = (accumulated / totalPaisa) * 100;
      accumulated += amount;
      const endPct = (accumulated / totalPaisa) * 100;
      const color = CHART_COLORS[idx % CHART_COLORS.length];
      return `${color} ${startPct.toFixed(1)}% ${endPct.toFixed(1)}%`;
    });
    $('#donutChart').style.background = `conic-gradient(${gradientStops.join(', ')})`;
    $('#donutTotalAmount').textContent = formatRupees(totalPaisa);
  } else {
    $('#donutChart').style.background = 'var(--border-subtle)';
    $('#donutTotalAmount').textContent = 'Rs 0.00';
  }

  // Category Breakdown Bars
  if (sortedCategories.length > 0) {
    $('#categoryBarsList').innerHTML = sortedCategories.map(([cat, amount], idx) => {
      const pct = ((amount / totalPaisa) * 100).toFixed(1);
      const color = CHART_COLORS[idx % CHART_COLORS.length];
      return `
        <li class="cat-bar-item">
          <span class="cat-bar-name">${CATEGORIES[cat] || '🧾'} ${escapeHtml(cat)}</span>
          <div class="cat-bar-track">
            <div class="cat-bar-fill" style="width: ${pct}%; background-color: ${color};"></div>
          </div>
          <span class="cat-bar-amount">${formatRupees(amount)}</span>
        </li>
      `;
    }).join('');
  } else {
    $('#categoryBarsList').innerHTML = '<li class="empty-state-box"><p>No expenses added yet.</p></li>';
  }

  // 2. Daily Spending Timeline
  const dailyTotals = {};
  pureExpenses.forEach(exp => {
    dailyTotals[exp.date] = (dailyTotals[exp.date] || 0) + exp.cents;
  });

  const sortedDates = Object.keys(dailyTotals).sort();
  const maxDailyPaisa = Math.max(1, ...Object.values(dailyTotals));

  if (sortedDates.length > 0) {
    $('#dailyChart').innerHTML = sortedDates.map(dateKey => {
      const dayPaisa = dailyTotals[dateKey];
      const barHeightPct = Math.max(8, Math.round((dayPaisa / maxDailyPaisa) * 100));
      const dateObj = new Date(dateKey + 'T00:00:00');
      const label = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

      return `
        <div class="daily-bar-col" title="${dateKey}: ${formatRupees(dayPaisa)}">
          <div class="daily-bar-fill" style="height: ${barHeightPct}%;"></div>
          <span class="daily-date-label">${label}</span>
        </div>
      `;
    }).join('');
  } else {
    $('#dailyChart').innerHTML = '<p class="empty-state-box">No spending activity to chart.</p>';
  }

  // 3. Member Financial Breakdown Table
  const memberPaid = {};
  const memberShare = {};
  AppState.members.forEach(m => {
    memberPaid[m] = 0;
    memberShare[m] = 0;
  });

  pureExpenses.forEach(exp => {
    if (exp.payer in memberPaid) memberPaid[exp.payer] += exp.cents;
    for (const [m, share] of Object.entries(exp.shares)) {
      if (m in memberShare) memberShare[m] += share;
    }
  });

  const netBalances = calculateNetBalances();

  $('#memberTableBody').innerHTML = AppState.members.map(member => {
    const paid = memberPaid[member];
    const share = memberShare[member];
    const net = netBalances[member];
    const isCreditor = net > 0;
    const isDebtor = net < 0;

    let badge = '<span class="tag-badge">Settled</span>';
    if (isCreditor) badge = `<span class="tag-badge settlement">Owed +${formatRupees(net)}</span>`;
    if (isDebtor) badge = `<span class="tag-badge corrected">Owes −${formatRupees(Math.abs(net))}</span>`;

    return `
      <tr>
        <th scope="row">
          <span style="display: inline-flex; align-items: center; gap: 0.5rem;">
            ${renderAvatar(member)}
            <strong>${escapeHtml(member)}</strong>
          </span>
        </th>
        <td>${formatRupees(paid)}</td>
        <td>${formatRupees(share)}</td>
        <td style="font-weight: 800; color: ${isCreditor ? 'var(--status-pos)' : (isDebtor ? 'var(--status-neg)' : 'inherit')};">
          ${isCreditor ? '+' : (isDebtor ? '−' : '')}${formatRupees(Math.abs(net))}
        </td>
        <td>${badge}</td>
      </tr>
    `;
  }).join('');

  // 4. Trip Awards & Badges
  const awards = [];
  if (pureExpenses.length > 0) {
    const topPayer = Object.entries(memberPaid).sort((a, b) => b[1] - a[1])[0];
    const biggestExp = pureExpenses.reduce((b, x) => (!b || x.cents > b.cents ? x : b), null);
    const busiestDay = sortedDates.slice().sort((a, b) => dailyTotals[b] - dailyTotals[a])[0];
    const biggestCreditor = Object.entries(netBalances).sort((a, b) => b[1] - a[1])[0];
    const biggestDebtor = Object.entries(netBalances).sort((a, b) => a[1] - b[1])[0];

    if (topPayer && topPayer[1] > 0) {
      awards.push({ icon: '👑', title: 'Top Spender', meta: `${topPayer[0]} paid ${formatRupees(topPayer[1])}` });
    }
    if (biggestExp) {
      awards.push({ icon: '🏔️', title: 'Biggest Single Bill', meta: `${biggestExp.desc} (${formatRupees(biggestExp.cents)})` });
    }
    if (busiestDay) {
      const formattedDay = new Date(busiestDay + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      awards.push({ icon: '📅', title: 'Peak Spending Day', meta: `${formattedDay} (${formatRupees(dailyTotals[busiestDay])})` });
    }
    if (biggestCreditor && biggestCreditor[1] > 0) {
      awards.push({ icon: '🤝', title: 'Group Benefactor', meta: `${biggestCreditor[0]} is owed ${formatRupees(biggestCreditor[1])}` });
    }
    if (biggestDebtor && biggestDebtor[1] < 0) {
      awards.push({ icon: '🍵', title: 'Next Treat Due', meta: `${biggestDebtor[0]} owes ${formatRupees(Math.abs(biggestDebtor[1]))}` });
    }
  }

  $('#awardsList').innerHTML = awards.map(a => `
    <li class="award-card">
      <span class="award-icon" aria-hidden="true">${a.icon}</span>
      <strong class="award-title">${escapeHtml(a.title)}</strong>
      <span class="award-meta">${escapeHtml(a.meta)}</span>
    </li>
  `).join('');
}

/**
 * Renders the Activity & Corrections Audit Trail
 */
function renderActivityLog() {
  const log = AppState.activityLog || [];
  if (log.length === 0) {
    $('#activityLogList').innerHTML = '<li class="empty-state-box"><p>No activity recorded yet.</p></li>';
    return;
  }

  $('#activityLogList').innerHTML = log.map(item => {
    const timeFormatted = new Date(item.t).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
    return `
      <li>
        <div>${escapeHtml(item.text)}</div>
        <time class="log-time" datetime="${new Date(item.t).toISOString()}">${timeFormatted}</time>
      </li>
    `;
  }).join('');
}

/**
 * Top-level master render trigger
 */
function renderAll() {
  renderMembers();
  renderBalances();
  renderStats();
  renderLedger();
  renderInsights();
  renderActivityLog();
}

/* ==========================================================================
   8. Form Handling & Interactive Validations
   ========================================================================== */

function resetExpenseForm() {
  currentEditingId = null;
  $('#expenseForm').reset();
  $('#expenseDate').value = new Date().toISOString().slice(0, 10);
  $('#splitMode').value = 'equal';
  $('#expenseCurrency').value = 'PKR';
  $('#currencyHint').textContent = 'Amount in Pakistani Rupees.';
  $('#saveExpenseBtn').innerHTML = '<span class="btn-icon">＋</span> Add Expense';
  $('#cancelEditBtn').hidden = true;
  $('#formAlertMsg').textContent = '';
  renderSplitMatrix({}, AppState.members);
}

// Currency Conversion Preview Hint
$('#expenseCurrency').addEventListener('change', () => {
  const cur = $('#expenseCurrency').value;
  const amount = parseFloat($('#expenseAmount').value);
  if (cur === 'PKR') {
    $('#currencyHint').textContent = 'Amount in Pakistani Rupees.';
  } else {
    const rate = EXCHANGE_RATES[cur] || 1;
    const converted = (!isNaN(amount) && amount > 0) ? formatRupees(Math.round(amount * rate * 100)) : 'Rs 0.00';
    $('#currencyHint').textContent = `1 ${cur} = ${rate} PKR · Converts to approximately ${converted}`;
  }
});

$('#expenseAmount').addEventListener('input', () => {
  const cur = $('#expenseCurrency').value;
  if (cur !== 'PKR') {
    const rate = EXCHANGE_RATES[cur] || 1;
    const amount = parseFloat($('#expenseAmount').value);
    const converted = (!isNaN(amount) && amount > 0) ? formatRupees(Math.round(amount * rate * 100)) : 'Rs 0.00';
    $('#currencyHint').textContent = `1 ${cur} = ${rate} PKR · Converts to approximately ${converted}`;
  }
});

// Mode change re-renders split allocation matrix
$('#splitMode').addEventListener('change', () => {
  renderSplitMatrix();
});

// Add or Correct Expense Submission
$('#expenseForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const alertEl = $('#formAlertMsg');
  alertEl.textContent = '';

  const desc = $('#expenseDesc').value.trim();
  const rawAmount = parseFloat($('#expenseAmount').value);
  const cur = $('#expenseCurrency').value;
  const payer = $('#expensePayer').value;
  const date = $('#expenseDate').value;
  const cat = $('#expenseCategory').value;
  const note = $('#expenseNote').value.trim();
  const mode = $('#splitMode').value;

  // Validation
  if (desc.length < 3) {
    alertEl.textContent = 'Description must be at least 3 characters long.';
    $('#expenseDesc').focus();
    return;
  }

  if (isNaN(rawAmount) || rawAmount <= 0) {
    alertEl.textContent = 'Please enter a valid positive expense amount.';
    $('#expenseAmount').focus();
    return;
  }

  if (!date) {
    alertEl.textContent = 'Please select a valid date for this expense.';
    $('#expenseDate').focus();
    return;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  if (date > todayStr) {
    alertEl.textContent = 'Expense date cannot be in the future.';
    $('#expenseDate').focus();
    return;
  }

  // Calculate currency conversion into integer paisas
  const rate = EXCHANGE_RATES[cur] || 1;
  const origPaisa = Math.round(rawAmount * 100);
  const totalPaisa = Math.round(origPaisa * rate);

  // Validate and compute shares
  const splitResult = parseSplitShares(totalPaisa);
  if (splitResult.error) {
    alertEl.textContent = splitResult.error;
    return;
  }

  const newExpense = {
    id: currentEditingId || Date.now(),
    desc,
    cents: totalPaisa,
    payer,
    date,
    cat,
    mode,
    shares: splitResult.shares,
    kind: 'expense',
    cur,
    orig: origPaisa,
    note,
    edited: Boolean(currentEditingId)
  };

  if (currentEditingId) {
    const oldExp = AppState.expenses.find(x => x.id === currentEditingId);
    AppState.expenses = AppState.expenses.map(x => x.id === currentEditingId ? newExpense : x);
    logActivity(`Corrected “${desc}”: was ${formatRupees(oldExp.cents)} (paid by ${oldExp.payer}) ➔ now ${formatRupees(totalPaisa)} (paid by ${payer}).`);
    showToast('Correction successfully saved');
  } else {
    AppState.expenses.push(newExpense);
    logActivity(`${payer} added “${desc}” (${formatRupees(totalPaisa)}) split among ${Object.keys(splitResult.shares).length} members.`);
    showToast('Expense successfully added');
  }

  saveState();
  resetExpenseForm();
  renderAll();
});

$('#cancelEditBtn').addEventListener('click', resetExpenseForm);

/* ==========================================================================
   9. Member Roster Management
   ========================================================================== */
$('#memberAddForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#newMemberName');
  const alertEl = $('#memberFormMsg');
  const name = input.value.trim().replace(/\s+/g, ' ');

  alertEl.textContent = '';

  if (name.length < 2) {
    alertEl.textContent = 'Member name must contain at least 2 characters.';
    input.focus();
    return;
  }

  if (name.length > 20) {
    alertEl.textContent = 'Member name cannot exceed 20 characters.';
    input.focus();
    return;
  }

  if (AppState.members.some(m => m.toLowerCase() === name.toLowerCase())) {
    alertEl.textContent = `A member named "${name}" is already in the group.`;
    input.focus();
    return;
  }

  AppState.members.push(name);
  logActivity(`${name} joined the expedition group.`);
  input.value = '';
  saveState();
  renderAll();
  showToast(`${name} joined the group`);
});

// Member Deletion Delegated Click
document.addEventListener('click', (e) => {
  const rmBtn = e.target.closest('[data-remove-member]');
  if (!rmBtn) return;
  const memberName = rmBtn.dataset.removeMember;

  if (AppState.members.length <= 2) {
    showToast('A group must have at least 2 members.');
    return;
  }

  AppState.members = AppState.members.filter(m => m !== memberName);
  logActivity(`${memberName} was removed from the group.`);
  saveState();
  renderAll();
  showToast(`${memberName} removed`);
});

/* ==========================================================================
   10. Ledger Actions (Details, Edit, Repeat, Delete with Undo)
   ========================================================================== */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = parseInt(btn.dataset.id, 10);
  const exp = AppState.expenses.find(x => x.id === id);
  if (!exp) return;

  // View Details Modal
  if (action === 'details') {
    $('#detailModalTitle').textContent = exp.desc;
    const formattedDate = new Date(exp.date + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const rowsHtml = Object.entries(exp.shares).map(([member, shareVal]) => {
      const pct = ((shareVal / exp.cents) * 100).toFixed(1);
      return `
        <tr>
          <th scope="row">
            <span style="display:inline-flex; align-items:center; gap:0.4rem;">
              ${renderAvatar(member)}
              ${escapeHtml(member)}
            </span>
          </th>
          <td>${formatRupees(shareVal)}</td>
          <td>${pct}%</td>
        </tr>
      `;
    }).join('');

    $('#detailModalBody').innerHTML = `
      <div style="background:var(--bg-card-subtle); padding:1rem; border-radius:var(--r-md); font-size:0.9rem; display:grid; gap:0.35rem;">
        <div><strong>Paid by:</strong> ${escapeHtml(exp.payer)}</div>
        <div><strong>Total Amount:</strong> ${formatRupees(exp.cents)} ${exp.cur !== 'PKR' ? `(${escapeHtml(exp.cur)} ${(exp.orig / 100).toFixed(2)})` : ''}</div>
        <div><strong>Date:</strong> ${formattedDate}</div>
        <div><strong>Category:</strong> ${CATEGORIES[exp.cat] || ''} ${escapeHtml(exp.cat)}</div>
        <div><strong>Split Method:</strong> ${escapeHtml(exp.mode)}</div>
        ${exp.note ? `<div><strong>Notes:</strong> “${escapeHtml(exp.note)}”</div>` : ''}
      </div>

      <h4 style="font-size:0.95rem; margin-top:0.5rem;">Participant Breakdown</h4>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col">Assigned Share</th>
              <th scope="col">Share %</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
    $('#detailModal').showModal();
  }

  // Edit / Correct Expense
  if (action === 'edit') {
    currentEditingId = exp.id;
    $('#expenseDesc').value = exp.desc;
    $('#expenseCurrency').value = exp.cur || 'PKR';
    $('#expenseAmount').value = ((exp.orig ?? exp.cents) / 100).toFixed(2);
    $('#expensePayer').value = exp.payer;
    $('#expenseDate').value = exp.date;
    $('#expenseCategory').value = exp.cat;
    $('#splitMode').value = (exp.mode === 'shares' ? 'shares' : exp.mode);
    $('#expenseNote').value = exp.note || '';

    // Reconstruct input values for exact/percent
    const initialVals = {};
    Object.entries(exp.shares).forEach(([m, p]) => {
      initialVals[m] = exp.mode === 'percent'
        ? +((p / exp.cents) * 100).toFixed(2)
        : (p / 100).toFixed(2);
    });

    renderSplitMatrix(initialVals, Object.keys(exp.shares));

    $('#saveExpenseBtn').innerHTML = '<span class="btn-icon">💾</span> Save Correction';
    $('#cancelEditBtn').hidden = false;
    $('#add').scrollIntoView({ behavior: 'smooth' });
    $('#expenseDesc').focus();
    showToast('Editing: adjust values and click Save Correction');
  }

  // Repeat Expense (Daily meal, recurring transport)
  if (action === 'repeat') {
    const clone = {
      ...exp,
      id: Date.now(),
      date: new Date().toISOString().slice(0, 10),
      edited: false,
      shares: { ...exp.shares }
    };
    AppState.expenses.push(clone);
    logActivity(`Repeated “${exp.desc}” (${formatRupees(exp.cents)}) dated today.`);
    saveState();
    renderAll();
    showToast(`Repeated “${exp.desc}” for today`);
  }

  // Delete Expense with 6-Second Undo Toast
  if (action === 'delete') {
    const deletedExp = exp;
    AppState.expenses = AppState.expenses.filter(x => x.id !== id);
    logActivity(`Deleted “${deletedExp.desc}” (${formatRupees(deletedExp.cents)}).`);
    saveState();
    renderAll();

    showToast(`Deleted “${deletedExp.desc}”`, () => {
      AppState.expenses.push(deletedExp);
      logActivity(`Restored “${deletedExp.desc}”.`);
      saveState();
      renderAll();
    });
  }
});

// Settlement "Mark Paid" Button
document.addEventListener('click', (e) => {
  const settleBtn = e.target.closest('button[data-settle-index]');
  if (!settleBtn) return;
  const idx = parseInt(settleBtn.dataset.settleIndex, 10);
  const activeTx = renderBalances.activeSettlements[idx];
  if (!activeTx) return;

  const settlementRecord = {
    id: Date.now(),
    desc: `${activeTx.from} paid ${activeTx.to} to settle debt`,
    cents: activeTx.amount,
    payer: activeTx.from,
    date: new Date().toISOString().slice(0, 10),
    cat: 'Settlement',
    mode: 'exact',
    shares: { [activeTx.to]: activeTx.amount },
    kind: 'settlement',
    cur: 'PKR',
    orig: activeTx.amount,
    note: 'Marked as settled via Debt Simplification engine',
    edited: false
  };

  AppState.expenses.push(settlementRecord);
  logActivity(`Settlement recorded: ${activeTx.from} paid ${activeTx.to} ${formatRupees(activeTx.amount)}.`);
  saveState();
  renderAll();
  showToast(`Recorded payment: ${activeTx.from} ➔ ${activeTx.to}`);
});

/* ==========================================================================
   11. Data Import, Export & Reset
   ========================================================================== */

function triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// CSV Export (With formula injection protection)
$('#exportCsvBtn').addEventListener('click', () => {
  const sanitizeCell = (val) => {
    let str = String(val === null || val === undefined ? '' : val);
    // Formula Injection Defense: prepend apostrophe if cell starts with =, +, -, @
    if (/^[=+@\-]/.test(str)) {
      str = "'" + str;
    }
    return `"${str.replace(/"/g, '""')}"`;
  };

  const headers = ['Date', 'Type', 'Description', 'Category', 'Paid By', 'Amount (PKR)', 'Split Breakdown', 'Notes', 'Original Currency'];
  const rows = [headers];

  AppState.expenses.forEach(exp => {
    const splitStr = Object.entries(exp.shares)
      .map(([m, p]) => `${m}: ${(p / 100).toFixed(2)}`)
      .join('; ');

    rows.push([
      exp.date,
      exp.kind,
      exp.desc,
      exp.cat,
      exp.payer,
      (exp.cents / 100).toFixed(2),
      splitStr,
      exp.note || '',
      exp.cur !== 'PKR' ? `${exp.cur} ${(exp.orig / 100).toFixed(2)}` : 'PKR'
    ]);
  });

  // Append summary balances
  rows.push([]);
  rows.push(['--- MEMBER NET BALANCES ---']);
  rows.push(['Member', 'Net Position (PKR)']);
  const net = calculateNetBalances();
  AppState.members.forEach(m => {
    rows.push([m, (net[m] / 100).toFixed(2)]);
  });

  const csvContent = rows.map(r => r.map(sanitizeCell).join(',')).join('\r\n');
  triggerDownload('hisaabkitab-tour-expenses.csv', csvContent, 'text/csv;charset=utf-8;');
  showToast('CSV export downloaded');
});

// JSON Export
$('#exportJsonBtn').addEventListener('click', () => {
  const jsonContent = JSON.stringify(AppState, null, 2);
  triggerDownload('hisaabkitab-backup.json', jsonContent, 'application/json');
  showToast('JSON backup file downloaded');
});

// JSON Import
$('#importJsonInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  if (file.size > 1.5 * 1024 * 1024) {
    showToast('File too large (limit: 1.5 MB)');
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const sanitized = sanitizeState(parsed);

    if (!sanitized) {
      throw new Error('Invalid state structure');
    }

    AppState = sanitized;
    logActivity(`Restored state with ${sanitized.expenses.length} transactions from imported JSON file.`);
    saveState();
    resetExpenseForm();
    renderAll();
    showToast(`Successfully imported ${sanitized.expenses.length} entries`);
  } catch (err) {
    showToast('Import failed: invalid or corrupt TripTab file');
  }
});

// Print Statement
$('#printReportBtn').addEventListener('click', () => {
  window.print();
});

// Reset Demo Dataset
$('#resetDemoBtn').addEventListener('click', () => {
  if (confirm('Reset to the initial 8-record Hunza expedition demo dataset? This will replace your current edits.')) {
    AppState = getSampleDataset();
    logActivity('Dataset reset to original 8 sample records.');
    saveState();
    resetExpenseForm();
    renderAll();
    showToast('Demo dataset restored');
  }
});

// Clear Activity Log
$('#clearLogBtn').addEventListener('click', () => {
  AppState.activityLog = [];
  saveState();
  renderActivityLog();
  showToast('Activity log cleared');
});

/* ==========================================================================
   12. Social Sharing & Clipboard Helpers
   ========================================================================== */

$('#shareWhatsAppBtn').addEventListener('click', () => {
  const net = calculateNetBalances();
  const transfers = computeSimplifiedDebts(net);
  const pureExpenses = AppState.expenses.filter(x => x.kind === 'expense');
  const total = pureExpenses.reduce((s, x) => s + x.cents, 0);

  const transferLines = transfers.length > 0
    ? transfers.map(t => `• ${t.from} ➔ ${t.to}: ${formatRupees(t.amount)}`)
    : ['Sab hisaab barabar hai ✅ All settled up!'];

  const message = `🇵🇰 *HisaabKitab - Trip Settlement Summary*\n` +
    `Total Group Spend: ${formatRupees(total)}\n\n` +
    `*Required Settle-up Payments:*\n` +
    transferLines.join('\n') +
    `\n\n_Generated via HisaabKitab (Topic #38)_`;

  window.open('https://wa.me/?text=' + encodeURIComponent(message), '_blank', 'noopener,noreferrer');
});

$('#copySummaryBtn').addEventListener('click', () => {
  const net = calculateNetBalances();
  const transfers = computeSimplifiedDebts(net);
  const pureExpenses = AppState.expenses.filter(x => x.kind === 'expense');
  const total = pureExpenses.reduce((s, x) => s + x.cents, 0);

  const transferLines = transfers.length > 0
    ? transfers.map(t => `${t.from} pays ${t.to}: ${formatRupees(t.amount)}`)
    : ['Everyone is settled up.'];

  const summary = `HisaabKitab - Trip Settlement\nTotal Spent: ${formatRupees(total)}\n\nSettlement Transfers:\n` +
    transferLines.join('\n');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(summary)
      .then(() => showToast('Summary copied to clipboard'))
      .catch(() => showToast('Clipboard write failed'));
  } else {
    showToast('Clipboard access not supported in this browser');
  }
});

/* ==========================================================================
   13. Toast Notifications & Dialog Modals
   ========================================================================== */
let toastTimeoutId = null;

function showToast(message, undoCallback = null) {
  const toast = $('#toastNotification');
  toast.textContent = message;
  toast.classList.remove('show');

  if (undoCallback) {
    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'toast-undo-btn';
    undoBtn.textContent = 'Undo';
    undoBtn.onclick = () => {
      undoCallback();
      toast.classList.remove('show');
      showToast('Action undone');
    };
    toast.appendChild(undoBtn);
  }

  // Trigger reflow to restart CSS animation
  void toast.offsetWidth;
  toast.classList.add('show');

  clearTimeout(toastTimeoutId);
  toastTimeoutId = setTimeout(() => {
    toast.classList.remove('show');
  }, undoCallback ? 6500 : 2800);
}

// Modal Closers
$('#detailCloseBtn').addEventListener('click', () => $('#detailModal').close());
$('#detailDoneBtn').addEventListener('click', () => $('#detailModal').close());
$('#detailModal').addEventListener('click', (e) => {
  if (e.target === $('#detailModal')) $('#detailModal').close();
});

$('#explainAlgorithmBtn').addEventListener('click', () => $('#algoModal').showModal());
$('#algoCloseBtn').addEventListener('click', () => $('#algoModal').close());
$('#algoDoneBtn').addEventListener('click', () => $('#algoModal').close());
$('#algoModal').addEventListener('click', (e) => {
  if (e.target === $('#algoModal')) $('#algoModal').close();
});

/* ==========================================================================
   14. Theme & Urdu (RTL) Localization Engine
   ========================================================================== */
let currentTheme = localStorage.getItem(THEME_STORAGE_KEY) ||
  (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

let currentLang = localStorage.getItem(LANG_STORAGE_KEY) === 'ur' ? 'ur' : 'en';

const TRANSLATIONS = {
  ur: {
    brandSub: 'مشترکہ اخراجات اور قرض تقسیم کرنے والا اسمارٹ سسٹم',
    greet: 'السلام علیکم 👋 خوش آمدید',
    navOverview: 'جائزہ',
    navBalances: 'حساب کتاب',
    navAdd: 'خرچہ درج کریں',
    navLedger: 'کھاتہ',
    navInsights: 'تجزیہ',
    navActivity: 'سرگرمیاں',
    btnExportCsv: '📥 CSV ڈاؤن لوڈ',
    btnExportJson: '💾 JSON محفوظ کریں',
    btnPrint: '🖨️ پرنٹ رپورٹ',
    btnReset: '🔄 ڈیمو بحال کریں'
  }
};

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.dataset.theme = theme;
  $('#themeIcon').textContent = theme === 'dark' ? '☀️' : '🌙';
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (e) {}
}

function applyLanguage(lang) {
  currentLang = lang;
  const isUrdu = lang === 'ur';
  document.documentElement.lang = isUrdu ? 'ur' : 'en';
  document.documentElement.dir = isUrdu ? 'rtl' : 'ltr';

  $('#langLabel').textContent = isUrdu ? 'English' : 'اردو';

  if (isUrdu) {
    $('#brandSub').textContent = TRANSLATIONS.ur.brandSub;
    $('#greet').textContent = TRANSLATIONS.ur.greet;
  } else {
    $('#brandSub').textContent = 'Smart Group Expense Tracker & Debt Simplifier';
    $('#greet').textContent = 'السلام علیکم 👋 Welcome';
  }

  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch (e) {}
}

$('#themeBtn').addEventListener('click', () => {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
});

$('#langBtn').addEventListener('click', () => {
  applyLanguage(currentLang === 'ur' ? 'en' : 'ur');
});

/* ==========================================================================
   15. Keyboard Shortcuts & Preset Quick-Add
   ========================================================================== */
document.addEventListener('keydown', (e) => {
  // Ignore if user is actively typing in an input
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) {
    return;
  }

  // Press "/" to search ledger
  if (e.key === '/') {
    e.preventDefault();
    $('#filterSearch').focus();
    $('#filterSearch').select();
  }

  // Press "N" to add a new expense
  if (e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    $('#add').scrollIntoView({ behavior: 'smooth' });
    $('#expenseDesc').focus();
  }
});

// Render 1-Tap Presets
$('#presetsList').innerHTML = PRESETS.map((p, idx) => `
  <button type="button" class="preset-chip" data-preset-idx="${idx}">
    ${p.label}
  </button>
`).join('');

$('#presetsList').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-preset-idx]');
  if (!chip) return;
  const preset = PRESETS[parseInt(chip.dataset.presetIdx, 10)];
  if (!preset) return;

  $('#expenseDesc').value = preset.desc;
  $('#expenseAmount').value = preset.amount;
  $('#expenseCurrency').value = 'PKR';
  $('#expenseCategory').value = preset.cat;
  $('#currencyHint').textContent = 'Amount in Pakistani Rupees.';
  $('#expenseAmount').focus();
  $('#expenseAmount').select();
  showToast(`Loaded preset: ${preset.desc}`);
});

// Ledger Live Filter Listeners
['#filterSearch', '#filterCategory', '#filterPayer', '#filterSort'].forEach(id => {
  $(id).addEventListener('input', renderLedger);
});

// Budget Input Change Listener
$('#budgetInput').addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  AppState.budget = (!isNaN(val) && val >= 0) ? Math.round(val * 100) : 0;
  saveState();
  renderStats();
});

/* ==========================================================================
   16. Application Initialization
   ========================================================================== */
function initializeApp() {
  // Populate Categories in Dropdowns
  const categoryKeys = Object.keys(CATEGORIES).filter(c => c !== 'Settlement');
  $('#expenseCategory').innerHTML = categoryKeys.map(c => `
    <option value="${c}">${CATEGORIES[c]} ${c}</option>
  `).join('');

  $('#filterCategory').innerHTML = '<option value="">All Categories</option>' +
    Object.keys(CATEGORIES).map(c => `<option value="${c}">${CATEGORIES[c]} ${c}</option>`).join('');

  // Set today's date constraint
  const today = new Date().toISOString().slice(0, 10);
  $('#expenseDate').value = today;
  $('#expenseDate').max = today;

  // Apply saved theme & language
  applyTheme(currentTheme);
  applyLanguage(currentLang);

  // Initial Full Render
  renderAll();

  // Register Service Worker for Offline PWA (when hosted via HTTP/HTTPS)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.info('Service Worker registration skipped or failed:', err);
    });
  }

  console.info('HisaabKitab (TripTab 2.0) initialized successfully for Muhammad Zun U Rain Tahir (CMS: 527352).');
}

document.addEventListener('DOMContentLoaded', initializeApp);
