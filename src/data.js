import { FIXED_CATEGORIES, INVESTMENT_CATEGORY, MONTHS } from './config.js';

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const euro2 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const percent = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 1 });

export const fmt = { euro, euro2, percent };

export async function loadFinanceData() {
  const response = await fetch('/api/finance', { headers: { accept: 'application/json' } });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || `API non disponibile (${response.status})`);
  }
  const data = await response.json();
  return {
    expenses: normalizeExpenses(data.expenses || []),
    incomes: normalizeIncomes(data.incomes || []),
    generatedAt: data.generatedAt || null,
  };
}

function normalizeExpenses(rows) {
  return rows
    .map((r) => ({ date: new Date(`${r.date}T12:00:00`), amount: Number(r.amount || 0), category: String(r.category || '').trim().toLowerCase() }))
    .filter((r) => Number.isFinite(r.amount) && !Number.isNaN(r.date.getTime()) && r.category);
}

function normalizeIncomes(rows) {
  return rows
    .map((r) => ({ date: new Date(`${r.date}T12:00:00`), amount: Number(r.amount || 0) }))
    .filter((r) => Number.isFinite(r.amount) && !Number.isNaN(r.date.getTime()));
}

export function availableYears(data) {
  return [...new Set([...data.expenses, ...data.incomes].map((r) => r.date.getFullYear()))].sort((a, b) => b - a);
}

export function filterPeriod(rows, year, monthSet = null) {
  return rows.filter((r) => r.date.getFullYear() === Number(year) && (!monthSet || monthSet.has(r.date.getMonth())));
}

export function totals(expenses, incomes) {
  const entrate = incomes.reduce((s, r) => s + r.amount, 0);
  const investimenti = expenses.filter((r) => r.category === INVESTMENT_CATEGORY).reduce((s, r) => s + r.amount, 0);
  const uscite = expenses.filter((r) => r.category !== INVESTMENT_CATEGORY).reduce((s, r) => s + r.amount, 0);
  const cashFlowNetto = entrate - uscite - investimenti;
  const capacitaRisparmio = entrate - uscite;
  const tassoRisparmio = entrate ? capacitaRisparmio / entrate : 0;
  return { entrate, uscite, investimenti, cashFlowNetto, capacitaRisparmio, tassoRisparmio };
}

export function monthly(data, year) {
  return MONTHS.map((label, month) => {
    const ex = data.expenses.filter((r) => r.date.getFullYear() === Number(year) && r.date.getMonth() === month);
    const inc = data.incomes.filter((r) => r.date.getFullYear() === Number(year) && r.date.getMonth() === month);
    return { month, label, ...totals(ex, inc) };
  });
}

export function monthlyByCategory(data, year) {
  const categories = [...new Set(data.expenses.filter((r) => r.category !== INVESTMENT_CATEGORY).map((r) => r.category))].sort();
  const matrix = MONTHS.map((label, month) => {
    const row = { month, label };
    categories.forEach((c) => { row[c] = 0; });
    data.expenses.forEach((r) => {
      if (r.date.getFullYear() === Number(year) && r.date.getMonth() === month && r.category !== INVESTMENT_CATEGORY) row[r.category] += r.amount;
    });
    return row;
  });
  return { categories, matrix };
}

export function categoryStats(data, year) {
  const rows = filterPeriod(data.expenses, year).filter((r) => r.category !== INVESTMENT_CATEGORY);
  const by = new Map();
  for (const r of rows) by.set(r.category, (by.get(r.category) || 0) + r.amount);
  const activeMonths = new Set([...filterPeriod(data.expenses, year), ...filterPeriod(data.incomes, year)].map((r) => r.date.getMonth())).size || 1;
  return [...by.entries()].map(([category, total]) => ({
    category,
    total,
    monthlyAverage: total / activeMonths,
    type: FIXED_CATEGORIES.has(category) ? 'Fissa' : 'Variabile',
  })).sort((a, b) => b.total - a.total);
}

export function fixedVariable(data, year, monthSet = null) {
  const rows = filterPeriod(data.expenses, year, monthSet).filter((r) => r.category !== INVESTMENT_CATEGORY);
  let fixed = 0;
  let variable = 0;
  for (const r of rows) {
    if (FIXED_CATEGORIES.has(r.category)) fixed += r.amount;
    else variable += r.amount;
  }
  return { fixed, variable, rigidity: fixed + variable ? fixed / (fixed + variable) : 0 };
}
