// Проверка российских реквизитов: ИНН, ОГРН и ОГРНИП, КПП, СНИЛС, БИК,
// расчётный и корреспондентский счёт, номер карты.
//
// Зеркало Go-пакета из корня репозитория: обе реализации проходят общий
// набор примеров testdata/cases.json и отвечают одинаковыми словами.

import { region } from "./regions.ts";

export { region };

export type Kind = "inn" | "ogrn" | "kpp" | "snils" | "bik" | "account" | "card";

export type Code = "empty" | "chars" | "length" | "format" | "checksum" | "bik_required" | "bik";

/** Что удалось узнать из номера: «Регион — Москва». */
export interface Fact {
  label: string;
  value: string;
}

export interface Result {
  kind: Kind;
  /** Номер без пробелов и дефисов. */
  value: string;
  valid: boolean;
  code?: Code;
  /** Что не так — по-русски, для человека. */
  message?: string;
  facts: Fact[];
}

/** Значение факта по названию или пустая строка. */
export function fact(r: Result, label: string): string {
  return r.facts.find((f) => f.label === label)?.value ?? "";
}

const fail = (kind: Kind, value: string, code: Code, message: string): Result => ({
  kind,
  value,
  valid: false,
  code,
  message,
  facts: [],
});

const ok = (kind: Kind, value: string, facts: Fact[]): Result => ({ kind, value, valid: true, facts });

/** Убирает пробелы, дефисы и точки: «112-233-445 95» → «11223344595». */
export const clean = (s: string): string => s.trim().replace(/[\s\-. ]/g, "");

const onlyDigits = (s: string) => /^\d+$/.test(s);

function digitsWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "цифра";
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) return "цифры";
  return "цифр";
}

/** Общая проверка «не пусто, только цифры, нужной длины». */
function digitsCheck(kind: Kind, raw: string, name: string, lengths: number[]): [string, Result | null] {
  const v = clean(raw);
  if (v === "") return [v, fail(kind, v, "empty", "пусто")];
  if (!onlyDigits(v)) return [v, fail(kind, v, "chars", `${name} состоит только из цифр`)];
  if (lengths.includes(v.length)) return [v, null];
  const want = `${lengths.join(" или ")} ${digitsWord(lengths[lengths.length - 1])}`;
  return [v, fail(kind, v, "length", `${name}: ${want}, а здесь ${v.length}`)];
}

/** Сумма произведений цифр на веса. */
function weighted(digits: string, weights: number[]): number {
  let sum = 0;
  weights.forEach((w, i) => (sum += Number(digits[i]) * w));
  return sum;
}

/**
 * ИНН организации (10 цифр) или человека и ИП (12 цифр). Контрольные
 * цифры — остаток от деления взвешенной суммы на 11, взятый по модулю 10.
 */
export function inn(raw: string): Result {
  const [v, bad] = digitsCheck("inn", raw, "ИНН", [10, 12]);
  if (bad) return bad;
  if (v.startsWith("00")) {
    return fail("inn", v, "format", "ИНН не начинается с 00: первые две цифры — код региона");
  }
  let type: string;
  if (v.length === 10) {
    type = "организация";
    if ((weighted(v, [2, 4, 10, 3, 5, 9, 4, 6, 8]) % 11) % 10 !== Number(v[9])) {
      return fail("inn", v, "checksum", "не сходится контрольная цифра: в номере опечатка");
    }
  } else {
    type = "человек или ИП";
    const d11 = (weighted(v, [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) % 11) % 10;
    const d12 = (weighted(v, [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) % 11) % 10;
    if (d11 !== Number(v[10]) || d12 !== Number(v[11])) {
      return fail("inn", v, "checksum", "не сходятся контрольные цифры: в номере опечатка");
    }
  }
  const facts: Fact[] = [{ label: "Тип", value: type }];
  const r = region(v.slice(0, 2));
  if (r) facts.push({ label: "Регион", value: r });
  facts.push({ label: "Налоговая, выдавшая ИНН", value: `код ${v.slice(0, 4)}` });
  return ok("inn", v, facts);
}

/**
 * ОГРН организации (13 цифр) или ОГРНИП (15 цифр). Контрольная цифра —
 * остаток от деления числа без неё на 11 (у ОГРНИП — на 13) по модулю 10.
 * Четырнадцать цифр без контрольной ещё точно помещаются в Number.
 */
export function ogrn(raw: string): Result {
  const [v, bad] = digitsCheck("ogrn", raw, "ОГРН", [13, 15]);
  if (bad) return bad;
  let type: string;
  let mod: number;
  if (v.length === 13 && (v[0] === "1" || v[0] === "5")) [type, mod] = ["организация", 11];
  else if (v.length === 13 && "26789".includes(v[0])) [type, mod] = ["запись об изменениях (ГРН)", 11];
  else if (v.length === 15 && v[0] === "3") [type, mod] = ["ИП", 13];
  else if (v.length === 15 && v[0] === "4") [type, mod] = ["запись об изменениях ИП (ГРНИП)", 13];
  else return fail("ogrn", v, "format", "первая цифра ОГРН — 1 или 5 у организации, 3 у ИП");

  if ((Number(v.slice(0, -1)) % mod) % 10 !== Number(v[v.length - 1])) {
    return fail("ogrn", v, "checksum", "не сходится контрольная цифра: в номере опечатка");
  }
  const facts: Fact[] = [
    { label: "Тип", value: type },
    { label: "Год записи", value: century(v.slice(1, 3)) },
  ];
  const r = region(v.slice(3, 5));
  if (r) facts.push({ label: "Регион", value: r });
  return ok("ogrn", v, facts);
}

/** Две цифры года → 2002 или 1998. */
function century(yy: string): string {
  const y = Number(yy);
  return String(y > new Date().getFullYear() % 100 ? 1900 + y : 2000 + y);
}

const kppShape = /^\d{4}[\dA-Z]{2}\d{3}$/;

/**
 * КПП: 4 цифры кода налоговой, 2 символа причины (цифры или, с 2019 года,
 * латинские буквы) и 3 цифры номера. Контрольной цифры нет.
 */
export function kpp(raw: string): Result {
  const v = clean(raw).toUpperCase();
  if (v === "") return fail("kpp", v, "empty", "пусто");
  if (v.length !== 9) return fail("kpp", v, "length", `КПП: 9 символов, а здесь ${v.length}`);
  if (!kppShape.test(v)) {
    return fail("kpp", v, "format", "КПП: 4 цифры, 2 цифры или латинские буквы, 3 цифры");
  }
  const facts: Fact[] = [{ label: "Налоговая", value: `код ${v.slice(0, 4)}` }];
  const r = region(v.slice(0, 2));
  if (r) facts.push({ label: "Регион", value: r });
  const reason = v.slice(4, 6);
  facts.push({ label: "Причина", value: reason === "01" ? "место нахождения организации" : `код ${reason}` });
  return ok("kpp", v, facts);
}

/**
 * СНИЛС: 11 цифр, две последние контрольные. Сумма цифр, умноженных на
 * 9…1: меньше 100 — это и есть контрольное число, 100 и 101 дают 00,
 * больше — остаток от деления на 101 (и снова 100 → 00).
 */
export function snils(raw: string): Result {
  const [v, bad] = digitsCheck("snils", raw, "СНИЛС", [11]);
  if (bad) return bad;
  const sum = weighted(v, [9, 8, 7, 6, 5, 4, 3, 2, 1]);
  let check = sum < 100 ? sum : sum <= 101 ? 0 : sum % 101;
  if (check === 100) check = 0;
  // Номера до 001-001-998 выдавались без проверки контрольного числа.
  if (Number(v.slice(0, 9)) > 1001998 && check !== Number(v.slice(9))) {
    return fail("snils", v, "checksum", "не сходится контрольное число: в номере опечатка");
  }
  return ok("snils", v, [
    { label: "Номер", value: `${v.slice(0, 3)}-${v.slice(3, 6)}-${v.slice(6, 9)} ${v.slice(9)}` },
  ]);
}

/** БИК: 9 цифр, у российских банков начинается с 04. Контрольной цифры нет. */
export function bik(raw: string): Result {
  const [v, bad] = digitsCheck("bik", raw, "БИК", [9]);
  if (bad) return bad;
  if (!v.startsWith("04")) return fail("bik", v, "format", "БИК российского банка начинается с 04");
  return ok("bik", v, [
    { label: "Страна", value: "Россия" },
    { label: "Код территории (ОКАТО)", value: v.slice(2, 4) },
    { label: "Номер банка", value: v.slice(6, 9) },
  ]);
}

const accountKinds: Record<string, string> = {
  "30101": "корреспондентский счёт банка",
  "40702": "счёт организации",
  "40703": "счёт некоммерческой организации",
  "40802": "счёт ИП",
  "40817": "счёт физического лица",
};

const currencies: Record<string, string> = {
  "810": "российский рубль",
  "643": "российский рубль",
  "840": "доллар США",
  "978": "евро",
  "156": "китайский юань",
};

/**
 * Расчётный или корреспондентский счёт. Проверяется только вместе с БИК:
 * контрольная цифра считается по трём последним цифрам БИК и 20 цифрам
 * счёта с весами 7, 1, 3. Для корсчёта вместо хвоста БИК берётся «0»
 * и две цифры из его середины.
 */
export function account(raw: string, bikRaw = ""): Result {
  const [v, bad] = digitsCheck("account", raw, "Счёт", [20]);
  if (bad) return bad;
  const b = clean(bikRaw);
  if (b === "") {
    return fail("account", v, "bik_required", "контрольная цифра счёта считается вместе с БИК банка — укажите его");
  }
  const bikResult = bik(b);
  if (!bikResult.valid) return fail("account", v, "bik", `неверный БИК: ${bikResult.message}`);
  const key = v.startsWith("30101") ? "0" + b.slice(4, 6) : b.slice(6, 9);
  const weights = Array.from({ length: 23 }, (_, i) => [7, 1, 3][i % 3]);
  if (weighted(key + v, weights) % 10 !== 0) {
    return fail("account", v, "checksum", "не сходится контрольная цифра: опечатка в счёте или счёт из другого банка");
  }
  const facts: Fact[] = [];
  const kind = accountKinds[v.slice(0, 5)];
  if (kind) facts.push({ label: "Вид", value: kind });
  const cur = v.slice(5, 8);
  facts.push({ label: "Валюта", value: currencies[cur] ?? `код ${cur}` });
  return ok("account", v, facts);
}

/** Номер карты: 13–19 цифр, последняя проверяется алгоритмом Луна. */
export function card(raw: string): Result {
  const [v, bad] = digitsCheck("card", raw, "Номер карты", [13, 14, 15, 16, 17, 18, 19]);
  if (bad) {
    if (bad.code === "length") bad.message = `номер карты: от 13 до 19 цифр, а здесь ${v.length}`;
    return bad;
  }
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    let d = Number(v[v.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  if (sum % 10 !== 0) {
    return fail("card", v, "checksum", "не сходится контрольная цифра (алгоритм Луна): в номере опечатка");
  }
  const ps = paymentSystem(v);
  return ok("card", v, ps ? [{ label: "Платёжная система", value: ps }] : []);
}

function paymentSystem(v: string): string {
  const p2 = Number(v.slice(0, 2));
  const p4 = Number(v.slice(0, 4));
  if (p4 >= 2200 && p4 <= 2204) return "Мир";
  if (v[0] === "4") return "Visa";
  if ((p2 >= 51 && p2 <= 55) || (p4 >= 2221 && p4 <= 2720)) return "Mastercard";
  if (p2 === 34 || p2 === 37) return "American Express";
  if (p4 >= 3528 && p4 <= 3589) return "JCB";
  if (p2 === 62) return "UnionPay";
  return "";
}

/** Проверка по виду реквизита — удобно, когда вид выбирает пользователь. */
export function check(kind: Kind, raw: string, bikRaw = ""): Result {
  switch (kind) {
    case "inn":
      return inn(raw);
    case "ogrn":
      return ogrn(raw);
    case "kpp":
      return kpp(raw);
    case "snils":
      return snils(raw);
    case "bik":
      return bik(raw);
    case "account":
      return account(raw, bikRaw);
    case "card":
      return card(raw);
  }
}

/**
 * Угадывает по виду номера, чем он может быть, и сразу проверяет. Девять
 * цифр, начинающихся с 04, — это и БИК, и формально КПП; такие номера
 * возвращаются в обоих вариантах, первым более вероятный.
 */
export function detect(raw: string): Result[] {
  const v = clean(raw).toUpperCase();
  if (v === "") return [];
  if (!onlyDigits(v)) return kppShape.test(v) ? [kpp(v)] : [];
  switch (v.length) {
    case 9:
      return v.startsWith("04") ? [bik(v), kpp(v)] : [kpp(v)];
    case 10:
    case 12:
      return [inn(v)];
    case 11:
      return [snils(v)];
    case 13:
    case 15:
      return [ogrn(v)];
    case 16:
    case 18:
    case 19:
      return [card(v)];
    case 20:
      return [account(v)];
  }
  return [];
}

/** Название вида по-русски — для интерфейсов. */
export const kindTitle: Record<Kind, string> = {
  inn: "ИНН",
  ogrn: "ОГРН",
  kpp: "КПП",
  snils: "СНИЛС",
  bik: "БИК",
  account: "Счёт",
  card: "Карта",
};
