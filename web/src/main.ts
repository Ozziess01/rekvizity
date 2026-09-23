import "./style.css";
import { check, clean, detect, kindTitle, type Kind, type Result } from "../../js/src/index.ts";

type Mode = "auto" | Kind;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const input = $<HTMLInputElement>("input");
const bikInput = $<HTMLInputElement>("bik");
const bikRow = $("bikrow");
const results = $("results");
const bulk = $<HTMLTextAreaElement>("bulk");
const table = $<HTMLTableElement>("table");
const summary = $("summary");
const onlyBad = $<HTMLInputElement>("only-bad");
const csvButton = $<HTMLButtonElement>("csv");

let mode: Mode = "auto";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- выбор вида ----------

const modes: [Mode, string][] = [
  ["auto", "Определить"],
  ...(Object.entries(kindTitle) as [Kind, string][]),
];

const kindsEl = $("kinds");
kindsEl.innerHTML = modes
  .map(([m, t]) => `<button role="radio" data-mode="${m}" aria-checked="${m === mode}">${t}</button>`)
  .join("");
kindsEl.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-mode]");
  if (b) setMode(b.dataset.mode as Mode);
});

function setMode(m: Mode) {
  mode = m;
  for (const b of kindsEl.querySelectorAll("button")) b.setAttribute("aria-checked", String(b.dataset.mode === m));
  renderOne();
  renderList();
}

// ---------- вкладки ----------

const tabs = [$("tab-one"), $("tab-list")];
for (const tab of tabs) {
  tab.addEventListener("click", () => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      $(t.getAttribute("aria-controls")!).hidden = !on;
    }
    (tab.id === "tab-one" ? input : bulk).focus();
  });
}

// ---------- один номер ----------

const examples: { label: string; value: string; bik?: string }[] = [
  { label: "ИНН организации", value: "7707083893" },
  { label: "ОГРН", value: "1027700132195" },
  { label: "КПП", value: "773601001" },
  { label: "СНИЛС", value: "112-233-445 95" },
  { label: "Счёт и БИК", value: "40702810938000012345", bik: "044525225" },
  { label: "Карта", value: "4111 1111 1111 1111" },
  { label: "ИНН с опечаткой", value: "7707083894" },
];

const examplesEl = $("examples");
examplesEl.innerHTML =
  `<span class="muted">Примеры:</span>` +
  examples.map((x, i) => `<button class="chip" data-i="${i}">${esc(x.label)}</button>`).join("");
examplesEl.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-i]");
  if (!b) return;
  const x = examples[Number(b.dataset.i)];
  input.value = x.value;
  bikInput.value = x.bik ?? "";
  setMode("auto");
  input.focus();
});

input.addEventListener("input", renderOne);
bikInput.addEventListener("input", renderOne);

function oneResults(): Result[] {
  const raw = input.value;
  if (clean(raw) === "") return [];
  if (mode !== "auto") return [check(mode, raw, bikInput.value)];
  return detect(raw).map((r) => (r.kind === "account" ? check("account", raw, bikInput.value) : r));
}

function renderOne() {
  const raw = input.value;
  const list = oneResults();
  const isAccount = mode === "account" || list[0]?.kind === "account";
  bikRow.hidden = !isAccount;

  if (clean(raw) === "") {
    results.innerHTML = "";
    return;
  }
  if (list.length === 0) {
    const v = clean(raw);
    results.innerHTML = `<article class="card unknown">
      <header><span class="status">Не похоже ни на один реквизит</span></header>
      <p class="msg">${/^\d+$/.test(v) ? `${v.length} ${digits(v.length)}` : "В номере есть буквы или знаки"}. ИНН — 10 или 12 цифр,
      ОГРН — 13 или 15, СНИЛС — 11, БИК и КПП — 9, счёт — 20, карта — от 13 до 19.
      Если знаете, что это, выберите вид выше: подскажу, что не так.</p>
    </article>`;
    return;
  }
  results.innerHTML = list.map((r, i) => card(r, i > 0)).join("");
}

function digits(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return "цифра";
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) return "цифры";
  return "цифр";
}

function state(r: Result): "ok" | "bad" | "wait" {
  if (r.valid) return "ok";
  return r.code === "bik_required" ? "wait" : "bad";
}

const statusText = { ok: "Номер верный", bad: "Ошибка", wait: "Нужен БИК" };
const rowStatus = { ok: "верный", bad: "ошибка", wait: "нужен БИК" };

function card(r: Result, alt: boolean): string {
  const s = state(r);
  const facts = r.facts
    .map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`)
    .join("");
  return `<article class="card ${s}${alt ? " alt" : ""}">
    ${alt ? `<p class="alt-note">Эти же 9 цифр подходят и под формат ${kindTitle[r.kind]}:</p>` : ""}
    <header>
      <span class="kind">${kindTitle[r.kind]}</span>
      <span class="status">${s === "ok" ? icon.ok : s === "bad" ? icon.bad : icon.wait}${statusText[s]}</span>
    </header>
    ${anatomy(r)}
    ${r.message ? `<p class="msg">${esc(cap(r.message))}</p>` : ""}
    ${facts ? `<dl class="facts">${facts}</dl>` : ""}
  </article>`;
}

const icon = {
  ok: `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  bad: `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M6 6l8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  wait: `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 6.5V10l2.5 1.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
};

// Из чего состоит номер: длины частей и подписи. Контрольные части
// подсвечиваются отдельно.
type Part = [len: number, caption: string, control?: boolean];

function parts(r: Result): Part[] | null {
  const n = r.value.length;
  switch (r.kind) {
    case "inn":
      return n === 10
        ? [[2, "регион"], [2, "налоговая"], [5, "номер записи"], [1, "контрольная", true]]
        : [[2, "регион"], [2, "налоговая"], [6, "номер записи"], [2, "контрольные", true]];
    case "ogrn":
      return n === 13
        ? [[1, "вид записи"], [2, "год"], [2, "регион"], [2, "налоговая"], [5, "номер записи"], [1, "контрольная", true]]
        : [[1, "вид записи"], [2, "год"], [2, "регион"], [9, "номер записи"], [1, "контрольная", true]];
    case "kpp":
      return [[4, "налоговая"], [2, "причина"], [3, "номер"]];
    case "snils":
      return [[9, "номер"], [2, "контрольное число", true]];
    case "bik":
      return [[2, "страна"], [2, "территория"], [2, "подразделение ЦБ"], [3, "банк"]];
    case "account":
      return [[5, "балансовый счёт"], [3, "валюта"], [1, "контрольная", true], [4, "отделение"], [7, "номер счёта"]];
    case "card":
      return [[6, "банк и платёжная система"], [n - 7, "номер карты"], [1, "контрольная", true]];
  }
}

function anatomy(r: Result): string {
  // Раскладываем только номера нужной длины и формы: иначе подписи врут.
  if (r.code === "empty" || r.code === "chars" || r.code === "length" || r.code === "format") return "";
  const ps = parts(r);
  if (!ps) return "";
  let pos = 0;
  const bad = r.code === "checksum";
  const cells = ps.map(([len, caption, control]) => {
    const text = r.value.slice(pos, pos + len);
    pos += len;
    const cls = control ? (bad ? "part control bad" : "part control") : "part";
    return `<span class="${cls}"><b>${esc(text)}</b><i>${caption}</i></span>`;
  });
  return `<div class="anatomy" aria-label="Из чего состоит номер">${cells.join("")}</div>`;
}

// ---------- список ----------

const sample = [
  "7707083893",
  "7707083894",
  "1027700132195",
  "304500116000157",
  "773601001",
  "112-233-445 95",
  "112-233-445 96",
  "044525225",
  "40702810938000012345; 044525225",
  "40702810938000012345; 044525974",
  "4111 1111 1111 1111",
  "2200 7012 3456 7896",
  "77070838",
].join("\n");

$("sample").addEventListener("click", () => {
  bulk.value = sample;
  renderList();
});

interface Row {
  input: string;
  bik: string;
  result: Result | null;
}

function parseLine(line: string): { input: string; bik: string } {
  const parts = line.split(/[;,\t]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { input: parts[0], bik: parts[1] };
  // «40702810938000012345 044525225» — счёт и БИК через пробел.
  const c = clean(line);
  if (/^\d{20}04\d{7}$/.test(c)) return { input: c.slice(0, 20), bik: c.slice(20) };
  return { input: line.trim(), bik: "" };
}

function checkRow(input: string, bik: string): Result | null {
  if (mode !== "auto") return check(mode, input, bik);
  if (clean(input).length === 20) return check("account", input, bik);
  return detect(input)[0] ?? null;
}

let rows: Row[] = [];

bulk.addEventListener("input", renderList);
onlyBad.addEventListener("change", renderList);

function renderList() {
  rows = bulk.value
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const { input, bik } = parseLine(l);
      return { input, bik, result: checkRow(input, bik) };
    });

  csvButton.disabled = rows.length === 0;
  if (rows.length === 0) {
    summary.textContent = "";
    table.hidden = true;
    return;
  }
  const good = rows.filter((r) => r.result?.valid).length;
  summary.innerHTML = `Строк: <b>${rows.length}</b> · верных <b class="t-ok">${good}</b> · с ошибками <b class="t-bad">${rows.length - good}</b>`;

  const shown = rows.map((r, i) => [r, i] as const).filter(([r]) => !onlyBad.checked || !r.result?.valid);
  table.hidden = false;
  table.innerHTML =
    `<thead><tr><th>№</th><th>Номер</th><th>Вид</th><th>Итог</th><th>Подробности</th></tr></thead><tbody>` +
    shown
      .slice(0, 5000)
      .map(([r, i]) => {
        const s = r.result ? state(r.result) : "bad";
        return `<tr class="${s}">
          <td class="n">${i + 1}</td>
          <td class="mono">${esc(r.input)}${r.bik ? `<br><span class="muted">БИК ${esc(r.bik)}</span>` : ""}</td>
          <td>${r.result ? kindTitle[r.result.kind] : "—"}</td>
          <td class="st">${r.result ? rowStatus[s] : "не распознан"}</td>
          <td>${esc(details(r))}</td>
        </tr>`;
      })
      .join("") +
    `</tbody>`;
}

function details(r: Row): string {
  if (!r.result) return "длина и формат не подходят ни под один реквизит";
  if (!r.result.valid) return cap(r.result.message ?? "");
  return r.result.facts.map((f) => `${f.label}: ${f.value}`).join(" · ");
}

csvButton.addEventListener("click", () => {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [["номер", "бик", "вид", "итог", "подробности"].join(";")];
  for (const r of rows) {
    const s = r.result ? rowStatus[state(r.result)] : "не распознан";
    lines.push([r.input, r.bik, r.result ? kindTitle[r.result.kind] : "", s, details(r)].map(q).join(";"));
  }
  // BOM — чтобы Excel открыл кириллицу без вопросов.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "rekvizity.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

renderOne();
input.focus();
