package rekvizity

import (
	"strconv"
	"strings"
	"time"
)

// INN — ИНН организации (10 цифр) или человека и ИП (12 цифр).
// Контрольные цифры — остаток от деления взвешенной суммы на 11, взятый
// по модулю 10. У двенадцатизначного ИНН их две.
func INN(raw string) Result {
	v, bad := digitsCheck(KindINN, raw, "ИНН", 10, 12)
	if bad != nil {
		return *bad
	}
	if v[:2] == "00" {
		return fail(KindINN, v, CodeFormat, "ИНН не начинается с 00: первые две цифры — код региона")
	}
	var typ string
	if len(v) == 10 {
		typ = "организация"
		if weighted(v, []int{2, 4, 10, 3, 5, 9, 4, 6, 8})%11%10 != int(v[9]-'0') {
			return fail(KindINN, v, CodeChecksum, "не сходится контрольная цифра: в номере опечатка")
		}
	} else {
		typ = "человек или ИП"
		d11 := weighted(v, []int{7, 2, 4, 10, 3, 5, 9, 4, 6, 8}) % 11 % 10
		d12 := weighted(v, []int{3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8}) % 11 % 10
		if d11 != int(v[10]-'0') || d12 != int(v[11]-'0') {
			return fail(KindINN, v, CodeChecksum, "не сходятся контрольные цифры: в номере опечатка")
		}
	}
	facts := []Fact{{"Тип", typ}}
	if region := Region(v[:2]); region != "" {
		facts = append(facts, Fact{"Регион", region})
	}
	facts = append(facts, Fact{"Налоговая, выдавшая ИНН", "код " + v[:4]})
	return ok(KindINN, v, facts...)
}

// OGRN — ОГРН организации (13 цифр) или ОГРНИП (15 цифр). Контрольная
// цифра — остаток от деления числа без неё на 11 (у ОГРНИП — на 13),
// взятый по модулю 10.
func OGRN(raw string) Result {
	v, bad := digitsCheck(KindOGRN, raw, "ОГРН", 13, 15)
	if bad != nil {
		return *bad
	}
	var typ string
	var mod uint64
	switch {
	case len(v) == 13 && (v[0] == '1' || v[0] == '5'):
		typ, mod = "организация", 11
	case len(v) == 13 && strings.ContainsRune("26789", rune(v[0])):
		typ, mod = "запись об изменениях (ГРН)", 11
	case len(v) == 15 && v[0] == '3':
		typ, mod = "ИП", 13
	case len(v) == 15 && v[0] == '4':
		typ, mod = "запись об изменениях ИП (ГРНИП)", 13
	default:
		return fail(KindOGRN, v, CodeFormat, "первая цифра ОГРН — 1 или 5 у организации, 3 у ИП")
	}
	n, _ := strconv.ParseUint(v[:len(v)-1], 10, 64)
	if int(n%mod%10) != int(v[len(v)-1]-'0') {
		return fail(KindOGRN, v, CodeChecksum, "не сходится контрольная цифра: в номере опечатка")
	}
	facts := []Fact{{"Тип", typ}, {"Год записи", century(v[1:3])}}
	if region := Region(v[3:5]); region != "" {
		facts = append(facts, Fact{"Регион", region})
	}
	return ok(KindOGRN, v, facts...)
}

// century: две цифры года → 2002 или 1998. ОГРН выдают с 2002 года, но
// при переходе с прежних номеров встречаются и более ранние годы.
func century(yy string) string {
	y, _ := strconv.Atoi(yy)
	if y > time.Now().Year()%100 {
		return strconv.Itoa(1900 + y)
	}
	return strconv.Itoa(2000 + y)
}

// KPP — код причины постановки на учёт: 4 цифры кода налоговой, 2 символа
// причины (цифры или, с 2019 года, латинские буквы) и 3 цифры номера.
// Контрольной цифры у КПП нет, проверяется только формат.
func KPP(raw string) Result {
	v := strings.ToUpper(clean(raw))
	if v == "" {
		return fail(KindKPP, v, CodeEmpty, "пусто")
	}
	if len(v) != 9 {
		return fail(KindKPP, v, CodeLength, "КПП: 9 символов, а здесь "+itoa(len(v)))
	}
	if !isKPPShape(v) {
		return fail(KindKPP, v, CodeFormat, "КПП: 4 цифры, 2 цифры или латинские буквы, 3 цифры")
	}
	facts := []Fact{{"Налоговая", "код " + v[:4]}}
	if region := Region(v[:2]); region != "" {
		facts = append(facts, Fact{"Регион", region})
	}
	if v[4:6] == "01" {
		facts = append(facts, Fact{"Причина", "место нахождения организации"})
	} else {
		facts = append(facts, Fact{"Причина", "код " + v[4:6]})
	}
	return ok(KindKPP, v, facts...)
}

// SNILS — 11 цифр, две последние контрольные. Сумма цифр номера,
// умноженных на 9…1: меньше 100 — это и есть контрольное число, 100 и 101
// дают 00, больше — остаток от деления на 101 (и снова 100 → 00).
func SNILS(raw string) Result {
	v, bad := digitsCheck(KindSNILS, raw, "СНИЛС", 11)
	if bad != nil {
		return *bad
	}
	sum := weighted(v, []int{9, 8, 7, 6, 5, 4, 3, 2, 1})
	var check int
	switch {
	case sum < 100:
		check = sum
	case sum == 100 || sum == 101:
		check = 0
	default:
		check = sum % 101
		if check == 100 {
			check = 0
		}
	}
	// Номера до 001-001-998 выдавались без проверки контрольного числа.
	n, _ := strconv.Atoi(v[:9])
	got, _ := strconv.Atoi(v[9:])
	if n > 1001998 && check != got {
		return fail(KindSNILS, v, CodeChecksum, "не сходится контрольное число: в номере опечатка")
	}
	return ok(KindSNILS, v, Fact{"Номер", v[0:3] + "-" + v[3:6] + "-" + v[6:9] + " " + v[9:]})
}

// BIK — банковский идентификационный код: 9 цифр, у российских банков
// начинается с 04. Контрольной цифры нет.
func BIK(raw string) Result {
	v, bad := digitsCheck(KindBIK, raw, "БИК", 9)
	if bad != nil {
		return *bad
	}
	if !strings.HasPrefix(v, "04") {
		return fail(KindBIK, v, CodeFormat, "БИК российского банка начинается с 04")
	}
	return ok(KindBIK, v,
		Fact{"Страна", "Россия"},
		Fact{"Код территории (ОКАТО)", v[2:4]},
		Fact{"Номер банка", v[6:9]},
	)
}

// Account — расчётный или корреспондентский счёт. Проверяется только
// вместе с БИК: контрольная цифра считается по трём последним цифрам БИК
// и 20 цифрам счёта с весами 7, 1, 3. Для корреспондентского счёта вместо
// хвоста БИК берётся «0» и две цифры из его середины.
func Account(raw, bikRaw string) Result {
	v, bad := digitsCheck(KindAccount, raw, "Счёт", 20)
	if bad != nil {
		return *bad
	}
	bik := clean(bikRaw)
	if bik == "" {
		return fail(KindAccount, v, CodeBIKRequired, "контрольная цифра счёта считается вместе с БИК банка — укажите его")
	}
	if b := BIK(bik); !b.Valid {
		return fail(KindAccount, v, CodeBIK, "неверный БИК: "+b.Message)
	}
	key := bik[6:9]
	if strings.HasPrefix(v, "30101") {
		key = "0" + bik[4:6]
	}
	weights := make([]int, 23)
	for i := range weights {
		weights[i] = []int{7, 1, 3}[i%3]
	}
	if weighted(key+v, weights)%10 != 0 {
		return fail(KindAccount, v, CodeChecksum, "не сходится контрольная цифра: опечатка в счёте или счёт из другого банка")
	}
	facts := []Fact{}
	if kind := accountKinds[v[:5]]; kind != "" {
		facts = append(facts, Fact{"Вид", kind})
	}
	if cur := currencies[v[5:8]]; cur != "" {
		facts = append(facts, Fact{"Валюта", cur})
	} else {
		facts = append(facts, Fact{"Валюта", "код " + v[5:8]})
	}
	return ok(KindAccount, v, facts...)
}

// Балансовые счета, которые встречаются в реквизитах чаще всего.
var accountKinds = map[string]string{
	"30101": "корреспондентский счёт банка",
	"40702": "счёт организации",
	"40703": "счёт некоммерческой организации",
	"40802": "счёт ИП",
	"40817": "счёт физического лица",
}

var currencies = map[string]string{
	"810": "российский рубль",
	"643": "российский рубль",
	"840": "доллар США",
	"978": "евро",
	"156": "китайский юань",
}

// Card — номер банковской карты: 13–19 цифр, последняя проверяется
// алгоритмом Луна.
func Card(raw string) Result {
	v, bad := digitsCheck(KindCard, raw, "Номер карты", 13, 14, 15, 16, 17, 18, 19)
	if bad != nil {
		if bad.Code == CodeLength {
			bad.Message = "номер карты: от 13 до 19 цифр, а здесь " + itoa(len(v))
		}
		return *bad
	}
	sum := 0
	for i := 0; i < len(v); i++ {
		d := int(v[len(v)-1-i] - '0')
		if i%2 == 1 {
			d *= 2
			if d > 9 {
				d -= 9
			}
		}
		sum += d
	}
	if sum%10 != 0 {
		return fail(KindCard, v, CodeChecksum, "не сходится контрольная цифра (алгоритм Луна): в номере опечатка")
	}
	facts := []Fact{}
	if ps := paymentSystem(v); ps != "" {
		facts = append(facts, Fact{"Платёжная система", ps})
	}
	return ok(KindCard, v, facts...)
}

func paymentSystem(v string) string {
	p2, _ := strconv.Atoi(v[:2])
	p4, _ := strconv.Atoi(v[:4])
	switch {
	case p4 >= 2200 && p4 <= 2204:
		return "Мир"
	case v[0] == '4':
		return "Visa"
	case (p2 >= 51 && p2 <= 55) || (p4 >= 2221 && p4 <= 2720):
		return "Mastercard"
	case p2 == 34 || p2 == 37:
		return "American Express"
	case p4 >= 3528 && p4 <= 3589:
		return "JCB"
	case p2 == 62:
		return "UnionPay"
	}
	return ""
}
