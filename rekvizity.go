// Package rekvizity проверяет российские реквизиты: ИНН, ОГРН и ОГРНИП,
// КПП, СНИЛС, БИК, расчётный и корреспондентский счёт, номер карты.
//
// Проверка не ограничивается «верно / неверно»: Result объясняет, что не
// так, и рассказывает, что можно понять из самого номера — регион по ИНН,
// год записи по ОГРН, валюту счёта, платёжную систему карты.
//
// Та же логика есть на TypeScript (каталог js/), обе реализации проходят
// общий набор примеров testdata/cases.json.
package rekvizity

import (
	"strings"
	"unicode"
)

// Kind — вид реквизита.
type Kind string

const (
	KindINN     Kind = "inn"
	KindOGRN    Kind = "ogrn"
	KindKPP     Kind = "kpp"
	KindSNILS   Kind = "snils"
	KindBIK     Kind = "bik"
	KindAccount Kind = "account"
	KindCard    Kind = "card"
)

// Коды ошибок — для кода, который реагирует на причину. Текст для человека
// лежит в Result.Message.
const (
	CodeEmpty       = "empty"
	CodeChars       = "chars"
	CodeLength      = "length"
	CodeFormat      = "format"
	CodeChecksum    = "checksum"
	CodeBIKRequired = "bik_required"
	CodeBIK         = "bik"
)

// Fact — что удалось узнать из номера: «Регион — Москва».
type Fact struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

type Result struct {
	Kind    Kind   `json:"kind"`
	Value   string `json:"value"` // номер без пробелов и дефисов
	Valid   bool   `json:"valid"`
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
	Facts   []Fact `json:"facts,omitempty"`
}

// Fact возвращает значение факта по названию.
func (r Result) Fact(label string) string {
	for _, f := range r.Facts {
		if f.Label == label {
			return f.Value
		}
	}
	return ""
}

func fail(kind Kind, value, code, msg string) Result {
	return Result{Kind: kind, Value: value, Code: code, Message: msg}
}

func ok(kind Kind, value string, facts ...Fact) Result {
	return Result{Kind: kind, Value: value, Valid: true, Facts: facts}
}

// clean убирает пробелы, дефисы и точки: реквизиты часто копируют
// с разбивкой «112-233-445 95» или «4111 1111 1111 1111».
func clean(s string) string {
	return strings.Map(func(r rune) rune {
		switch r {
		case ' ', '-', '.', '\t', '\u00a0':
			return -1
		}
		return r
	}, strings.TrimSpace(s))
}

func onlyDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// digitsCheck — общая проверка «не пусто, только цифры, нужной длины».
func digitsCheck(kind Kind, raw, name string, lengths ...int) (string, *Result) {
	v := clean(raw)
	if v == "" {
		r := fail(kind, v, CodeEmpty, "пусто")
		return v, &r
	}
	if !onlyDigits(v) {
		r := fail(kind, v, CodeChars, name+" состоит только из цифр")
		return v, &r
	}
	for _, n := range lengths {
		if len(v) == n {
			return v, nil
		}
	}
	r := fail(kind, v, CodeLength, name+": "+lengthText(lengths)+", а здесь "+itoa(len(v)))
	return v, &r
}

func lengthText(lengths []int) string {
	parts := make([]string, len(lengths))
	for i, n := range lengths {
		parts[i] = itoa(n)
	}
	return strings.Join(parts, " или ") + " " + digitsWord(lengths[len(lengths)-1])
}

func digitsWord(n int) string {
	switch {
	case n%10 == 1 && n%100 != 11:
		return "цифра"
	case n%10 >= 2 && n%10 <= 4 && (n%100 < 12 || n%100 > 14):
		return "цифры"
	}
	return "цифр"
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

// weighted — сумма произведений цифр на веса.
func weighted(digits string, weights []int) int {
	sum := 0
	for i, w := range weights {
		sum += int(digits[i]-'0') * w
	}
	return sum
}

// Detect угадывает по виду номера, чем он может быть, и сразу проверяет.
// Девять цифр, начинающихся с 04, — это и БИК, и формально КПП; такие
// номера возвращаются в обоих вариантах, первым более вероятный.
func Detect(raw string) []Result {
	v := strings.ToUpper(clean(raw))
	if v == "" {
		return nil
	}
	if !onlyDigits(v) {
		if len(v) == 9 && isKPPShape(v) {
			return []Result{KPP(v)}
		}
		return nil
	}
	switch len(v) {
	case 9:
		if strings.HasPrefix(v, "04") {
			return []Result{BIK(v), KPP(v)}
		}
		return []Result{KPP(v)}
	case 10, 12:
		return []Result{INN(v)}
	case 11:
		return []Result{SNILS(v)}
	case 13, 15:
		return []Result{OGRN(v)}
	case 16, 18, 19:
		return []Result{Card(v)}
	case 20:
		return []Result{Account(v, "")}
	}
	return nil
}

func isKPPShape(v string) bool {
	if len(v) != 9 {
		return false
	}
	for i, r := range v {
		switch {
		case i >= 4 && i <= 5 && (unicode.IsDigit(r) || (r >= 'A' && r <= 'Z')):
		case r >= '0' && r <= '9':
		default:
			return false
		}
	}
	return true
}
