package rekvizity

import (
	"encoding/json"
	"os"
	"slices"
	"testing"
)

type vectors struct {
	Cases []struct {
		Kind  Kind     `json:"kind"`
		Input string   `json:"input"`
		BIK   string   `json:"bik"`
		Valid bool     `json:"valid"`
		Code  string   `json:"code"`
		Fact  []string `json:"fact"`
	} `json:"cases"`
	Detect []struct {
		Input string `json:"input"`
		Kinds []Kind `json:"kinds"`
	} `json:"detect"`
}

func load(t *testing.T) vectors {
	t.Helper()
	b, err := os.ReadFile("testdata/cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var v vectors
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func check(kind Kind, input, bik string) Result {
	switch kind {
	case KindINN:
		return INN(input)
	case KindOGRN:
		return OGRN(input)
	case KindKPP:
		return KPP(input)
	case KindSNILS:
		return SNILS(input)
	case KindBIK:
		return BIK(input)
	case KindAccount:
		return Account(input, bik)
	case KindCard:
		return Card(input)
	}
	panic(kind)
}

// Общие примеры: те же проходит реализация на TypeScript (js/).
func TestSharedCases(t *testing.T) {
	for _, c := range load(t).Cases {
		r := check(c.Kind, c.Input, c.BIK)
		name := string(c.Kind) + " " + c.Input
		if r.Valid != c.Valid {
			t.Errorf("%s: valid=%v, ждали %v (%s)", name, r.Valid, c.Valid, r.Message)
			continue
		}
		if !c.Valid && r.Code != c.Code {
			t.Errorf("%s: код %q, ждали %q", name, r.Code, c.Code)
		}
		if !c.Valid && r.Message == "" {
			t.Errorf("%s: нет объяснения", name)
		}
		if len(c.Fact) == 2 && r.Fact(c.Fact[0]) != c.Fact[1] {
			t.Errorf("%s: %s = %q, ждали %q (%v)", name, c.Fact[0], r.Fact(c.Fact[0]), c.Fact[1], r.Facts)
		}
	}
}

func TestDetect(t *testing.T) {
	for _, c := range load(t).Detect {
		var got []Kind
		for _, r := range Detect(c.Input) {
			got = append(got, r.Kind)
		}
		if !slices.Equal(got, c.Kinds) && !(len(got) == 0 && len(c.Kinds) == 0) {
			t.Errorf("%q: %v, ждали %v", c.Input, got, c.Kinds)
		}
	}
}

// Любая одиночная опечатка в ИНН организации ловится: вес каждой позиции
// взаимно прост с 11, так что замена одной цифры меняет остаток.
func TestINNCatchesEverySingleTypo(t *testing.T) {
	const good = "7707083893"
	for pos := 0; pos < len(good); pos++ {
		for d := byte('0'); d <= '9'; d++ {
			if d == good[pos] {
				continue
			}
			bad := good[:pos] + string(d) + good[pos+1:]
			if r := INN(bad); r.Valid && bad[:2] != "00" {
				// Контрольная цифра — остаток по модулю 11, взятый ещё раз по
				// модулю 10: остатки 0 и 10 совпадают, такие опечатки
				// алгоритм пропускает. Проверяем, что это именно этот случай.
				if weighted(bad, []int{2, 4, 10, 3, 5, 9, 4, 6, 8})%11 != 10 &&
					weighted(good, []int{2, 4, 10, 3, 5, 9, 4, 6, 8})%11 != 10 {
					t.Errorf("опечатка %s принята", bad)
				}
			}
		}
	}
}

func FuzzDetect(f *testing.F) {
	for _, s := range []string{"7707083893", "044525225", "112-233-445 95", "4111 1111 1111 1111", "7736AB001"} {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, s string) {
		for _, r := range Detect(s) {
			if !r.Valid && r.Message == "" {
				t.Fatalf("%q: ошибка без объяснения", s)
			}
		}
	})
}
