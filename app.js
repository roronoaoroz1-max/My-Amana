const $ = (id) => document.getElementById(id);

const state = {
  session: null,
  people: [],
  accounts: [],
  accountBalances: [],
  loans: [],
  payments: [],
  transactions: [],
  positions: []
};

const loginView = $("loginView");
const appView = $("appView");
const loginForm = $("loginForm");
const loginButton = $("loginButton");
const loginMessage = $("loginMessage");
const appMessage = $("appMessage");

const money = (value, currency) => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(value || 0));
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
};

const esc = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const todayIso = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

const formatDate = (value, estimated = false) => {
  if (!value) return "Date not set";
  const date = new Date(`${value}T00:00:00`);
  const text = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
  return estimated ? `${text} (estimated)` : text;
};

const nullableNumber = (value) => value === "" ? null : Number(value);
const nullableText = (value) => value === "" ? null : value;

function showMessage(text, type = "success") {
  appMessage.textContent = text || "";
  appMessage.classList.toggle("hidden", !text);
  appMessage.classList.toggle("error-box", type === "error");
}

function showLoginMessage(text) {
  loginMessage.textContent = text || "";
}

function setView(session) {
  const signedIn = Boolean(session?.user);
  state.session = session;
  loginView.classList.toggle("hidden", signedIn);
  appView.classList.toggle("hidden", !signedIn);
  $("signedInUser").textContent = signedIn ? `Signed in as ${session.user.email}` : "";
}

function switchPage(pageId) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("hidden", page.id !== pageId);
  });
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.page === pageId);
  });
}

function personName(id) {
  return state.people.find((person) => person.id === id)?.name || "Unknown";
}

function accountName(id) {
  return state.accounts.find((account) => account.id === id)?.account_name || "Unknown account";
}

function loanLabel(loan) {
  return `${loan.lender_name} → ${loan.borrower_name} · ${money(loan.remaining_amount, loan.currency)} remaining`;
}

function getLoan(id) {
  return state.loans.find((loan) => loan.loan_id === id);
}

function calculateSuggestedNextDate(loan) {
  if (!loan || !["weekly", "monthly"].includes(loan.installment_frequency)) return "";
  const baseValue = loan.next_payment_date || todayIso();
  const base = new Date(`${baseValue}T00:00:00`);
  if (loan.installment_frequency === "weekly") base.setDate(base.getDate() + 7);
  if (loan.installment_frequency === "monthly") base.setMonth(base.getMonth() + 1);
  const offset = base.getTimezoneOffset();
  return new Date(base.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function aggregateLoans(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = [row.lender_name, row.borrower_name, row.currency].join("|");
    if (!map.has(key)) {
      map.set(key, {
        lender: row.lender_name,
        borrower: row.borrower_name,
        currency: row.currency,
        principal: 0,
        repaid: 0,
        remaining: 0,
        statuses: new Set()
      });
    }
    const item = map.get(key);
    item.principal += Number(row.principal_amount || 0);
    item.repaid += Number(row.total_repaid || 0);
    item.remaining += Number(row.remaining_amount || 0);
    item.statuses.add(row.calculated_status || "active");
  }

  return [...map.values()].map((item) => ({
    ...item,
    status: item.remaining <= 0
      ? "paid"
      : item.statuses.has("overdue")
        ? "overdue"
        : item.statuses.size === 1 && item.statuses.has("cancelled")
          ? "cancelled"
          : "active"
  }));
}

function renderSummary() {
  const dad = state.accountBalances.find((item) => item.account_name === "Dad's Money");
  const mal = state.accountBalances.find((item) => item.account_name === "Mal's Dollar Savings");
  const mvr = state.positions.find((item) => item.currency === "MVR");

  $("dadTotal").textContent = money(dad?.total_managed_balance, "MVR");
  $("dadAvailable").textContent = money(dad?.available_balance, "MVR");
  $("dadLoaned").textContent = money(dad?.outstanding_loans, "MVR");
  $("malSavings").textContent = money(mal?.available_balance, "USD");
  $("iOwe").textContent = money(mvr?.i_owe, "MVR");
  $("owedToMe").textContent = money(mvr?.owed_to_me, "MVR");
}

function renderAccounts() {
  $("accountsList").innerHTML = state.accountBalances.map((account) => `
    <article class="account">
      <h3>${esc(account.account_name)}</h3>
      <small>Owner: ${esc(account.owner_name)}${account.holder_name ? ` · Held by ${esc(account.holder_name)}` : ""}</small>
      <div class="values">
        <div class="value"><span>Total managed</span><strong>${money(account.total_managed_balance, account.currency)}</strong></div>
        <div class="value"><span>Loans</span><strong>${money(account.outstanding_loans, account.currency)}</strong></div>
        <div class="value"><span>Available</span><strong>${money(account.available_balance, account.currency)}</strong></div>
      </div>
    </article>
  `).join("") || '<p class="muted">No accounts found.</p>';
}

function renderGroupedLoans() {
  const grouped = aggregateLoans(state.loans)
    .sort((a, b) => a.lender.localeCompare(b.lender) || a.borrower.localeCompare(b.borrower));

  $("loansTableBody").innerHTML = grouped.map((loan) => `
    <tr>
      <td>${esc(loan.lender)}</td>
      <td>${esc(loan.borrower)}</td>
      <td>${money(loan.principal, loan.currency)}</td>
      <td>${money(loan.repaid, loan.currency)}</td>
      <td><strong>${money(loan.remaining, loan.currency)}</strong></td>
      <td><span class="badge ${esc(loan.status)}">${esc(loan.status)}</span></td>
    </tr>
  `).join("") || '<tr><td colspan="6">No loans found.</td></tr>';
}

function renderIndividualLoans() {
  $("individualLoansBody").innerHTML = state.loans.map((loan) => {
    const installment = loan.installment_amount
      ? `${money(loan.installment_amount, loan.currency)}${loan.installment_frequency ? ` / ${esc(loan.installment_frequency)}` : ""}`
      : "Not set";

    return `
      <tr>
        <td>${esc(formatDate(loan.loan_date, loan.date_is_estimated))}</td>
        <td>${esc(loan.lender_name)}</td>
        <td>${esc(loan.borrower_name)}</td>
        <td>${money(loan.principal_amount, loan.currency)}</td>
        <td>${installment}</td>
        <td>${esc(formatDate(loan.next_payment_date))}</td>
        <td>${money(loan.total_repaid, loan.currency)}</td>
        <td><strong>${money(loan.remaining_amount, loan.currency)}</strong></td>
        <td><span class="badge ${esc(loan.calculated_status)}">${esc(loan.calculated_status)}</span></td>
        <td><button class="table-action edit-schedule" data-loan-id="${esc(loan.loan_id)}" type="button">Edit</button></td>
      </tr>
    `;
  }).join("") || '<tr><td colspan="10">No loans found.</td></tr>';
}

function renderPaymentHistory() {
  const loanMap = new Map(state.loans.map((loan) => [loan.loan_id, loan]));
  $("paymentsHistoryBody").innerHTML = state.payments.map((payment) => {
    const loan = loanMap.get(payment.loan_id);
    const currency = loan?.currency || "MVR";
    const label = loan ? `${loan.lender_name} → ${loan.borrower_name}` : "Unknown loan";
    return `
      <tr>
        <td>${esc(formatDate(payment.payment_date))}</td>
        <td>${esc(label)}</td>
        <td><strong>${money(payment.amount, currency)}</strong></td>
        <td>${esc(payment.payment_method || "—")}</td>
        <td>${esc(payment.notes || "—")}</td>
      </tr>
    `;
  }).join("") || '<tr><td colspan="5">No repayments recorded yet.</td></tr>';
}

function renderTransactionHistory() {
  const accountMap = new Map(state.accounts.map((account) => [account.id, account]));
  $("transactionsHistoryBody").innerHTML = state.transactions.map((transaction) => {
    const account = accountMap.get(transaction.account_id);
    const currency = account?.currency || "MVR";
    const positive = ["deposit", "adjustment_in"].includes(transaction.transaction_type);
    return `
      <tr>
        <td>${esc(formatDate(transaction.transaction_date))}</td>
        <td>${esc(account?.account_name || "Unknown account")}</td>
        <td>${esc(transaction.transaction_type.replaceAll("_", " "))}</td>
        <td class="${positive ? "positive" : "negative"}">${positive ? "+" : "−"}${money(transaction.amount, currency)}</td>
        <td>${esc(transaction.description || "—")}</td>
      </tr>
    `;
  }).join("") || '<tr><td colspan="5">No fund transactions recorded yet.</td></tr>';
}

function fillSelect(select, items, placeholder, valueKey, labelBuilder) {
  const current = select.value;
  select.innerHTML = `<option value="">${esc(placeholder)}</option>` + items.map((item) => (
    `<option value="${esc(item[valueKey])}">${esc(labelBuilder(item))}</option>`
  )).join("");
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function populateControls() {
  const peopleSorted = [...state.people].sort((a, b) => a.name.localeCompare(b.name));
  fillSelect($("loanLender"), peopleSorted, "Choose lender", "id", (person) => `${person.name} — ${person.relationship || "Person"}`);
  fillSelect($("loanBorrower"), peopleSorted, "Choose borrower", "id", (person) => `${person.name} — ${person.relationship || "Person"}`);

  const loanAccount = $("loanAccount");
  const oldAccount = loanAccount.value;
  loanAccount.innerHTML = '<option value="">None / personal liability</option>' + state.accounts.map((account) => (
    `<option value="${esc(account.id)}">${esc(account.account_name)} — ${esc(account.currency)}</option>`
  )).join("");
  if ([...loanAccount.options].some((option) => option.value === oldAccount)) loanAccount.value = oldAccount;

  const activeLoans = state.loans.filter((loan) => loan.calculated_status !== "cancelled");
  fillSelect($("scheduleLoan"), activeLoans, "Choose loan", "loan_id", loanLabel);
  fillSelect($("paymentLoan"), activeLoans.filter((loan) => Number(loan.remaining_amount) > 0), "Choose loan", "loan_id", loanLabel);
  fillSelect($("transactionAccount"), state.accounts, "Choose account", "id", (account) => `${account.account_name} — ${account.currency}`);
}

function renderAll() {
  renderSummary();
  renderAccounts();
  renderGroupedLoans();
  renderIndividualLoans();
  renderPaymentHistory();
  renderTransactionHistory();
  populateControls();
}

async function loadAll() {
  showMessage("");
  $("refreshButton").disabled = true;
  $("refreshButton").textContent = "Loading…";

  try {
    const [peopleResult, accountsResult, balancesResult, loansResult, paymentsResult, transactionsResult, positionsResult] = await Promise.all([
      supabaseClient.from("people").select("*").order("name"),
      supabaseClient.from("accounts").select("*").order("account_name"),
      supabaseClient.from("account_balances").select("*").order("account_name"),
      supabaseClient.from("loan_balances").select("*").order("created_at", { ascending: false }),
      supabaseClient.from("loan_payments").select("*").order("payment_date", { ascending: false }),
      supabaseClient.from("account_transactions").select("*").order("transaction_date", { ascending: false }),
      supabaseClient.from("personal_money_position").select("*")
    ]);

    const error = peopleResult.error || accountsResult.error || balancesResult.error || loansResult.error || paymentsResult.error || transactionsResult.error || positionsResult.error;
    if (error) throw error;

    state.people = peopleResult.data || [];
    state.accounts = accountsResult.data || [];
    state.accountBalances = balancesResult.data || [];
    state.loans = loansResult.data || [];
    state.payments = paymentsResult.data || [];
    state.transactions = transactionsResult.data || [];
    state.positions = positionsResult.data || [];

    renderAll();
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Could not load app data.", "error");
  } finally {
    $("refreshButton").disabled = false;
    $("refreshButton").textContent = "Refresh";
  }
}

async function runForm(button, action, successMessage) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Saving…";
  showMessage("");
  try {
    await action();
    showMessage(successMessage);
    await loadAll();
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Could not save the record.", "error");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchPage(tab.dataset.page));
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginButton.disabled = true;
  loginButton.textContent = "Signing in…";
  showLoginMessage("");

  const { error } = await supabaseClient.auth.signInWithPassword({
    email: $("email").value.trim(),
    password: $("password").value
  });

  if (error) showLoginMessage(error.message);
  else loginForm.reset();

  loginButton.disabled = false;
  loginButton.textContent = "Sign in";
});

$("loanForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;

  await runForm(button, async () => {
    const lenderId = $("loanLender").value;
    const borrowerId = $("loanBorrower").value;
    if (lenderId === borrowerId) throw new Error("Lender and borrower must be different people.");

    const { error } = await supabaseClient.from("loans").insert({
      lender_id: lenderId,
      borrower_id: borrowerId,
      source_account_id: nullableText($("loanAccount").value),
      principal_amount: Number($("loanAmount").value),
      currency: $("loanCurrency").value,
      loan_date: nullableText($("loanDate").value),
      date_is_estimated: $("loanDateEstimated").checked,
      installment_amount: nullableNumber($("installmentAmount").value),
      installment_frequency: nullableText($("installmentFrequency").value),
      next_payment_date: nullableText($("loanNextDate").value),
      status: "active",
      notes: nullableText($("loanNotes").value.trim())
    });
    if (error) throw error;
    event.target.reset();
    $("loanCurrency").value = "MVR";
  }, "Loan saved successfully.");
});

$("scheduleLoan").addEventListener("change", () => {
  const loan = getLoan($("scheduleLoan").value);
  $("scheduleAmount").value = loan?.installment_amount ?? "";
  $("scheduleFrequency").value = loan?.installment_frequency ?? "";
  $("scheduleNextDate").value = loan?.next_payment_date ?? "";
  $("scheduleStatus").value = loan?.calculated_status === "cancelled" ? "cancelled" : "active";
});

$("scheduleForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  const loanId = $("scheduleLoan").value;

  await runForm(button, async () => {
    const { error } = await supabaseClient.from("loans").update({
      installment_amount: nullableNumber($("scheduleAmount").value),
      installment_frequency: nullableText($("scheduleFrequency").value),
      next_payment_date: nullableText($("scheduleNextDate").value),
      status: $("scheduleStatus").value
    }).eq("id", loanId);
    if (error) throw error;
  }, "Installment schedule updated.");
});

$("individualLoansBody").addEventListener("click", (event) => {
  const button = event.target.closest(".edit-schedule");
  if (!button) return;
  $("scheduleLoan").value = button.dataset.loanId;
  $("scheduleLoan").dispatchEvent(new Event("change"));
  switchPage("loansPage");
  $("scheduleForm").scrollIntoView({ behavior: "smooth", block: "start" });
});

$("paymentLoan").addEventListener("change", () => {
  const loan = getLoan($("paymentLoan").value);
  if (!loan) {
    $("paymentLoanHelp").textContent = "";
    return;
  }
  $("paymentLoanHelp").textContent = `${money(loan.remaining_amount, loan.currency)} remaining · Current due date: ${formatDate(loan.next_payment_date)}`;
  $("paymentAmount").value = loan.installment_amount || "";
  $("paymentNextDate").value = calculateSuggestedNextDate(loan);
});

$("paymentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  const loanId = $("paymentLoan").value;
  const loan = getLoan(loanId);
  const amount = Number($("paymentAmount").value);

  await runForm(button, async () => {
    if (!loan) throw new Error("Choose a valid loan.");
    if (amount > Number(loan.remaining_amount)) {
      throw new Error(`Payment cannot exceed the remaining ${money(loan.remaining_amount, loan.currency)}.`);
    }

    const { error: paymentError } = await supabaseClient.from("loan_payments").insert({
      loan_id: loanId,
      payment_date: $("paymentDate").value,
      amount,
      payment_method: nullableText($("paymentMethod").value.trim()),
      notes: nullableText($("paymentNotes").value.trim())
    });
    if (paymentError) throw paymentError;

    const nextDate = nullableText($("paymentNextDate").value);
    if (nextDate) {
      const { error: updateError } = await supabaseClient.from("loans").update({
        next_payment_date: nextDate
      }).eq("id", loanId);
      if (updateError) throw updateError;
    }

    event.target.reset();
    $("paymentDate").value = todayIso();
    $("paymentLoanHelp").textContent = "";
  }, "Payment recorded. Balances have been recalculated.");
});

$("transactionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;

  await runForm(button, async () => {
    const { error } = await supabaseClient.from("account_transactions").insert({
      account_id: $("transactionAccount").value,
      transaction_date: $("transactionDate").value,
      transaction_type: $("transactionType").value,
      amount: Number($("transactionAmount").value),
      description: nullableText($("transactionDescription").value.trim())
    });
    if (error) throw error;
    event.target.reset();
    $("transactionDate").value = todayIso();
  }, "Fund transaction saved. Account balances have been updated.");
});

$("logoutButton").addEventListener("click", () => supabaseClient.auth.signOut());
$("refreshButton").addEventListener("click", loadAll);

supabaseClient.auth.onAuthStateChange((_event, session) => {
  setView(session);
  if (session) void loadAll();
});

(async () => {
  $("paymentDate").value = todayIso();
  $("transactionDate").value = todayIso();
  $("loanDate").value = todayIso();

  if (SUPABASE_URL.includes("YOUR_PROJECT_REF") || SUPABASE_PUBLISHABLE_KEY === "YOUR_PUBLISHABLE_KEY") {
    showLoginMessage("Open config.js and add your Supabase URL and publishable key.");
    return;
  }

  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error) {
    showLoginMessage(error.message);
    return;
  }
  setView(session);
  if (session) await loadAll();
})();
